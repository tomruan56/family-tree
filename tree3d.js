/* ============================================================
   3D TREE RENDERER  — Three.js + OrbitControls
   ============================================================ */
'use strict';

const Tree3D = (() => {
  /* ── Mirror the 2D layout constants (globals from app.js) ─── */
  const DEPTH = 140;   // Z units between each generation layer

  const TEX_W = 400, TEX_H = 152;   // 2× HiDPI canvas texture

  const GC = { male:'#3b82f6', female:'#ec4899', other:'#10b981', unknown:'#9ca3af' };
  const GB = { male:'#dbeafe', female:'#fce7f3', other:'#d1fae5', unknown:'#f3f4f6' };

  /* ── Module state ─────────────────────────────────────────── */
  let scene, camera, renderer, controls, raycaster, ptr;
  let nodeObjects = [];   // [{ mesh, personId }]
  let rafId;
  let _active = false;
  let _el;               // WebGL canvas element

  /* ── Rounded-rect canvas helper ──────────────────────────── */
  function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── Build a canvas texture for one person card ──────────── */
  function makeTexture(person, selected) {
    const c = document.createElement('canvas');
    c.width = TEX_W; c.height = TEX_H;
    const ctx = c.getContext('2d');

    const gc = GC[person.gender] || GC.unknown;
    const gb = GB[person.gender] || GB.unknown;
    const px = 6, py = 6, pw = TEX_W - 12, ph = TEX_H - 12, pr = 20;

    /* Drop shadow */
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.20)';
    ctx.shadowBlur    = 14;
    ctx.shadowOffsetY = 6;
    rrPath(ctx, px, py, pw, ph, pr);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();

    /* Card body */
    rrPath(ctx, px, py, pw, ph, pr);
    ctx.fillStyle = selected ? '#f0fdf4' : '#fff';
    ctx.fill();

    /* Top accent bar (clipped to card shape) */
    ctx.save();
    rrPath(ctx, px, py, pw, ph, pr);
    ctx.clip();
    ctx.fillStyle = gc;
    ctx.fillRect(px, py, pw, 9);
    ctx.restore();

    /* Card border */
    rrPath(ctx, px, py, pw, ph, pr);
    ctx.strokeStyle = selected ? '#2d6a4f' : '#e0e0ea';
    ctx.lineWidth   = selected ? 5 : 2.5;
    ctx.stroke();

    /* Avatar circle */
    const AX = 64, AY = TEX_H / 2 + 4, AR = 44;
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.fillStyle = gb;
    ctx.fill();
    ctx.strokeStyle = gc;
    ctx.lineWidth = 3;
    ctx.stroke();

    /* Initials */
    const ini = getInitials(person);
    ctx.fillStyle    = gc;
    ctx.font         = `bold ${ini.length > 1 ? 26 : 32}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ini, AX, AY);

    /* Name */
    const name = getDisplayName(person);
    ctx.fillStyle    = '#1a1a2e';
    ctx.font         = 'bold 24px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(clip(name, 18), 124, TEX_H / 2 - 14);

    /* Dates */
    const by = year(person.birthDate), dy = year(person.deathDate);
    const ds = by && dy ? `${by}–${dy}` : by ? `${i18n.t('bornAbbr')} ${by}` : '';
    if (ds) {
      ctx.fillStyle = '#9ca3af';
      ctx.font      = '20px sans-serif';
      ctx.fillText(ds, 124, TEX_H / 2 + 18);
    }

    return new THREE.CanvasTexture(c);
  }

  /* ── Build one PlaneGeometry mesh for a person ───────────── */
  function makeNodeMesh(person, selected, z) {
    const tex = makeTexture(person, selected);
    const geo = new THREE.PlaneGeometry(NODE_W, NODE_H);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(person.x + NODE_W / 2, -(person.y + NODE_H / 2), z);
    return mesh;
  }

  /* ── Pointer helpers (distinguish click vs drag) ─────────── */
  let _pDown = null, _moved = false;

  function onPtrDown(e) {
    _pDown = { x: e.clientX, y: e.clientY };
    _moved = false;
  }
  function onPtrMove(e) {
    if (!_pDown) return;
    const dx = e.clientX - _pDown.x, dy = e.clientY - _pDown.y;
    if (dx * dx + dy * dy > 36) _moved = true;
  }
  function onPtrUp(e) {
    if (_moved || !_pDown) { _pDown = null; return; }
    _pDown = null;

    const rect = _el.getBoundingClientRect();
    ptr.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    ptr.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(ptr, camera);
    const hits = raycaster.intersectObjects(nodeObjects.map(o => o.mesh));

    if (hits.length) {
      const hit = nodeObjects.find(o => o.mesh === hits[0].object);
      if (hit) { state.selectedId = hit.personId; refresh(); renderSidebar(); }
    } else {
      state.selectedId = null; refresh(); renderSidebar();
    }
  }

  /* ── Clear scene of node meshes + edge lines ─────────────── */
  function clearScene() {
    nodeObjects.forEach(o => {
      scene.remove(o.mesh);
      o.mesh.geometry.dispose();
      o.mesh.material.map.dispose();
      o.mesh.material.dispose();
    });
    nodeObjects = [];

    for (let i = scene.children.length - 1; i >= 0; i--) {
      const c = scene.children[i];
      if (c.userData.isEdge) {
        scene.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
  }

  /* ── Map a layout Y value → generation index ─────────────── */
  function closestGenIdx(yTarget, yVals) {
    let best = 0, bestDist = Infinity;
    yVals.forEach((yv, i) => {
      const d = Math.abs(yv - yTarget);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  /* ── Rebuild scene from current layout ───────────────────── */
  function refresh() {
    if (!scene) return;
    clearScene();

    const { nodes, edges } = buildLayout();
    if (!nodes.length) return;

    /* Collect distinct Y values (one per generation row) */
    const yVals = [...new Set(nodes.map(n => n.y))].sort((a, b) => a - b);
    const nodeZmap = {};
    nodes.forEach(n => {
      nodeZmap[n.id] = -yVals.indexOf(n.y) * DEPTH;
    });

    /* ── Node planes ── */
    nodes.forEach(person => {
      const mesh = makeNodeMesh(person, person.id === state.selectedId, nodeZmap[person.id]);
      scene.add(mesh);
      nodeObjects.push({ mesh, personId: person.id });
    });

    /* ── Edges ── */
    edges.forEach(e => {
      let geo, mat;

      if (e.type === 'parent-child') {
        /* Infer parent & child Y from edge endpoint values:
           e.y1 = pp.y + NODE_H  →  pp.y = e.y1 - NODE_H
           e.y2 = cp.y           →  cp.y = e.y2               */
        const z1 = -closestGenIdx(e.y1 - NODE_H, yVals) * DEPTH;
        const z2 = -closestGenIdx(e.y2,           yVals) * DEPTH;

        /* 4-point polyline approximating a bezier */
        const t = e.y2 - e.y1;
        const pts = [
          new THREE.Vector3(e.x1, -e.y1,          z1),
          new THREE.Vector3(e.x1, -(e.y1 + t*0.4), z1 + (z2-z1)*0.4),
          new THREE.Vector3(e.x2, -(e.y2 - t*0.4), z1 + (z2-z1)*0.6),
          new THREE.Vector3(e.x2, -e.y2,          z2),
        ];
        geo = new THREE.BufferGeometry().setFromPoints(pts);
        mat = new THREE.LineBasicMaterial({ color: 0xa0a8b8 });
      } else {
        /* Spouse edge — horizontal, same Z layer */
        const z = -closestGenIdx(e.y1 - NODE_H / 2, yVals) * DEPTH;
        geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(e.x1, -e.y1, z),
          new THREE.Vector3(e.x2, -e.y2, z),
        ]);
        mat = new THREE.LineBasicMaterial({ color: 0xf472b6 });
      }

      const line = new THREE.Line(geo, mat);
      line.userData.isEdge = true;
      scene.add(line);
    });
  }

  /* ── Fit camera to contain all nodes ─────────────────────── */
  function fitCamera() {
    const { nodes } = buildLayout();
    if (!nodes.length) return;

    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + NODE_W;
    const y0 = Math.min(...ys), y1 = Math.max(...ys) + NODE_H;

    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const yVals = [...new Set(ys)].sort((a, b) => a - b);
    const maxZ  = -(yVals.length - 1) * DEPTH;
    const cz    = maxZ / 2;

    const spread = Math.max(x1 - x0, y1 - y0);
    const depth  = Math.abs(maxZ);
    const dist   = spread * 1.1 + depth * 0.5;

    controls.target.set(cx, -cy, cz);
    /* Tilt slightly from above to reveal the Z-depth layers */
    camera.position.set(cx + spread * 0.04, -cy + spread * 0.28, cz + dist);
    camera.lookAt(cx, -cy, cz);
    controls.update();
  }

  /* ── Initialise Three.js (called once at startup) ─────────── */
  function init() {
    const wrap = document.getElementById('tree-container');
    const W = wrap.clientWidth, H = wrap.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);

    camera = new THREE.PerspectiveCamera(50, W / H, 1, 15000);
    camera.position.set(0, 0, 1200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    _el    = renderer.domElement;
    _el.id = 'tree-3d-canvas';
    _el.style.cssText = 'position:absolute;inset:0;display:none;touch-action:none;';
    wrap.appendChild(_el);

    controls = new THREE.OrbitControls(camera, _el);
    controls.enableDamping     = true;
    controls.dampingFactor     = 0.10;
    controls.screenSpacePanning = true;
    controls.minDistance       = 80;
    controls.maxDistance       = 8000;
    controls.rotateSpeed       = 0.55;
    controls.zoomSpeed         = 1.1;

    raycaster = new THREE.Raycaster();
    ptr       = new THREE.Vector2();

    _el.addEventListener('pointerdown', onPtrDown);
    _el.addEventListener('pointermove', onPtrMove);
    _el.addEventListener('pointerup',   onPtrUp);

    /* Ambient light — enough for MeshBasicMaterial (it ignores light anyway) */
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    window.addEventListener('resize', () => {
      if (!_active) return;
      const W = wrap.clientWidth, H = wrap.clientHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    });
  }

  /* ── Mode activate / deactivate ───────────────────────────── */
  function activate() {
    _active = true;
    _el.style.display = 'block';
    refresh();
    fitCamera();
    loop();
  }

  function deactivate() {
    _active = false;
    _el.style.display = 'none';
    cancelAnimationFrame(rafId);
  }

  function loop() {
    if (!_active) return;
    rafId = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }

  /* ── Zoom the 3D camera toward / away from orbit target ─── */
  function zoom(factor) {
    if (!_active || !controls) return;
    const dir = camera.position.clone().sub(controls.target);
    dir.multiplyScalar(1 / factor);
    camera.position.copy(controls.target.clone().add(dir));
    controls.update();
  }

  /* ── Public API ───────────────────────────────────────────── */
  return { init, refresh, activate, deactivate, fitCamera, zoom };
})();

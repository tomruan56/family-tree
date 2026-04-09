/* ============================================================
   FAMILY TREE APP — Multi-family edition
   ============================================================ */

// ============================================================
// STORAGE KEYS
// ============================================================

const CURRENT_KEY  = 'familytree_current';   // id of the active family
const DEVICE_KEY   = 'familytree_device_id'; // anonymous device identifier

// ============================================================
// STATE
// ============================================================

const state = {
  people:          {},
  families:        [],   // loaded from server
  selectedId:      null,
  pendingRelation: null,
};

// ── Device ID: stable anonymous identifier stored in localStorage ──
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// ============================================================
// API LAYER
// ============================================================

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

// ============================================================
// FAMILY INDEX  (in-memory, synced from server)
// ============================================================

function loadFamilies() {
  return { families: state.families };
}

function getCurrentFamilyId() {
  return localStorage.getItem(CURRENT_KEY) || null;
}

function setCurrentFamilyId(id) {
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else    localStorage.removeItem(CURRENT_KEY);
}

function generateFamilyId() {
  return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ============================================================
// PEOPLE DATA
// ============================================================

async function loadData() {
  const id = getCurrentFamilyId();
  if (!id) { state.people = {}; return; }
  const data = await apiFetch(`/api/families/${id}/people`);
  state.people = (data && typeof data === 'object') ? data : {};
}

function saveData() {
  const id = getCurrentFamilyId();
  if (!id) return;
  apiFetch(`/api/families/${id}/people`, {
    method: 'PUT',
    body: JSON.stringify(state.people),
  });
}

function generateId() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getAllPeople()  { return Object.values(state.people); }
function getPerson(id)  { return state.people[id] || null; }

function addPerson(data) {
  const id = generateId();
  state.people[id] = { id, firstName: '', lastName: '', maidenName: '', gender: 'unknown',
    birthDate: '', birthPlace: '', deathDate: '', deathPlace: '', photo: '', notes: '',
    parentIds: [], spouseIds: [], ...data, id };
  saveData();
  return id;
}

function updatePerson(id, data) {
  if (!state.people[id]) return;
  state.people[id] = { ...state.people[id], ...data };
  saveData();
}

function deletePerson(id) {
  Object.values(state.people).forEach(p => {
    p.parentIds = (p.parentIds || []).filter(x => x !== id);
    p.spouseIds = (p.spouseIds || []).filter(x => x !== id);
  });
  delete state.people[id];
  saveData();
}

// ============================================================
// RELATIONSHIP HELPERS
// ============================================================

function getParents(pid)  { const p = getPerson(pid); return p ? (p.parentIds||[]).map(getPerson).filter(Boolean) : []; }
function getSpouses(pid)  { const p = getPerson(pid); return p ? (p.spouseIds||[]).map(getPerson).filter(Boolean) : []; }
function getChildren(pid) { return getAllPeople().filter(p => (p.parentIds||[]).includes(pid)); }
function getSiblings(pid) {
  const p = getPerson(pid);
  if (!p || !(p.parentIds||[]).length) return [];
  const s = new Set();
  (p.parentIds||[]).forEach(id => getChildren(id).forEach(c => { if (c.id !== pid) s.add(c); }));
  return [...s];
}

function addRelationship(type, sourceId, targetId) {
  const src = getPerson(sourceId), tgt = getPerson(targetId);
  if (!src || !tgt || sourceId === targetId) return;

  switch (type) {
    case 'parent':
      if (!(src.parentIds||[]).includes(targetId)) {
        if ((src.parentIds||[]).length >= 2) { showToast(i18n.t('toastMaxParents'), 'error'); return false; }
        src.parentIds = [...(src.parentIds||[]), targetId];
      }
      break;
    case 'child':
      if (!(tgt.parentIds||[]).includes(sourceId)) {
        if ((tgt.parentIds||[]).length >= 2) { showToast(i18n.t('toast2Parents'), 'error'); return false; }
        tgt.parentIds = [...(tgt.parentIds||[]), sourceId];
      }
      break;
    case 'spouse':
      if (!(src.spouseIds||[]).includes(targetId)) src.spouseIds = [...(src.spouseIds||[]), targetId];
      if (!(tgt.spouseIds||[]).includes(sourceId)) tgt.spouseIds = [...(tgt.spouseIds||[]), sourceId];
      break;
    case 'sibling': {
      const sp = src.parentIds||[], tp = tgt.parentIds||[];
      if (!sp.length && !tp.length) { showToast(i18n.t('toastNeedParents'), 'error'); return false; }
      const shared = [...new Set([...sp, ...tp])].slice(0, 2);
      src.parentIds = shared; tgt.parentIds = shared;
      break;
    }
  }
  saveData();
  return true;
}

// ============================================================
// FAMILY MANAGEMENT — UI actions
// ============================================================

function openFamiliesModal() {
  renderFamiliesList();
  document.getElementById('new-family-name').value = '';
  openModal('modal-families');
  setTimeout(() => document.getElementById('new-family-name').focus(), 80);
}

function renderFamiliesList() {
  const { families } = loadFamilies();
  const currentId    = getCurrentFamilyId();
  const container    = document.getElementById('families-list');

  if (!families.length) {
    container.innerHTML = `<div class="families-empty">${i18n.t('noFamilies')}</div>`;
    return;
  }

  container.innerHTML = families.map(f => {
    const isCurrent = f.id === currentId;
    return `
      <div class="family-item ${isCurrent ? 'active' : ''}">
        <div class="family-item-name">
          <i class="fas fa-users"></i>
          <span title="${esc(f.name)}">${esc(f.name)}</span>
        </div>
        <div class="family-item-actions">
          ${isCurrent
            ? `<span class="family-badge">${i18n.t('currentFamily')}</span>`
            : `<button class="btn btn-secondary btn-sm" onclick="switchFamily('${f.id}')">
                 ${i18n.t('btnOpen')}
               </button>`}
          <button class="btn-icon" title="${i18n.t('btnRename')}"
            onclick="renameFamilyUI('${f.id}', '${esc(f.name)}')">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-icon btn-icon-danger" title="${i18n.t('btnDelete')}"
            onclick="deleteFamilyUI('${f.id}', '${esc(f.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

async function createFamilyFromModal() {
  const input = document.getElementById('new-family-name');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }
  input.value = '';
  closeModal('modal-families');
  await _createFamily(name);
}

async function createFamilyFromWelcome() {
  const input = document.getElementById('welcome-family-name');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }
  hideWelcomeScreen();
  await _createFamily(name);
}

async function _createFamily(name) {
  const id        = generateFamilyId();
  const createdAt = new Date().toISOString();
  const result    = await apiFetch('/api/families', {
    method: 'POST',
    body: JSON.stringify({ id, name, createdAt }),
  });
  if (!result) return;
  state.families.push({ id, name, createdAt });
  await _switchTo(id);
  showToast(i18n.t('toastFamilyCreated'), 'success');
}

async function switchFamily(id) {
  const family = state.families.find(f => f.id === id);
  await _switchTo(id);
  closeModal('modal-families');
  if (family) showToast(i18n.t('toastFamilySwitched', family.name), 'success');
}

async function _switchTo(id) {
  setCurrentFamilyId(id);
  state.selectedId = null;
  await loadData();
  updateFamilyHeader();
  renderTree();
  renderSidebar();
  if (getAllPeople().length > 0) setTimeout(fitTree, 200);
}

async function renameFamilyUI(id, currentName) {
  const newName = window.prompt(i18n.t('renameFamilyPrompt'), currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;
  const result = await apiFetch(`/api/families/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: newName.trim() }),
  });
  if (!result) return;
  const family = state.families.find(f => f.id === id);
  if (family) family.name = newName.trim();
  renderFamiliesList();
  updateFamilyHeader();
  showToast(i18n.t('toastFamilyRenamed'), 'success');
}

async function deleteFamilyUI(id, name) {
  if (!confirm(i18n.t('confirmDeleteFamily', name))) return;
  const result = await apiFetch(`/api/families/${id}`, { method: 'DELETE' });
  if (!result) return;
  state.families = state.families.filter(f => f.id !== id);

  if (getCurrentFamilyId() === id) {
    if (state.families.length > 0) {
      await _switchTo(state.families[0].id);
    } else {
      setCurrentFamilyId(null);
      state.people     = {};
      state.selectedId = null;
      updateFamilyHeader();
      renderTree();
      renderSidebar();
      showWelcomeScreen();
    }
  }

  showToast(i18n.t('toastFamilyDeleted'), 'success');
  renderFamiliesList();
}

function updateFamilyHeader() {
  const { families } = loadFamilies();
  const currentId    = getCurrentFamilyId();
  const family       = families.find(f => f.id === currentId);
  const el           = document.getElementById('current-family-name');
  if (el) el.textContent = family ? family.name : i18n.t('appTitle');
}

// ============================================================
// WELCOME SCREEN
// ============================================================

function showWelcomeScreen() {
  document.getElementById('welcome-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('welcome-family-name').focus(), 80);
}

function hideWelcomeScreen() {
  document.getElementById('welcome-overlay').classList.add('hidden');
}

// ============================================================
// LAYOUT ENGINE
// ============================================================

const NODE_W = 200, NODE_H = 76, H_GAP = 36, V_GAP = 90;

function buildLayout() {
  const people = getAllPeople();
  if (!people.length) return { nodes: [], edges: [] };

  // ── Step 1: initial generation via BFS from roots ──────────────
  const gen   = new Map();
  const roots = people.filter(p => !(p.parentIds||[]).length);
  if (!roots.length) roots.push(people[0]);

  const queue = roots.map(r => ({ id: r.id, g: 0 }));
  while (queue.length) {
    const { id, g } = queue.shift();
    if (gen.has(id) && gen.get(id) >= g) continue;
    gen.set(id, g);
    getChildren(id).forEach(c => queue.push({ id: c.id, g: g + 1 }));
  }
  people.forEach(p => {
    if (!gen.has(p.id)) {
      const pg = (p.parentIds||[]).map(pid => gen.get(pid)).filter(v => v != null);
      gen.set(p.id, pg.length ? Math.max(...pg) + 1 : 0);
    }
  });

  // ── Step 2: enforce constraints until stable ───────────────────
  //   • spouses share the same (max) generation
  //   • children are strictly below every parent
  let changed = true, iters = 0;
  while (changed && iters++ < 30) {
    changed = false;
    people.forEach(p => {
      (p.spouseIds||[]).forEach(sid => {
        const mg = Math.max(gen.get(p.id)||0, gen.get(sid)||0);
        if ((gen.get(p.id)||0) !== mg) { gen.set(p.id, mg); changed = true; }
        if ((gen.get(sid)||0) !== mg)  { gen.set(sid,  mg); changed = true; }
      });
    });
    people.forEach(child => {
      const need = Math.max(...(child.parentIds||[]).map(pid => (gen.get(pid)||0) + 1), 0);
      if ((gen.get(child.id)||0) < need) { gen.set(child.id, need); changed = true; }
    });
  }

  // ── Step 3: bucket people by generation ────────────────────────
  const byGen = new Map();
  people.forEach(p => {
    const g = gen.get(p.id) || 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(p);
  });

  // ── Step 4: x-layout row by row ────────────────────────────────
  const pos = new Map();
  [...byGen.keys()].sort((a, b) => a - b).forEach((g, rowIdx) => {
    const row = byGen.get(g);
    const y   = rowIdx * (NODE_H + V_GAP) + 40;

    // Build spouse clusters: each cluster is an array of people
    // who are married to each other within this row.
    const inRow   = new Set(row.map(p => p.id));
    const visited = new Set();
    const clusters = [];
    row.forEach(p => {
      if (visited.has(p.id)) return;
      visited.add(p.id);
      const cluster = [p];
      (p.spouseIds||[]).forEach(sid => {
        if (inRow.has(sid) && !visited.has(sid)) {
          visited.add(sid);
          cluster.push(getPerson(sid));
        }
      });
      clusters.push(cluster);
    });

    // Sort clusters: those with positioned parents come first, ordered by parent midpoint X.
    clusters.forEach(cluster => {
      const xs = [];
      cluster.forEach(p => {
        (p.parentIds||[]).forEach(pid => {
          const pp = pos.get(pid);
          if (pp) xs.push(pp.x + NODE_W / 2);
        });
      });
      cluster._anchorX = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
    clusters.sort((a, b) => {
      if (a._anchorX == null && b._anchorX == null) return 0;
      if (a._anchorX == null) return 1;
      if (b._anchorX == null) return -1;
      return a._anchorX - b._anchorX;
    });

    // Place clusters left-to-right, centred around 0.
    const totalW = row.length * NODE_W + (row.length - 1) * H_GAP;
    let x = -totalW / 2;
    clusters.forEach(cluster => {
      cluster.forEach(p => {
        pos.set(p.id, { x, y });
        x += NODE_W + H_GAP;
      });
    });
  });

  // ── Step 5: build nodes & edges ────────────────────────────────
  const nodes = people.map(p => ({ ...p, ...(pos.get(p.id) || { x: 0, y: 0 }) }));
  const edges = [];

  people.forEach(child => {
    (child.parentIds||[]).forEach(pid => {
      const pp = pos.get(pid), cp = pos.get(child.id);
      if (pp && cp) edges.push({ type: 'parent-child',
        x1: pp.x + NODE_W/2, y1: pp.y + NODE_H,
        x2: cp.x + NODE_W/2, y2: cp.y });
    });
  });

  const seenEdge = new Set();
  people.forEach(p => {
    (p.spouseIds||[]).forEach(sid => {
      const key = [p.id, sid].sort().join('|');
      if (seenEdge.has(key)) return; seenEdge.add(key);
      const p1 = pos.get(p.id), p2 = pos.get(sid);
      if (p1 && p2) edges.push({ type: 'spouse',
        x1: p1.x + (p1.x <= p2.x ? NODE_W : 0), y1: p1.y + NODE_H/2,
        x2: p2.x + (p2.x <= p1.x ? NODE_W : 0), y2: p2.y + NODE_H/2 });
    });
  });

  return { nodes, edges };
}

// ============================================================
// RENDERING
// ============================================================

const GENDER_COLOR = { male:'#3b82f6', female:'#ec4899', other:'#10b981', unknown:'#9ca3af' };
const GENDER_BG    = { male:'#dbeafe', female:'#fce7f3', other:'#d1fae5', unknown:'#f3f4f6' };

let svg, treeGroup, zoomBehavior;

function initTree() {
  svg        = d3.select('#tree-svg');
  treeGroup  = d3.select('#tree-group');
  zoomBehavior = d3.zoom().scaleExtent([0.08,3])
    .on('zoom', ev => treeGroup.attr('transform', ev.transform));
  svg.call(zoomBehavior);
  svg.on('click', function(ev) {
    if (ev.target === this) { state.selectedId = null; renderTree(); renderSidebar(); }
  });
  d3.select('#btn-zoom-in').on('click',  () => svg.transition().duration(250).call(zoomBehavior.scaleBy, 1.3));
  d3.select('#btn-zoom-out').on('click', () => svg.transition().duration(250).call(zoomBehavior.scaleBy, 0.77));
  d3.select('#btn-zoom-fit').on('click', fitTree);
}

function renderTree() {
  const people = getAllPeople();
  document.getElementById('empty-state').classList.toggle('hidden', people.length > 0);

  const { nodes, edges } = buildLayout();
  const edgesG = d3.select('#edges-group'); edgesG.selectAll('*').remove();
  const nodesG = d3.select('#nodes-group'); nodesG.selectAll('*').remove();

  edges.forEach(e => {
    if (e.type === 'parent-child') {
      edgesG.append('path').attr('fill','none').attr('stroke','#c8ccd8').attr('stroke-width',2)
        .attr('d', `M${e.x1},${e.y1} C${e.x1},${e.y1+V_GAP*.4} ${e.x2},${e.y2-V_GAP*.4} ${e.x2},${e.y2}`);
    } else {
      edgesG.append('line').attr('x1',e.x1).attr('y1',e.y1).attr('x2',e.x2).attr('y2',e.y2)
        .attr('stroke','#f472b6').attr('stroke-width',1.8).attr('stroke-dasharray','5 3.5');
    }
  });
  nodes.forEach(p => drawPersonNode(nodesG, p));
}

function drawPersonNode(container, person) {
  const sel = person.id === state.selectedId;
  const gc  = GENDER_COLOR[person.gender] || GENDER_COLOR.unknown;
  const gb  = GENDER_BG[person.gender]    || GENDER_BG.unknown;
  const AX  = 32, AY = NODE_H/2+2, AR = 22;

  const g = container.append('g')
    .attr('transform', `translate(${person.x},${person.y})`)
    .style('cursor','pointer');

  g.append('rect').attr('width',NODE_W).attr('height',NODE_H).attr('rx',10)
    .attr('fill','#fff').attr('stroke', sel?'#2d6a4f':'#e0e0ea')
    .attr('stroke-width', sel?2.5:1.5).attr('filter','url(#shadow)');
  g.append('rect').attr('width',NODE_W).attr('height',4).attr('rx',10).attr('fill',gc);
  g.append('circle').attr('cx',AX).attr('cy',AY).attr('r',AR)
    .attr('fill',gb).attr('stroke',gc).attr('stroke-width',1.5);

  if (person.photo) {
    const cid = 'clip-'+person.id;
    g.append('clipPath').attr('id',cid).append('circle').attr('cx',AX).attr('cy',AY).attr('r',AR-1);
    g.append('image').attr('href',person.photo)
      .attr('x',AX-AR+1).attr('y',AY-AR+1).attr('width',(AR-1)*2).attr('height',(AR-1)*2)
      .attr('clip-path',`url(#${cid})`).attr('preserveAspectRatio','xMidYMid slice');
  } else {
    const ini = getInitials(person);
    g.append('text').attr('x',AX).attr('y',AY).attr('text-anchor','middle')
      .attr('dominant-baseline','central').attr('font-size', ini.length>1?'13px':'16px')
      .attr('font-weight','600').attr('fill',gc).attr('font-family','Inter,sans-serif').text(ini);
  }

  const fullName = getDisplayName(person);
  g.append('text').attr('x',62).attr('y',NODE_H/2-7).attr('font-size','12.5px')
    .attr('font-weight','600').attr('fill','#1a1a2e').attr('font-family','Inter,sans-serif')
    .text(clip(fullName,20));

  const by = year(person.birthDate), dy = year(person.deathDate);
  const ds = by&&dy ? `${by}–${dy}` : by ? `${i18n.t('bornAbbr')} ${by}` : dy ? `${i18n.t('diedAbbr')} ${dy}` : '';
  if (ds) g.append('text').attr('x',62).attr('y',NODE_H/2+10).attr('font-size','11px')
    .attr('fill','#9ca3af').attr('font-family','Inter,sans-serif').text(ds);

  if (person.deathDate) g.append('text').attr('x',NODE_W-8).attr('y',NODE_H-7)
    .attr('text-anchor','end').attr('font-size','11px').attr('fill','#c8ccd8').text('†');

  g.on('click', ev => { ev.stopPropagation(); state.selectedId = person.id; renderTree(); renderSidebar(); });

  // Quick-add relation buttons (shown on hover)
  const quickBtns = [
    { type:'parent',  x: NODE_W/2, y: -13,       color:'#3b82f6', icon:'↑', label: i18n.t('relTypeParent') },
    { type:'child',   x: NODE_W/2, y: NODE_H+13,  color:'#10b981', icon:'↓', label: i18n.t('relTypeChild')  },
    { type:'spouse',  x: NODE_W+13, y: NODE_H/2,  color:'#ec4899', icon:'♥', label: i18n.t('relTypeSpouse') },
  ];

  const actionsG = g.append('g').attr('class','node-quick-btns').style('opacity',0).style('pointer-events','none');

  quickBtns.forEach(b => {
    const bg = actionsG.append('g')
      .style('cursor','pointer')
      .on('click', ev => { ev.stopPropagation(); openAddRelationWithType(person.id, b.type); })
      .on('mouseenter', function() { d3.select(this).select('circle').attr('r', 13); })
      .on('mouseleave', function() { d3.select(this).select('circle').attr('r', 11); });

    bg.append('title').text(b.label);
    bg.append('circle').attr('cx',b.x).attr('cy',b.y).attr('r',11)
      .attr('fill',b.color).attr('stroke','#fff').attr('stroke-width',2);
    bg.append('text').attr('x',b.x).attr('y',b.y).attr('text-anchor','middle')
      .attr('dominant-baseline','central').attr('font-size','11px').attr('fill','#fff')
      .style('pointer-events','none').text(b.icon);
  });

  g.on('mouseenter', function() {
    d3.select(this).select('.node-quick-btns')
      .transition().duration(120).style('opacity',1).style('pointer-events','all');
  }).on('mouseleave', function() {
    d3.select(this).select('.node-quick-btns')
      .transition().duration(120).style('opacity',0).style('pointer-events','none');
  });
}

function fitTree() {
  const { nodes } = buildLayout();
  if (!nodes.length) return;
  const svgEl = document.getElementById('tree-svg');
  const W = svgEl.clientWidth, H = svgEl.clientHeight, pad = 60;
  const minX = Math.min(...nodes.map(n=>n.x)), maxX = Math.max(...nodes.map(n=>n.x+NODE_W));
  const minY = Math.min(...nodes.map(n=>n.y)), maxY = Math.max(...nodes.map(n=>n.y+NODE_H));
  const cw = maxX-minX, ch = maxY-minY;
  const scale = Math.min((W-pad*2)/cw, (H-pad*2)/ch, 1.6);
  svg.transition().duration(500).call(zoomBehavior.transform,
    d3.zoomIdentity.translate((W-cw*scale)/2-minX*scale, (H-ch*scale)/2-minY*scale).scale(scale));
}

// ============================================================
// SIDEBAR
// ============================================================

function renderSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const content  = document.getElementById('sidebar-content');

  if (!state.selectedId) {
    sidebar.classList.add('hidden');
    overlay && overlay.classList.remove('visible');
    return;
  }
  const person = getPerson(state.selectedId);
  if (!person) {
    sidebar.classList.add('hidden');
    overlay && overlay.classList.remove('visible');
    return;
  }
  sidebar.classList.remove('hidden');
  if (overlay && isMobile()) overlay.classList.add('visible');
  if (isMobile()) setTimeout(() => panToNode(state.selectedId), 50);

  const parents  = getParents(state.selectedId);
  const spouses  = getSpouses(state.selectedId);
  const children = getChildren(state.selectedId);
  const siblings = getSiblings(state.selectedId);

  const fullName = getDisplayName(person);
  const gc       = GENDER_COLOR[person.gender] || GENDER_COLOR.unknown;
  const by       = person.birthDate ? formatDate(person.birthDate) : null;
  const dy       = person.deathDate ? formatDate(person.deathDate) : null;
  const datesLine = by&&dy ? `${by} – ${dy}` : by ? `${i18n.t('bornAbbr')} ${by}` : dy ? `${i18n.t('diedAbbr')} ${dy}` : '';

  const avatarHtml = person.photo
    ? `<img src="${esc(person.photo)}" alt="" onerror="this.style.display='none'">`
    : `<div class="sb-avatar-placeholder" style="background:${gc}">${getInitials(person)}</div>`;

  let html = `
    <div class="sb-person-header">
      <div class="sb-avatar">${avatarHtml}</div>
      <div class="sb-name">${esc(fullName)}</div>
      ${datesLine ? `<div class="sb-dates">${esc(datesLine)}</div>` : ''}
    </div>
    <div class="sb-section">
      <div class="sb-section-title">${i18n.t('sbDetails')}</div>
      ${sbRow('venus-mars',    i18n.t('displayGender', person.gender))}
      ${person.birthDate ? sbRow('birthday-cake', `${formatDate(person.birthDate)}${person.birthPlace?' · '+esc(person.birthPlace):''}`) : ''}
      ${person.deathDate ? sbRow('cross',         `${formatDate(person.deathDate)}${person.deathPlace?' · '+esc(person.deathPlace):''}`) : ''}
      ${person.maidenName ? sbRow('tag', `${i18n.t('nickname')}: ${esc(person.maidenName)}`) : ''}
      ${person.notes ? sbRow('sticky-note', esc(person.notes)) : ''}
    </div>`;

  if (parents.length)  html += relSection(i18n.t('sbParents'),                                   parents,  'relLabelParent',  state.selectedId, 'parent');
  if (spouses.length)  html += relSection(i18n.t(spouses.length>1?'sbSpouses':'sbSpouse'),        spouses,  'relLabelSpouse',  state.selectedId, 'spouse');
  if (children.length) html += relSection(i18n.t('sbChildren', children.length),                 children, 'relLabelChild',   state.selectedId, 'child');
  if (siblings.length) html += relSection(i18n.t('sbSiblings', siblings.length),                 siblings, 'relLabelSibling', state.selectedId, null);

  html += `
    <div class="sb-actions">
      <button class="btn btn-secondary" onclick="openEditPersonModal('${person.id}')">
        <i class="fas fa-pen"></i> ${i18n.t('btnEdit')}
      </button>
      <button class="btn btn-secondary" onclick="openAddRelationModal('${person.id}')">
        <i class="fas fa-link"></i> ${i18n.t('btnRelate')}
      </button>
      <button class="btn btn-danger" style="flex:0;padding:7px 10px" onclick="confirmDelete('${person.id}')">
        <i class="fas fa-trash"></i>
      </button>
    </div>`;

  content.innerHTML = html;
}

function sbRow(icon, text) {
  if (!text) return '';
  return `<div class="sb-detail-row"><i class="fas fa-${icon}"></i><span>${text}</span></div>`;
}

function relSection(title, people, labelKey, selectedId, relType) {
  return `
    <div class="sb-section">
      <div class="sb-section-title">${title}</div>
      <ul class="rel-list">${people.map(p => relItem(p, i18n.t(labelKey), selectedId, relType)).join('')}</ul>
    </div>`;
}

function relItem(person, label, selectedId, relType) {
  const gc       = GENDER_COLOR[person.gender] || GENDER_COLOR.unknown;
  const fullName = getDisplayName(person);
  const by = year(person.birthDate), dy = year(person.deathDate);
  const dates = by&&dy ? `${by}–${dy}` : by ? `${i18n.t('bornAbbr')} ${by}` : '';
  const av = person.photo
    ? `<img src="${esc(person.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<div class="rel-avatar-ph" style="background:${gc}">${getInitials(person)}</div>`;
  const deleteBtn = (selectedId && relType && relType !== 'sibling')
    ? `<button class="rel-unlink-btn" title="${i18n.t('unlinkRel')}"
         onclick="event.stopPropagation();confirmUnlinkRel('${relType}','${selectedId}','${person.id}')">
         <i class="fas fa-unlink"></i></button>`
    : '';
  return `
    <li class="rel-item" onclick="state.selectedId='${person.id}';renderTree();renderSidebar()">
      <div class="rel-avatar">${av}</div>
      <div class="rel-info">
        <div class="rel-name">${esc(fullName)}</div>
        <div class="rel-label">${label}${dates?' · '+dates:''}</div>
      </div>
      ${deleteBtn}
      <i class="fas fa-chevron-right" style="color:#ddd;font-size:0.7rem;flex-shrink:0"></i>
    </li>`;
}

// ============================================================
// MODAL: ADD / EDIT PERSON
// ============================================================

function setPhotoPreview(url) {
  const preview = document.getElementById('photo-preview');
  const img     = document.getElementById('photo-preview-img');
  if (url) {
    img.src = url;
    preview.classList.remove('hidden');
  } else {
    img.src = '';
    preview.classList.add('hidden');
  }
}

function previewPhotoUrl(url) {
  setPhotoPreview(url.trim() || '');
}

function clearPhoto() {
  document.getElementById('person-photo').value = '';
  document.getElementById('person-photo-file').value = '';
  setPhotoPreview('');
}

async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('photo', file);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'X-Device-Id': getDeviceId() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data.url) { showToast(i18n.t('toastUploadFailed'), 'error'); return; }
    document.getElementById('person-photo').value = data.url;
    setPhotoPreview(data.url);
  } catch {
    showToast(i18n.t('toastUploadFailed'), 'error');
  }
}

function openAddPersonModal(presets = {}) {
  document.getElementById('modal-person-title').textContent = i18n.t('addPersonTitle');
  document.getElementById('person-id').value          = '';
  document.getElementById('person-firstname').value   = presets.firstName || '';
  document.getElementById('person-lastname').value    = presets.lastName  || '';
  document.getElementById('person-maiden').value      = '';
  document.getElementById('person-gender').value      = presets.gender    || 'unknown';
  document.getElementById('person-birth-date').value  = '';
  document.getElementById('person-birth-place').value = '';
  document.getElementById('person-death-date').value  = '';
  document.getElementById('person-death-place').value = '';
  document.getElementById('person-photo').value       = '';
  document.getElementById('person-photo-file').value  = '';
  document.getElementById('person-notes').value       = '';
  setPhotoPreview('');
  openModal('modal-person');
  setTimeout(() => document.getElementById('person-firstname').focus(), 80);
}

function openEditPersonModal(id) {
  const p = getPerson(id); if (!p) return;
  document.getElementById('modal-person-title').textContent = i18n.t('editPersonTitle');
  document.getElementById('person-id').value          = id;
  document.getElementById('person-firstname').value   = p.firstName  || '';
  document.getElementById('person-lastname').value    = p.lastName   || '';
  document.getElementById('person-maiden').value      = p.maidenName || '';
  document.getElementById('person-gender').value      = p.gender     || 'unknown';
  document.getElementById('person-birth-date').value  = isoToDmy(p.birthDate);
  document.getElementById('person-birth-place').value = p.birthPlace || '';
  document.getElementById('person-death-date').value  = isoToDmy(p.deathDate);
  document.getElementById('person-death-place').value = p.deathPlace || '';
  document.getElementById('person-photo').value       = p.photo      || '';
  document.getElementById('person-photo-file').value  = '';
  document.getElementById('person-notes').value       = p.notes      || '';
  setPhotoPreview(p.photo || '');
  openModal('modal-person');
}

function savePerson() {
  const firstName = document.getElementById('person-firstname').value.trim();
  if (!firstName) { showToast(i18n.t('toastFirstNameReq'), 'error'); document.getElementById('person-firstname').focus(); return; }

  const id   = document.getElementById('person-id').value;
  const data = {
    firstName,
    lastName:   document.getElementById('person-lastname').value.trim(),
    maidenName: document.getElementById('person-maiden').value.trim(),
    gender:     document.getElementById('person-gender').value,
    birthDate:  dmyToIso(document.getElementById('person-birth-date').value.trim()),
    birthPlace: document.getElementById('person-birth-place').value.trim(),
    deathDate:  dmyToIso(document.getElementById('person-death-date').value.trim()),
    deathPlace: document.getElementById('person-death-place').value.trim(),
    photo:      document.getElementById('person-photo').value.trim(),
    notes:      document.getElementById('person-notes').value.trim(),
  };

  if (id) {
    updatePerson(id, data);
    showToast(i18n.t('toastSaved'), 'success');
  } else {
    const newId = addPerson(data);
    state.selectedId = newId;
    if (state.pendingRelation) {
      const ok = addRelationship(state.pendingRelation.type, state.pendingRelation.sourceId, newId);
      if (ok !== false) showToast(i18n.t('toastAddedLinked'), 'success');
      state.pendingRelation = null;
    } else {
      showToast(i18n.t('toastPersonAdded'), 'success');
    }
  }
  closeModal('modal-person');
  renderTree(); renderSidebar();
  if (!id) setTimeout(fitTree, 120);
}

// ============================================================
// MODAL: ADD RELATIONSHIP
// ============================================================

let _relSourceId = null, _relType = null;

function openAddRelationModal(sourceId) {
  _relSourceId = sourceId; _relType = null;
  const p    = getPerson(sourceId);
  const name = p ? getDisplayName(p) : '';
  document.getElementById('modal-relation-title').textContent = `${i18n.t('linkPrefix')} ${name}`;
  document.querySelectorAll('.rel-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('relation-person-select').style.display = 'none';
  document.getElementById('relation-search').value = '';
  document.getElementById('relation-search-results').innerHTML = '';
  openModal('modal-relation');
}

function openAddRelationWithType(sourceId, relType) {
  openAddRelationModal(sourceId);
  setTimeout(() => {
    const btn = document.querySelector(`.rel-type-btn[data-rel-type="${relType}"]`);
    if (btn) selectRelationType(relType, btn);
  }, 50);
}

function selectRelationType(type, btn) {
  _relType = type;
  document.querySelectorAll('.rel-type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('relation-person-select').style.display = 'block';
  document.getElementById('relation-search').value = '';
  filterRelationSearch();
  setTimeout(() => document.getElementById('relation-search').focus(), 60);
}

function filterRelationSearch() {
  if (!_relType) return;
  const q   = document.getElementById('relation-search').value.toLowerCase();
  const src = getPerson(_relSourceId); if (!src) return;

  const excl = new Set([_relSourceId]);
  if (_relType==='parent')  (src.parentIds||[]).forEach(id=>excl.add(id));
  if (_relType==='spouse')  (src.spouseIds||[]).forEach(id=>excl.add(id));
  if (_relType==='child')   getChildren(_relSourceId).forEach(c=>excl.add(c.id));
  if (_relType==='sibling') getSiblings(_relSourceId).forEach(s=>excl.add(s.id));

  const matches = getAllPeople().filter(p => !excl.has(p.id))
    .filter(p => !q || getDisplayName(p).toLowerCase().includes(q));

  const container = document.getElementById('relation-search-results');
  if (!matches.length) {
    container.innerHTML = `<div style="padding:12px;text-align:center;color:#aaa;font-size:0.8rem">${i18n.t('noMatchingPeople')}</div>`;
    return;
  }
  container.innerHTML = matches.slice(0,25).map(p => {
    const gc   = GENDER_COLOR[p.gender] || GENDER_COLOR.unknown;
    const name = getDisplayName(p);
    return `<div class="search-result-item" onclick="linkPeople('${_relType}','${_relSourceId}','${p.id}')">
      <div class="sr-avatar" style="background:${gc}">${getInitials(p)}</div>
      <span>${esc(name)}</span></div>`;
  }).join('');
}

function linkPeople(type, sourceId, targetId) {
  const ok = addRelationship(type, sourceId, targetId);
  if (ok !== false) { closeModal('modal-relation'); renderTree(); renderSidebar(); showToast(i18n.t('toastRelAdded'), 'success'); }
}

function addNewPersonWithRelation() {
  if (!_relType || !_relSourceId) return;
  state.pendingRelation = { type: _relType, sourceId: _relSourceId };
  closeModal('modal-relation');
  openAddPersonModal();
}

// ============================================================
// DELETE RELATIONSHIP
// ============================================================

function confirmUnlinkRel(relType, selectedId, otherId) {
  const tgt  = getPerson(otherId);
  const name = tgt ? getDisplayName(tgt) : '?';
  if (!confirm(i18n.t('confirmUnlink', name))) return;
  deleteRelationship(relType, selectedId, otherId);
}

function deleteRelationship(relType, selectedId, otherId) {
  const src = getPerson(selectedId), tgt = getPerson(otherId);
  if (!src || !tgt) return;
  switch (relType) {
    case 'parent':
      src.parentIds = (src.parentIds||[]).filter(id => id !== otherId);
      break;
    case 'spouse':
      src.spouseIds = (src.spouseIds||[]).filter(id => id !== otherId);
      tgt.spouseIds = (tgt.spouseIds||[]).filter(id => id !== selectedId);
      break;
    case 'child':
      tgt.parentIds = (tgt.parentIds||[]).filter(id => id !== selectedId);
      break;
    default: return;
  }
  saveData();
  renderTree();
  renderSidebar();
  showToast(i18n.t('toastRelDeleted'), 'success');
}

// ============================================================
// DELETE PERSON
// ============================================================

function confirmDelete(id) {
  const p    = getPerson(id);
  const name = p ? getDisplayName(p) : '?';
  if (!confirm(i18n.t('confirmDelete', name))) return;
  deletePerson(id);
  if (state.selectedId === id) state.selectedId = null;
  renderTree(); renderSidebar();
  showToast(i18n.t('toastDeleted'), 'success');
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

function exportData() {
  const json = JSON.stringify({ people: state.people }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'family-tree.json' });
  a.click(); URL.revokeObjectURL(url);
  showToast(i18n.t('toastExported'), 'success');
}

function openImportModal() {
  document.getElementById('import-json').value = '';
  document.getElementById('import-file').value = '';
  openModal('modal-import');
}

function loadImportFile(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { document.getElementById('import-json').value = e.target.result; };
  reader.readAsText(file);
}

function importData() {
  try {
    const raw  = document.getElementById('import-json').value.trim();
    const data = JSON.parse(raw);
    if (!data.people || typeof data.people !== 'object') throw new Error('invalid');
    if (Object.keys(state.people).length > 0 && !confirm(i18n.t('confirmImport'))) return;
    state.people = data.people; state.selectedId = null;
    saveData(); closeModal('modal-import');
    renderTree(); renderSidebar();
    setTimeout(fitTree, 120);
    showToast(i18n.t('toastImportedOk'), 'success');
  } catch { showToast(i18n.t('toastInvalidJson'), 'error'); }
}

// ============================================================
// MOBILE HELPERS
// ============================================================

function isMobile() { return window.innerWidth <= 768; }

function closeSidebarMobile() {
  state.selectedId = null;
  renderTree();
  renderSidebar();
}

// ⋯ More menu (mobile)
function toggleMoreMenu(event) {
  event.stopPropagation();
  document.getElementById('more-menu').classList.toggle('hidden');
}
function closeMoreMenu() {
  document.getElementById('more-menu').classList.add('hidden');
}

// ============================================================
// PEOPLE LIST SHEET  (mobile view)
// ============================================================

function openPeopleList() {
  renderPeopleList();
  document.getElementById('people-list-sheet').classList.remove('hidden');
  setTimeout(() => document.getElementById('pls-search').focus(), 300);
}

function closePeopleList() {
  document.getElementById('people-list-sheet').classList.add('hidden');
}

function renderPeopleList() {
  const q      = (document.getElementById('pls-search').value || '').toLowerCase();
  const people = getAllPeople()
    .filter(p => !q || getDisplayName(p).toLowerCase().includes(q))
    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

  const container = document.getElementById('pls-list');
  if (!people.length) {
    container.innerHTML = `<div class="pls-empty">${i18n.t('noMatchingPeople')}</div>`;
    return;
  }

  container.innerHTML = people.map(p => {
    const gc   = GENDER_COLOR[p.gender] || GENDER_COLOR.unknown;
    const name = getDisplayName(p);
    const by   = year(p.birthDate), dy = year(p.deathDate);
    const dates = by && dy ? `${by}–${dy}` : by ? `${i18n.t('bornAbbr')} ${by}` : dy ? `${i18n.t('diedAbbr')} ${dy}` : '';
    const av   = p.photo
      ? `<img src="${esc(p.photo)}" alt="">`
      : `<div class="pls-avatar-ph" style="background:${gc}">${getInitials(p)}</div>`;
    return `
      <div class="pls-item" onclick="selectFromList('${p.id}')">
        <div class="pls-avatar">${av}</div>
        <div class="pls-info">
          <div class="pls-name">${esc(name)}</div>
          ${dates ? `<div class="pls-dates">${esc(dates)}</div>` : ''}
        </div>
        <i class="fas fa-chevron-right pls-chevron"></i>
      </div>`;
  }).join('');
}

function selectFromList(id) {
  closePeopleList();
  state.selectedId = id;
  renderTree();
  renderSidebar();
  setTimeout(() => panToNode(id), 100);
}

// ============================================================
// AUTO-PAN TO NODE  (mobile: keep node visible above sheet)
// ============================================================

function panToNode(id) {
  if (!isMobile()) return;
  const { nodes } = buildLayout();
  const node = nodes.find(n => n.id === id);
  if (!node) return;

  const svgEl   = document.getElementById('tree-svg');
  const W       = svgEl.clientWidth;
  const H       = svgEl.clientHeight;
  const visibleH = H * 0.26;   // visible strip above the ~78vh bottom sheet

  const k  = d3.zoomTransform(svg.node()).k;
  const tx = W / 2 - (node.x + NODE_W / 2) * k;
  const ty = visibleH / 2 - (node.y + NODE_H / 2) * k;

  svg.transition().duration(380)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

// ============================================================
// LANGUAGE TOGGLE
// ============================================================

function toggleLanguage() {
  i18n.setLang(i18n.lang === 'en' ? 'vi' : 'en');
  i18n.applyTranslations();
  renderTree();
  renderSidebar();
  // Refresh families list if modal is open
  if (!document.getElementById('modal-families').classList.contains('hidden')) {
    renderFamiliesList();
  }
}

// ============================================================
// MODAL HELPERS
// ============================================================

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'modal-person') state.pendingRelation = null;
}

// ============================================================
// TOAST
// ============================================================

function showToast(msg, type = 'info') {
  const el = Object.assign(document.createElement('div'), { className: `toast${type!=='info'?' '+type:''}`, textContent: msg });
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ============================================================
// UTILITIES
// ============================================================

function getDisplayName(p) {
  if (!p) return '?';
  if (i18n.lang === 'vi') {
    return [p.lastName, p.firstName].filter(Boolean).join(' ') || '?';
  }
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || '?';
}

function getInitials(p) {
  if (i18n.lang === 'vi') {
    return ((p.lastName?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase()||'?';
  }
  return ((p.firstName?.[0]||'')+(p.lastName?.[0]||'')).toUpperCase()||'?';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function clip(s, max) { return s&&s.length>max ? s.slice(0,max-1)+'…' : (s||''); }

// dd/mm/yyyy ↔ yyyy-mm-dd conversions
function isoToDmy(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}
function dmyToIso(dmy) {
  if (!dmy) return '';
  const [d, m, y] = dmy.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function autoSlashDate(input) {
  // Keep only digits, then re-insert slashes at positions 2 and 5
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 4) v = v.slice(0,2) + '/' + v.slice(2,4) + '/' + v.slice(4);
  else if (v.length > 2) v = v.slice(0,2) + '/' + v.slice(2);
  input.value = v;
}

function year(d) { try { return d ? new Date(d).getFullYear() : null; } catch { return null; } }

function formatDate(d) {
  try {
    const date = new Date(d);
    if (i18n.lang === 'vi') {
      const day = date.getUTCDate(), month = date.getUTCMonth() + 1, year = date.getUTCFullYear();
      return `ngày ${day} tháng ${month} năm ${year}`;
    }
    return date.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  } catch { return d; }
}

// ============================================================
// INIT
// ============================================================

async function initApp() {
  const families = await apiFetch('/api/families');
  state.families = Array.isArray(families) ? families : [];

  if (!state.families.length) {
    renderTree();
    showWelcomeScreen();
  } else {
    let currentId = getCurrentFamilyId();
    if (!currentId || !state.families.find(f => f.id === currentId)) {
      currentId = state.families[0].id;
      setCurrentFamilyId(currentId);
    }
    await loadData();
    updateFamilyHeader();
    renderTree();
    renderSidebar();
    if (getAllPeople().length > 0) setTimeout(fitTree, 200);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Apply translations to static HTML
  i18n.applyTranslations();

  // 2. Init D3 tree canvas
  initTree();

  // 3. Load data from server
  await initApp();

  // 4. Wire up header buttons
  document.getElementById('btn-add-person').addEventListener('click', () => openAddPersonModal());
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', openImportModal);

  document.getElementById('form-person').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') savePerson();
  });

  // 6. Esc closes top-most modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal:not(.hidden)')];
    if (open.length) closeModal(open[open.length-1].id);
  });

  // 7. Close ⋯ more menu when clicking anywhere else
  document.addEventListener('click', e => {
    if (!e.target.closest('#btn-more') && !e.target.closest('#more-menu')) {
      closeMoreMenu();
    }
  });

  // 8. Swipe-down to dismiss sidebar bottom sheet on mobile
  const sidebarEl = document.getElementById('sidebar');
  let _swipeStartY = 0;

  sidebarEl.addEventListener('touchstart', e => {
    _swipeStartY = e.touches[0].clientY;
  }, { passive: true });

  sidebarEl.addEventListener('touchend', e => {
    if (!isMobile()) return;
    const dy = e.changedTouches[0].clientY - _swipeStartY;
    if (dy > 72) closeSidebarMobile(); // swipe down ≥72px → close
  }, { passive: true });

  // 9. Re-render tree on orientation change / window resize
  let _resizeTimer;
  const onResize = () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      renderTree();
      renderSidebar();
      if (getAllPeople().length > 0) fitTree();
    }, 150);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
});

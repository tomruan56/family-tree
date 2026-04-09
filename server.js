const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_DIR  = path.join(__dirname, 'data');
const IMGS_DIR  = path.join(__dirname, 'data', 'images');

// Ensure local data directories exist
if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMGS_DIR))  fs.mkdirSync(IMGS_DIR, { recursive: true });

// ── MongoDB (production) vs JSON files (local) ────────────────
let _mongoCollection = null;

async function getCollection() {
  if (_mongoCollection) return _mongoCollection;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  _mongoCollection = client.db('familytree').collection('devices');
  console.log('[DB] Connected to MongoDB Atlas');
  return _mongoCollection;
}

// Multer: store uploaded images in data/images/, keep original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMGS_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6) + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

// ── Storage helpers ───────────────────────────────────────────

function safeDeviceId(id) {
  const s = (id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return s.length >= 4 ? s : null;
}

async function readDevice(deviceId) {
  const col = await getCollection();
  if (col) {
    const doc = await col.findOne({ _id: deviceId });
    return doc ? { families: doc.families || {} } : { families: {} };
  }
  // fallback: JSON file
  const safe = safeDeviceId(deviceId);
  if (!safe) return { families: {} };
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${safe}.json`), 'utf8')); }
  catch { return { families: {} }; }
}

async function writeDevice(deviceId, data) {
  const col = await getCollection();
  if (col) {
    await col.replaceOne({ _id: deviceId }, { _id: deviceId, ...data }, { upsert: true });
    return;
  }
  const safe = safeDeviceId(deviceId);
  if (safe) fs.writeFileSync(path.join(DATA_DIR, `${safe}.json`), JSON.stringify(data));
}

// ── Device ID middleware ──────────────────────────────────────

function deviceId(req, res, next) {
  const id = req.headers['x-device-id'];
  if (!safeDeviceId(id))
    return res.status(400).json({ error: 'Missing or invalid X-Device-Id header' });
  req.deviceId = id;
  next();
}

// ── Image upload endpoint ─────────────────────────────────────

app.post('/api/upload', deviceId, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/data/images/${req.file.filename}` });
});

app.use('/data/images', express.static(IMGS_DIR));

// ── Family endpoints ──────────────────────────────────────────

app.get('/api/families', deviceId, async (req, res) => {
  const data = await readDevice(req.deviceId);
  const list = Object.values(data.families).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  res.json(list);
});

app.post('/api/families', deviceId, async (req, res) => {
  const { id, name, createdAt } = req.body || {};
  if (!id || !name?.trim()) return res.status(400).json({ error: 'id and name required' });
  const data = await readDevice(req.deviceId);
  if (data.families[id]) return res.status(409).json({ error: 'Family ID conflict' });
  data.families[id] = { id, name: name.trim(), createdAt: createdAt || new Date().toISOString(), people: {} };
  await writeDevice(req.deviceId, data);
  res.json({ id, name: name.trim(), createdAt: data.families[id].createdAt });
});

app.put('/api/families/:id', deviceId, async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const data = await readDevice(req.deviceId);
  if (!data.families[req.params.id]) return res.status(404).json({ error: 'Not found' });
  data.families[req.params.id].name = name.trim();
  await writeDevice(req.deviceId, data);
  res.json({ ok: true });
});

app.delete('/api/families/:id', deviceId, async (req, res) => {
  const data = await readDevice(req.deviceId);
  if (!data.families[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.families[req.params.id];
  await writeDevice(req.deviceId, data);
  res.json({ ok: true });
});

// ── People data endpoints ─────────────────────────────────────

app.get('/api/families/:id/people', deviceId, async (req, res) => {
  const data   = await readDevice(req.deviceId);
  const family = data.families[req.params.id];
  if (!family) return res.status(404).json({ error: 'Not found' });
  res.json(family.people || {});
});

app.put('/api/families/:id/people', deviceId, async (req, res) => {
  const data   = await readDevice(req.deviceId);
  const family = data.families[req.params.id];
  if (!family) return res.status(404).json({ error: 'Not found' });
  family.people = req.body;
  await writeDevice(req.deviceId, data);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Family Tree running at http://localhost:${PORT}`);
});

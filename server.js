const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const crypto  = require('crypto');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_DIR  = path.join(__dirname, 'data');
const IMGS_DIR  = path.join(__dirname, 'data', 'images');

// Ensure local data directories exist
if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMGS_DIR))  fs.mkdirSync(IMGS_DIR, { recursive: true });

// ── MongoDB (production) vs JSON files (local) ────────────────
let _mongoCollection = null;
let _mongoFailed = false; // once true, stop retrying and use file storage for the rest of this run

async function getCollection() {
  if (_mongoCollection) return _mongoCollection;
  if (_mongoFailed) return null;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  const { MongoClient } = require('mongodb');
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    _mongoCollection = client.db('familytree').collection('devices');
    console.log('[DB] Connected to MongoDB Atlas');
    return _mongoCollection;
  } catch (err) {
    _mongoFailed = true;
    console.error('[DB] MongoDB connection failed, falling back to local JSON storage:', err.message);
    return null;
  }
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

// Wraps an async route handler so a thrown/rejected error becomes a JSON 500
// instead of hanging the request until Render's proxy times out with a bare 502.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ── Login gate (single shared family password) ─────────────────
// Set APP_PASSWORD in the environment to require login before any data can
// be read or written. If it's unset, the app behaves as before (open access).
// Sessions are stateless signed tokens (no server-side session store needed,
// so logins survive restarts/redeploys as long as APP_PASSWORD doesn't change).
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function timingSafeStringEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeSessionToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = crypto.createHmac('sha256', process.env.APP_PASSWORD).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}

function verifySessionToken(token) {
  if (typeof token !== 'string') return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || !sig || Date.now() > exp) return false;
  const expected = crypto.createHmac('sha256', process.env.APP_PASSWORD).update(expStr).digest('hex');
  return timingSafeStringEqual(sig, expected);
}

// Basic in-memory rate limit for login attempts (per IP): resets on restart,
// which is fine here — the goal is slowing down brute force, not perfect accounting.
const _loginAttempts = new Map(); // ip -> { count, resetAt }
const LOGIN_LIMIT_MAX    = 10;
const LOGIN_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function loginRateLimited(ip) {
  const now = Date.now();
  const entry = _loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    _loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_LIMIT_WINDOW });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_LIMIT_MAX;
}

function requireAuth(req, res, next) {
  if (!process.env.APP_PASSWORD) return next(); // login disabled
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!verifySessionToken(token)) return res.status(401).json({ error: 'Login required' });
  next();
}

// ── Health / storage-backend diagnostic ────────────────────────
// Reports which storage backend is actually active, so this can be checked
// remotely (e.g. via browser fetch) instead of relying on dashboard logs.
app.get('/api/health', asyncHandler(async (req, res) => {
  const col = await getCollection();
  res.json({
    storage: col ? 'mongodb' : 'local-json-file',
    mongoConfigured: Boolean(process.env.MONGODB_URI),
    mongoFailed: _mongoFailed,
    authRequired: Boolean(process.env.APP_PASSWORD),
  });
}));

// ── Login ────────────────────────────────────────────────────
app.post('/api/login', asyncHandler(async (req, res) => {
  if (!process.env.APP_PASSWORD) return res.json({ token: null }); // login disabled
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (loginRateLimited(ip)) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || !timingSafeStringEqual(password, process.env.APP_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ token: makeSessionToken() });
}));

// ── Image upload endpoint ─────────────────────────────────────

app.post('/api/upload', requireAuth, deviceId, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/data/images/${req.file.filename}` });
});

app.use('/data/images', express.static(IMGS_DIR));

// ── Family endpoints ──────────────────────────────────────────

app.get('/api/families', requireAuth, deviceId, asyncHandler(async (req, res) => {
  const data = await readDevice(req.deviceId);
  const list = Object.values(data.families).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  res.json(list);
}));

app.post('/api/families', requireAuth, deviceId, asyncHandler(async (req, res) => {
  const { id, name, createdAt } = req.body || {};
  if (!id || !name?.trim()) return res.status(400).json({ error: 'id and name required' });
  const data = await readDevice(req.deviceId);
  if (data.families[id]) return res.status(409).json({ error: 'Family ID conflict' });
  data.families[id] = { id, name: name.trim(), createdAt: createdAt || new Date().toISOString(), people: {} };
  await writeDevice(req.deviceId, data);
  res.json({ id, name: name.trim(), createdAt: data.families[id].createdAt });
}));

app.put('/api/families/:id', requireAuth, deviceId, asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const data = await readDevice(req.deviceId);
  if (!data.families[req.params.id]) return res.status(404).json({ error: 'Not found' });
  data.families[req.params.id].name = name.trim();
  await writeDevice(req.deviceId, data);
  res.json({ ok: true });
}));

app.delete('/api/families/:id', requireAuth, deviceId, asyncHandler(async (req, res) => {
  const data = await readDevice(req.deviceId);
  if (!data.families[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.families[req.params.id];
  await writeDevice(req.deviceId, data);
  res.json({ ok: true });
}));

// ── People data endpoints ─────────────────────────────────────

app.get('/api/families/:id/people', requireAuth, deviceId, asyncHandler(async (req, res) => {
  const data   = await readDevice(req.deviceId);
  const family = data.families[req.params.id];
  if (!family) return res.status(404).json({ error: 'Not found' });
  res.json(family.people || {});
}));

app.put('/api/families/:id/people', requireAuth, deviceId, asyncHandler(async (req, res) => {
  const data   = await readDevice(req.deviceId);
  const family = data.families[req.params.id];
  if (!family) return res.status(404).json({ error: 'Not found' });
  family.people = req.body;
  await writeDevice(req.deviceId, data);
  res.json({ ok: true });
}));

// ── Error handler (catches anything asyncHandler passes to next()) ────
app.use((err, req, res, next) => {
  console.error('[API] Unhandled route error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Family Tree running at http://localhost:${PORT}`);
});

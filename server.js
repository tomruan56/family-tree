const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const multer   = require('multer');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_DIR  = path.join(__dirname, 'data');
const IMGS_DIR  = path.join(__dirname, 'data', 'images');

// Ensure local data directories exist
if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMGS_DIR))  fs.mkdirSync(IMGS_DIR, { recursive: true });

// ── MongoDB (production) vs JSON files (local) ────────────────
let _mongoDb      = null;
let _mongoFailed  = false; // once true, stop retrying and use file storage for the rest of this run

async function getDb() {
  if (_mongoDb) return _mongoDb;
  if (_mongoFailed) return null;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  const { MongoClient } = require('mongodb');
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    _mongoDb = client.db('familytree');
    await _mongoDb.collection('users').createIndex({ username: 1 }, { unique: true });
    console.log('[DB] Connected to MongoDB Atlas');
    return _mongoDb;
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

// Wraps an async route handler so a thrown/rejected error becomes a JSON 500
// instead of hanging the request until Render's proxy times out with a bare 502.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ============================================================
// USERS  (accounts — each user has their own private family data)
// ============================================================

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

function genUserId() {
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function usersFilePath() { return path.join(DATA_DIR, 'users.json'); }

function readUsersFile() {
  try { return JSON.parse(fs.readFileSync(usersFilePath(), 'utf8')); }
  catch { return {}; }
}

function writeUsersFile(users) {
  fs.writeFileSync(usersFilePath(), JSON.stringify(users));
}

// `key` is the normalized (lowercased) username, used for case-insensitive
// lookup; `username` on the stored record keeps the casing the user typed.
async function findUserByUsername(key) {
  const db = await getDb();
  if (db) return db.collection('users').findOne({ username: key });
  return readUsersFile()[key] || null;
}

async function createUser(key, displayUsername, passwordHash) {
  const user = { id: genUserId(), username: key, displayUsername, passwordHash, createdAt: new Date().toISOString() };
  const db = await getDb();
  if (db) {
    await db.collection('users').insertOne({ _id: user.id, ...user });
  } else {
    const users = readUsersFile();
    users[key] = user;
    writeUsersFile(users);
  }
  return user;
}

// ============================================================
// FAMILY / PEOPLE DATA  (keyed by authenticated user id)
// ============================================================

async function readUserData(userId) {
  const db = await getDb();
  if (db) {
    const doc = await db.collection('userdata').findOne({ _id: userId });
    return doc ? { families: doc.families || {} } : { families: {} };
  }
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `user_${userId}.json`), 'utf8')); }
  catch { return { families: {} }; }
}

async function writeUserData(userId, data) {
  const db = await getDb();
  if (db) {
    await db.collection('userdata').replaceOne({ _id: userId }, { _id: userId, ...data }, { upsert: true });
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, `user_${userId}.json`), JSON.stringify(data));
}

// ============================================================
// AUTH  (per-account username + password login)
// ============================================================
// Sessions are stateless signed tokens: "<userId>.<expiry>.<signature>".
// Set SESSION_SECRET in the environment so tokens survive restarts/redeploys;
// without it, a random secret is generated at boot and everyone is signed
// out on the next restart.
const SESSION_SECRET  = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
if (!process.env.SESSION_SECRET) {
  console.warn('[AUTH] SESSION_SECRET not set — using a random secret for this run. ' +
               'Everyone will be signed out on the next restart/redeploy until you set it.');
}

function timingSafeStringEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeSessionToken(userId) {
  const exp     = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig     = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// Returns the userId if the token is valid and unexpired, otherwise null.
function verifySessionToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !exp || !sig || Date.now() > exp) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${userId}.${expStr}`).digest('hex');
  return timingSafeStringEqual(sig, expected) ? userId : null;
}

function requireAuth(req, res, next) {
  const header  = req.headers['authorization'] || '';
  const token   = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId  = verifySessionToken(token);
  if (!userId) return res.status(401).json({ error: 'Login required' });
  req.userId = userId;
  next();
}

// Basic in-memory rate limit for login/register attempts (per IP+route):
// resets on restart, which is fine — the goal is slowing brute force, not
// perfect accounting.
const _attempts = new Map(); // "ip:route" -> { count, resetAt }
const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function rateLimited(req, route) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${route}`;
  const now = Date.now();
  const entry = _attempts.get(key);
  if (!entry || now > entry.resetAt) {
    _attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// ── Register ─────────────────────────────────────────────────
app.post('/api/register', asyncHandler(async (req, res) => {
  if (rateLimited(req, 'register')) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const rawUsername = String(req.body?.username || '').trim();
  const username     = normalizeUsername(rawUsername);
  const password     = req.body?.password;
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscore only' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (await findUserByUsername(username)) return res.status(409).json({ error: 'That username is already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser(username, rawUsername, passwordHash);
  res.json({ token: makeSessionToken(user.id), username: user.displayUsername });
}));

// ── Login ────────────────────────────────────────────────────
app.post('/api/login', asyncHandler(async (req, res) => {
  if (rateLimited(req, 'login')) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  const user = await findUserByUsername(username);
  // Generic error for both "no such user" and "wrong password" — don't reveal which.
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  res.json({ token: makeSessionToken(user.id), username: user.displayUsername || user.username });
}));

// ── Health / storage-backend diagnostic ────────────────────────
// Reports which storage backend is actually active, so this can be checked
// remotely (e.g. via browser fetch) instead of relying on dashboard logs.
app.get('/api/health', asyncHandler(async (req, res) => {
  const db = await getDb();
  res.json({
    storage: db ? 'mongodb' : 'local-json-file',
    mongoConfigured: Boolean(process.env.MONGODB_URI),
    mongoFailed: _mongoFailed,
    sessionSecretConfigured: Boolean(process.env.SESSION_SECRET),
  });
}));

// ── Image upload endpoint ─────────────────────────────────────

app.post('/api/upload', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/data/images/${req.file.filename}` });
});

app.use('/data/images', express.static(IMGS_DIR));

// ── Family endpoints ──────────────────────────────────────────

app.get('/api/families', requireAuth, asyncHandler(async (req, res) => {
  const data = await readUserData(req.userId);
  const list = Object.values(data.families).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  res.json(list);
}));

app.post('/api/families', requireAuth, asyncHandler(async (req, res) => {
  const { id, name, createdAt } = req.body || {};
  if (!id || !name?.trim()) return res.status(400).json({ error: 'id and name required' });
  const data = await readUserData(req.userId);
  if (data.families[id]) return res.status(409).json({ error: 'Family ID conflict' });
  data.families[id] = { id, name: name.trim(), createdAt: createdAt || new Date().toISOString(), people: {} };
  await writeUserData(req.userId, data);
  res.json({ id, name: name.trim(), createdAt: data.families[id].createdAt });
}));

app.put('/api/families/:id', requireAuth, asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const data = await readUserData(req.userId);
  if (!data.families[req.params.id]) return res.status(404).json({ error: 'Not found' });
  data.families[req.params.id].name = name.trim();
  await writeUserData(req.userId, data);
  res.json({ ok: true });
}));

app.delete('/api/families/:id', requireAuth, asyncHandler(async (req, res) => {
  const data = await readUserData(req.userId);
  if (!data.families[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.families[req.params.id];
  await writeUserData(req.userId, data);
  res.json({ ok: true });
}));

// ── People data endpoints ─────────────────────────────────────

app.get('/api/families/:id/people', requireAuth, asyncHandler(async (req, res) => {
  const data   = await readUserData(req.userId);
  const family = data.families[req.params.id];
  if (!family) return res.status(404).json({ error: 'Not found' });
  res.json(family.people || {});
}));

app.put('/api/families/:id/people', requireAuth, asyncHandler(async (req, res) => {
  const data   = await readUserData(req.userId);
  const family = data.families[req.params.id];
  if (!family) return res.status(404).json({ error: 'Not found' });
  family.people = req.body;
  await writeUserData(req.userId, data);
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

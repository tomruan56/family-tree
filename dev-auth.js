// Local dev-only launcher: runs the server with a test APP_PASSWORD set,
// so the login gate can be exercised in the Browser preview.
// Not used in production — Render sets APP_PASSWORD as a real env var.
process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'test1234';
process.env.PORT = process.env.PORT || '3001';
require('./server.js');

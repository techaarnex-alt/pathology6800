/*
 * Local application server. Authentication secrets never enter the browser or Git.
 * Configure demo/.env from demo/.env.example before starting this file.
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const PORT = Number(process.env.PORT || 3000);
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const sessions = new Map();
const attempts = new Map();

function loadEnv(file) {
  if (!fs.existsSync(file)) throw new Error('Missing demo/.env. Copy demo/.env.example and configure a password hash.');
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#')) values[match[1]] = match[2];
  }
  return values;
}

const config = loadEnv(ENV_FILE);
if (!config.AUTH_USERNAME || !config.AUTH_PASSWORD_HASH) throw new Error('AUTH_USERNAME and AUTH_PASSWORD_HASH are required in demo/.env.');

function parsePasswordHash(value) {
  const [algorithm, salt, hash] = String(value).split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) throw new Error('AUTH_PASSWORD_HASH must use scrypt:<base64-salt>:<base64-hash>.');
  return { salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') };
}
const passwordHash = parsePasswordHash(config.AUTH_PASSWORD_HASH);
const usernameHash = crypto.createHash('sha256').update(config.AUTH_USERNAME).digest();

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(JSON.stringify(data));
}
function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}
function sessionFor(request) {
  const id = parseCookies(request).rkp_session;
  const expires = sessions.get(id);
  if (!id || !expires || expires < Date.now()) { sessions.delete(id); return null; }
  return id;
}
function clientKey(request) { return request.socket.remoteAddress || 'unknown'; }
function limited(request) {
  const key = clientKey(request), now = Date.now(), record = attempts.get(key) || { count: 0, resetAt: now + 60000 };
  if (record.resetAt < now) { record.count = 0; record.resetAt = now + 60000; }
  record.count += 1; attempts.set(key, record);
  return record.count > 10;
}
function validPassword(password) {
  const derived = crypto.scryptSync(password, passwordHash.salt, passwordHash.hash.length);
  return crypto.timingSafeEqual(derived, passwordHash.hash);
}
function validUsername(username) {
  const supplied = crypto.createHash('sha256').update(String(username)).digest();
  return crypto.timingSafeEqual(supplied, usernameHash);
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > MAX_BODY_BYTES) request.destroy(); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON.')); } });
    request.on('error', reject);
  });
}
function serveFile(request, response) {
  const requested = request.url === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname;
  const filename = path.resolve(ROOT, '.' + requested);
  if (!filename.startsWith(ROOT + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return json(response, 404, { error: 'Not found' });
  const ext = path.extname(filename).toLowerCase();
  const type = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' }[ext] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  fs.createReadStream(filename).pipe(response);
}

http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/session') return json(response, 200, { authenticated: Boolean(sessionFor(request)) });
    if (request.method === 'POST' && request.url === '/api/login') {
      if (limited(request)) return json(response, 429, { error: 'Too many attempts. Try again later.' });
      const { username = '', password = '' } = await readJson(request);
      const validUser = validUsername(username);
      if (validUser && validPassword(String(password))) {
        const id = crypto.randomBytes(32).toString('base64url');
        sessions.set(id, Date.now() + SESSION_LIFETIME_MS);
        return json(response, 200, { authenticated: true }, { 'Set-Cookie': `rkp_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}` });
      }
      return json(response, 401, { error: 'Invalid credentials.' });
    }
    if (request.method === 'POST' && request.url === '/api/logout') {
      const id = sessionFor(request); if (id) sessions.delete(id);
      return json(response, 200, { authenticated: false }, { 'Set-Cookie': 'rkp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (request.method === 'GET') return serveFile(request, response);
    return json(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error(error.message);
    return json(response, 400, { error: 'Bad request.' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`R K Pathology is running at http://127.0.0.1:${PORT}`));

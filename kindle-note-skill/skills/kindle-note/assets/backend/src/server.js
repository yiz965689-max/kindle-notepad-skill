import http from 'node:http';
import {createHash, createHmac, randomUUID, timingSafeEqual} from 'node:crypto';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {handle, locationFrom} from './worker.js';
import {renderScreen, taskHitHeader} from './screen.js';

export class FileStore {
  constructor(directory) { this.directory = directory; }
  path(key) { return `${this.directory}/${createHash('sha256').update(key).digest('hex')}.json`; }
  async get(key) {
    try {
      const entry = JSON.parse(await readFile(this.path(key), 'utf8'));
      return entry.expires && entry.expires < Date.now() ? null : JSON.parse(entry.value);
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async put(key, value, options = {}) {
    const target = this.path(key), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({value, expires: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0}), {mode: 0o600});
    await rename(temporary, target);
  }
}

export function validToken(header, token) {
  if (!token || token.length < 32) return false;
  const a = createHash('sha256').update(header || '').digest();
  const b = createHash('sha256').update(`Bearer ${token}`).digest();
  return timingSafeEqual(a, b);
}

const SESSION_COOKIE = '__Host-kindle_session';
const SESSION_AGE = 180 * 86400;
function sessionSignature(payload, secret) {
  return createHmac('sha256', secret).update(`kindle-browser-session-v1:${payload}`).digest('hex');
}
export function validSession(cookie, secret) {
  if (!secret || secret.length < 32) return false;
  const value = String(cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const match = /^(\d{13})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(value || '');
  if (!match || Number(match[1]) <= Date.now() || Number(match[1]) > Date.now() + SESSION_AGE * 1000) return false;
  return timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(sessionSignature(`${match[1]}.${match[2]}`, secret), 'hex'));
}

export function makeLocator(fetcher = fetch) {
  const cache = new Map();
  return async ip => {
    if (!isIP(ip)) return null;
    const key = createHash('sha256').update(ip).digest('hex');
    const old = cache.get(key);
    if (old && old.until > Date.now()) return old.location;
    try {
      const url = `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country_code,latitude,longitude,timezone.id`;
      const response = await fetcher(url, {signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('location');
      const data = await response.json();
      const city = data.country_code === 'CN' && /^(Chongqing(?: Shi)?|重庆市?)$/i.test(String(data.region || '').trim()) ? '重庆' : data.city;
      const location = data.success === true ? locationFrom({...data, city, country: data.country_code, timezone: data.timezone?.id}) : null;
      if (cache.size > 128) cache.clear();
      cache.set(key, {location, until: Date.now() + (location ? 1800000 : 60000)});
      return location;
    } catch { return null; }
  };
}

export function createServer(env, {locate = makeLocator(), fetcher = fetch} = {}) {
  const APP_ORIGIN = env.APP_ORIGIN || 'https://kindle.example.com';
  if (new URL(APP_ORIGIN).origin !== APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) throw new Error('APP_ORIGIN must be an HTTPS origin');
  const limits = new Map();
  let screenCache = null;
  let taskWriteQueue = Promise.resolve();
  return http.createServer({requestTimeout: 30000, headersTimeout: 10000, maxHeaderSize: 8192}, async (incoming, outgoing) => {
    try {
      // This listener is private to the dedicated Docker network. Caddy always
      // replaces this header with its direct peer IP; never expose port 8080.
      const peer = String(incoming.headers['x-kindle-client-ip'] || '');
      const minute = Math.floor(Date.now() / 60000);
      if (limits.size > 2048) limits.clear();
      const rate = limits.get(peer);
      const count = rate?.minute === minute ? rate.count + 1 : 1;
      limits.set(peer, {minute, count});
      if (count > 120) { outgoing.writeHead(429, {'Retry-After':'60'}); outgoing.end(); return; }
      const url = new URL(incoming.url, APP_ORIGIN);
      if (url.pathname === '/v1/session' && ['POST', 'DELETE'].includes(incoming.method)) {
        const origin = incoming.headers.origin;
        if ((origin && origin !== APP_ORIGIN) || (incoming.method === 'DELETE' && origin !== APP_ORIGIN)) {
          outgoing.writeHead(403, {'Cache-Control':'no-store'}); outgoing.end(); return;
        }
        if (incoming.method === 'POST' && !validToken(incoming.headers.authorization, env.ADMIN_TOKEN)) {
          outgoing.writeHead(401, {'Cache-Control':'no-store'}); outgoing.end(); return;
        }
        const payload = `${Date.now() + SESSION_AGE * 1000}.${randomUUID()}`;
        const value = incoming.method === 'POST' ? `${payload}.${sessionSignature(payload, env.ADMIN_TOKEN)}` : '';
        outgoing.writeHead(204, {'Cache-Control':'no-store', 'Set-Cookie':`${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${value ? SESSION_AGE : 0}`});
        outgoing.end(); return;
      }
      if (incoming.method === 'GET' && ['/', '/editor.js', '/checklist.js', '/manifest.webmanifest'].includes(url.pathname)) {
        const file = url.pathname === '/' ? 'checklist.html' : url.pathname.slice(1);
        const body = await readFile(new URL(file, import.meta.url));
        outgoing.writeHead(200, {'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.webmanifest')?'application/manifest+json':'text/javascript; charset=utf-8',
          'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
        outgoing.end(body); return;
      }
      const screen = url.pathname === '/v1/screen';
      if (screen) url.pathname = '/v1/state';
      const chunks = []; let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > (url.pathname === '/v1/tasks' ? 32768 : 4096)) { outgoing.writeHead(413); outgoing.end(); return; }
        chunks.push(chunk);
      }
      const request = new Request(url, {method: incoming.method, headers: incoming.headers,
        ...(chunks.length ? {body: Buffer.concat(chunks)} : {})});
      if (['/v1/tasks', '/v1/note'].includes(url.pathname) && !incoming.headers.authorization && validSession(incoming.headers.cookie, env.ADMIN_TOKEN)) {
        // Cookie-authenticated writes require the exact application origin.
        if ((incoming.headers.origin && incoming.headers.origin !== APP_ORIGIN) || (incoming.method !== 'GET' && incoming.headers.origin !== APP_ORIGIN)) {
          outgoing.writeHead(403, {'Cache-Control':'no-store'}); outgoing.end(); return;
        }
        request.headers.set('Authorization', `Bearer ${env.ADMIN_TOKEN}`);
      }
      if (screen) request.headers.delete('if-none-match');
      if (url.pathname === '/v1/state' && incoming.method === 'GET' && validToken(incoming.headers.authorization, env.DEVICE_TOKEN)) {
        Object.defineProperty(request, 'cf', {value: await locate(peer)});
      }
      let response;
      if ((url.pathname === '/v1/tasks' && incoming.method === 'PUT') || (url.pathname === '/v1/task-action' && incoming.method === 'POST')) {
        const job = taskWriteQueue.then(() => handle(request, env, {fetcher}));
        taskWriteQueue = job.then(() => {}, () => {});
        response = await job;
      } else response = await handle(request, env, {fetcher});
      if (screen && response.status === 200) {
        const state = await response.json();
        const key = JSON.stringify(state);
        if (screenCache?.key !== key) screenCache = {key, png:renderScreen(state)};
        outgoing.writeHead(200, {'Content-Type':'image/png','Cache-Control':'private, no-store',
          'X-Task-Revision':String(state.tasks?.revision || 0),'X-Task-Hits':taskHitHeader(state),
          'X-UTC-Offset':String(state.utc_offset_seconds),'X-Server-Time':response.headers.get('X-Server-Time')});
        outgoing.end(screenCache.png); return;
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(503, {'Content-Type':'application/json','Cache-Control':'no-store'});
      outgoing.end(JSON.stringify({error:'temporary_failure',keep_cached:true}));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secrets = JSON.parse(await readFile(process.env.SECRETS_FILE || '/run/secrets/kindle.json', 'utf8'));
  if (!secrets.DEVICE_TOKEN || !secrets.ADMIN_TOKEN || secrets.DEVICE_TOKEN === secrets.ADMIN_TOKEN) throw new Error('Invalid credentials');
  const directory = process.env.DATA_DIR || '/data';
  await mkdir(directory, {recursive:true, mode:0o700});
  const APP_ORIGIN = process.env.APP_ORIGIN;
  if (!APP_ORIGIN || APP_ORIGIN.includes('example.com')) throw new Error('Set your own APP_ORIGIN');
  const server = createServer({...secrets, APP_ORIGIN, STORE: new FileStore(directory)});
  server.listen(8080, '0.0.0.0', () => console.log('Kindle Note listening on private port 8080'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

/**
 * Unified entry point for alp-see.at (Strapi v5 CMS + Next.js frontend).
 *
 * One process, one listener. Hostinger's Node runtime only honours the FIRST
 * http.Server.listen() call in a process ("listen() was called more than once,
 * ignore") and binds it to the public socket, so Strapi and Next.js cannot run
 * on their own internal ports. Instead:
 *
 *   - this file creates the only HTTP server and listens first;
 *   - Strapi is loaded in-process and served through its Koa request callback
 *     (/admin, /api/*, /uploads/*, /_health);
 *   - Next.js is loaded in-process through its custom-server API and serves
 *     everything else.
 *
 * Requests get 503 until the backend they need has finished starting.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Diagnostics. Hostinger's runtime log API only keeps JSON console lines, while
// Strapi's logger writes plain text to stdout/stderr and calls process.exit on
// fatal errors, so mirror both through console.
// ---------------------------------------------------------------------------
let _forwarding = false;
for (const stream of ['stdout', 'stderr']) {
  const orig = process[stream].write.bind(process[stream]);
  process[stream].write = (chunk, ...rest) => {
    if (!_forwarding) {
      _forwarding = true;
      try {
        String(chunk).split('\n').forEach((l) => {
          const line = l.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (line && !/^(\[parent\]|\[out\]|\{)/.test(line)) console.log(`[out] ${line}`);
        });
      } finally {
        _forwarding = false;
      }
    }
    return orig(chunk, ...rest);
  };
}
const _exit = process.exit.bind(process);
process.exit = (code) => {
  console.error(`[parent] process.exit(${code}) called from: ${new Error().stack.split('\n').slice(2, 6).join(' | ')}`);
  return _exit(code);
};

const PUBLIC_PORT = parseInt(process.env.PORT, 10) || 1337;

// ---------------------------------------------------------------------------
// Locating the published files. Hostinger publishes the build output dir
// (cms/.next/) as <root>/.next/ and runs this file from inside it, so _cms_src
// and node_modules sit next to __dirname, while .next-standalone sits one up.
// ---------------------------------------------------------------------------
function _resolvePublishRoot() {
  const candidates = [
    __dirname,                          // cms/ (local)
    path.join(__dirname, '..'),         // repo root (local) / cms/ (hostinger)
    path.join(__dirname, '..', '..'),   // repo root (hostinger)
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, '.next-standalone', 'server.js'))) return c;
  }
  return __dirname;
}
const publishRoot = _resolvePublishRoot();
console.log(`[parent] publishRoot = ${publishRoot}`);

function _findDir(rel) {
  const bases = [publishRoot, __dirname, path.join(publishRoot, '.next')];
  for (const b of bases) {
    const p = path.join(b, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`could not find ${rel} under ${bases.join(', ')}`);
}

// The published tree has the cms source at _cms_src/ (not cms/ — Hostinger's
// publisher strips subdirs named "cms" from Next.js output).
const cmsSrc = _findDir('_cms_src');
const standaloneDir = path.join(publishRoot, '.next-standalone');

// ---------------------------------------------------------------------------
// Strapi (in-process, no port)
// ---------------------------------------------------------------------------
async function startStrapi() {
  process.chdir(cmsSrc);
  // Strapi's config/server.ts reads these even though nothing binds a port.
  process.env.HOST = process.env.HOST || '127.0.0.1';
  process.env.STRAPI_TELEMETRY_DISABLED = process.env.STRAPI_TELEMETRY_DISABLED || 'true';

  const strapiMod = require(_findDir(path.join('node_modules', '@strapi', 'strapi')));
  // Strapi v5 exports the factory as a named export; v4 exported it directly.
  const createStrapi = strapiMod.createStrapi || strapiMod.default?.createStrapi || strapiMod;

  // TypeScript project: `strapi build` compiles config/ and src/ (and the admin
  // bundle) into dist/, which is where Strapi loads them from at runtime.
  const distDir = fs.existsSync(path.join(cmsSrc, 'dist')) ? path.join(cmsSrc, 'dist') : cmsSrc;
  console.log(`[parent] Strapi appDir=${cmsSrc} distDir=${distDir}`);

  // The upload provider refuses to start if <public>/uploads is missing, and
  // the empty uploads/ dir is not part of the published build (nor of git).
  const publicDir = path.resolve(cmsSrc, process.env.PUBLIC_DIR || './public');
  fs.mkdirSync(path.join(publicDir, 'uploads'), { recursive: true });
  console.log(`[parent] Strapi public dir: ${publicDir}`);

  const app = createStrapi({ appDir: cmsSrc, distDir });
  const t0 = Date.now();
  console.log('[parent] Strapi load() ...');
  await app.load();
  // Strapi.listen() would call server.listen() (ignored here) and then
  // postListen(); do the equivalent without a socket.
  app.server.mount();
  await app.postListen();
  console.log(`[parent] Strapi ready in ${Date.now() - t0}ms`);
  return app.server.app.callback();
}

// ---------------------------------------------------------------------------
// Next.js (in-process, no port)
// ---------------------------------------------------------------------------
function _loadStandaloneConfig() {
  // The standalone server.js embeds the resolved next.config as one JSON line
  // and hands it to Next through this env var; replicate that.
  const src = fs.readFileSync(path.join(standaloneDir, 'server.js'), 'utf8');
  const m = src.match(/^const nextConfig = (\{.*\})\s*$/m);
  if (m) process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = m[1];
  else console.warn('[parent] could not find embedded nextConfig in standalone server.js');
}

function _ensureNextStatic() {
  // Standalone output omits .next/static; the full build copy has it.
  const dst = path.join(standaloneDir, '.next', 'static');
  if (fs.existsSync(dst)) return;
  for (const base of [path.join(publishRoot, '.next'), __dirname]) {
    const src = path.join(base, 'static');
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
      console.log(`[parent] copied Next static assets from ${src}`);
      return;
    }
  }
  console.warn('[parent] no Next static assets found; /_next/static will 404');
}

function _requireNext() {
  const candidates = [
    path.join(standaloneDir, 'node_modules', 'next'),
    path.join(publishRoot, '.next', 'node_modules_frontend', 'next'),
    path.join(__dirname, 'node_modules_frontend', 'next'),
  ];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error(`could not find the next package in: ${candidates.join(', ')}`);
  console.log(`[parent] using next from ${found}`);
  const mod = require(found);
  return mod.default || mod;
}

async function startNext() {
  process.env.NODE_ENV = 'production';
  _loadStandaloneConfig();
  _ensureNextStatic();
  const next = _requireNext();

  const prevCwd = process.cwd();
  process.chdir(standaloneDir); // Next's standalone layout expects cwd = its own dir
  try {
    const t0 = Date.now();
    console.log(`[parent] Next.js prepare() in ${standaloneDir}`);
    const nextApp = next({ dev: false, dir: standaloneDir, hostname: '127.0.0.1', port: PUBLIC_PORT });
    await nextApp.prepare();
    console.log(`[parent] Next.js ready in ${Date.now() - t0}ms`);
    return nextApp.getRequestHandler();
  } finally {
    process.chdir(prevCwd);
  }
}

// ---------------------------------------------------------------------------
// Main: the one and only listener, listening first.
// ---------------------------------------------------------------------------
const isStrapiPath = (url) =>
  url === '/api' ||
  url.startsWith('/api/') ||
  url.startsWith('/admin') ||
  url.startsWith('/uploads/') ||
  url === '/_health';

async function main() {
  const handlers = { strapi: null, next: null };

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    // The frontend's own /api/revalidate route is a Next.js route, not Strapi's.
    const which = !url.startsWith('/api/revalidate') && isStrapiPath(url) ? 'strapi' : 'next';
    const handler = handlers[which];
    if (!handler) {
      res.writeHead(503, { 'Content-Type': 'text/plain', 'Retry-After': '5' });
      res.end('Starting up, please retry in a few seconds.');
      return;
    }
    const fail = (err) => {
      console.error(`[${which}] request failed: ${url}: ${err && err.stack ? err.stack : err}`);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    };
    try {
      Promise.resolve(handler(req, res)).catch(fail);
    } catch (err) {
      fail(err);
    }
  });

  await new Promise((resolve) => {
    server.listen(PUBLIC_PORT, '0.0.0.0', () => {
      console.log(`[parent] Marena listening on :${PUBLIC_PORT} (Strapi + Next.js in-process)`);
      resolve();
    });
  });

  // Start one after the other (both touch the working directory while loading).
  // A failure in one is logged and leaves it returning 503 instead of taking the
  // other down.
  try {
    handlers.strapi = await startStrapi();
  } catch (e) {
    console.error(`[parent] Strapi failed to start: ${e && e.stack ? e.stack : e}`);
  }
  try {
    handlers.next = await startNext();
  } catch (e) {
    console.error(`[parent] Next.js failed to start: ${e && e.stack ? e.stack : e}`);
  }

  const shutdown = (sig) => {
    console.log(`[parent] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

/**
 * Unified entry point for alp-see.at.
 *
 * Boots two child processes:
 *   - Strapi on PORT+1 -> /admin, /api/*, /uploads/*
 *   - Next.js standalone on PORT+2 -> everything else (the frontend)
 *
 * The parent process is an http reverse-proxy that forwards each request
 * to the right child based on URL prefix. Hostinger only sees one entry
 * point (this file), one port, one process tree.
 *
 * ponytail: single-process design. Split into 2 Hostinger Node apps
 * (or move to a real VPS) when traffic exceeds what one Node process
 * can handle.
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PUBLIC_PORT = parseInt(process.env.PORT, 10) || 1337;
const STRAPI_INTERNAL = PUBLIC_PORT + 1;
const NEXTJS_INTERNAL = PUBLIC_PORT + 2;

function waitForPort(port, name, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.request({ host: '127.0.0.1', port, method: 'HEAD', timeout: 1000 }, () => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`${name} didn't start within ${timeoutMs}ms`));
        } else {
          setTimeout(tryOnce, 250);
        }
      });
      req.end();
    };
    tryOnce();
  });
}

const children = [];

function spawnChild(name, cmd, args, env, cwd) {
  // ponytail: Hostinger's runtime sandbox blocks execve() of /opt/alt/* binaries
  // (ENOENT even when the file exists). We use a no-op stub here; Strapi and
  // Next.js are loaded IN-PROCESS via startStrapi/startNext below.
  console.warn(`[parent] spawnChild(${name}) is a no-op; using in-process start`);
  return { on() {}, kill() {} };
}

// ponytail: Hostinger's runtime sandbox blocks spawn() of any node binary.
// Load Strapi and Next.js as in-process libraries instead.
// The published tree has the cms source at <publishRoot>/_cms_src/ (not
// <publishRoot>/cms/ — Hostinger's publisher strips subdirs named "cms"
// from Next.js output, mistaking them for a separate Strapi webapp).
const cmsSrc = path.join(publishRoot, '_cms_src');

async function startStrapi() {
  process.chdir(cmsSrc);
  process.env.PORT = String(STRAPI_INTERNAL);
  process.env.HOST = '127.0.0.1';
  const strapiFactory = require(path.join(publishRoot, 'node_modules', '@strapi', 'strapi'));
  const app = await strapiFactory({
    appDir: cmsSrc,
    distDir: path.join(cmsSrc, '.strapi'),
  }).load();
  return new Promise((resolve) => {
    app.listen(STRAPI_INTERNAL, '127.0.0.1', () => resolve(app));
  });
}

async function startNext() {
  process.env.PORT = String(NEXTJS_INTERNAL);
  process.env.HOSTNAME = '127.0.0.1';
  // Next.js standalone boots on require; we just require it.
  // The standalone .next-standalone/server.js calls process.nextTick(http.createServer.listen)
  // which uses HOSTNAME+PORT env vars to bind.
  process.chdir(path.join(publishRoot, 'frontend'));
  // Defer the require so the proxy can start first.
  setImmediate(() => {
    try {
      require(path.join(publishRoot, '.next-standalone', 'server.js'));
    } catch (e) {
      console.error('[parent] next standalone require failed:', e);
    }
  });
}

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

async function main() {
  // ponytail: in-process start (sandbox blocks execve of /opt/alt/* binaries).
  console.log(`[parent] starting Strapi on :${STRAPI_INTERNAL}`);
  await startStrapi();
  await waitForPort(STRAPI_INTERNAL, 'Strapi');
  console.log(`[parent] Strapi ready on :${STRAPI_INTERNAL}`);

  console.log(`[parent] starting Next.js on :${NEXTJS_INTERNAL}`);
  await startNext();
  await waitForPort(NEXTJS_INTERNAL, 'Next.js');
  console.log(`[parent] Next.js ready on :${NEXTJS_INTERNAL}`);

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    const isApi =
      url.startsWith('/api/') ||
      url.startsWith('/admin') ||
      url.startsWith('/uploads/') ||
      url === '/_health';
    const targetPort = isApi ? STRAPI_INTERNAL : NEXTJS_INTERNAL;
    const proxyHeaders = { ...req.headers };
    // Override Host to the internal address so Next.js's canonical-URL
    // detection doesn't 307-redirect to the public hostname we forwarded in.
    proxyHeaders.host = `127.0.0.1:${targetPort}`;
    // Tell upstreams they're behind a proxy so they trust X-Forwarded-Proto.
    proxyHeaders['x-forwarded-host'] = process.env.PUBLIC_URL
      ? new URL(process.env.PUBLIC_URL).host
      : 'alp-see.at';
    proxyHeaders['x-forwarded-proto'] = 'https';
    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: targetPort,
        method: req.method,
        path: url,
        headers: proxyHeaders,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (err) => {
      console.error(`[proxy] ${targetPort} <- ${url}: ${err.message}`);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad gateway: ${err.message}`);
    });
    req.pipe(proxyReq);
  });

  server.listen(PUBLIC_PORT, '0.0.0.0', () => {
    console.log(`[parent] Marena unified on :${PUBLIC_PORT} -> Strapi(:${STRAPI_INTERNAL}) + Next.js(:${NEXTJS_INTERNAL})`);
  });

  const shutdown = (sig) => {
    console.log(`[parent] ${sig} received, shutting down`);
    server.close(() => {
      for (const { child } of children) child.kill(sig);
      process.exit(0);
    });
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

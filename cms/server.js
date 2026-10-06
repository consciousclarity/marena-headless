/**
 * Unified entry point for marena.alp-see.com.
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
  // ponytail: Hostinger's runtime PATH may not include node. We try the
  // configured cmd first, then fall back to a list of well-known node paths.
  const c = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, cwd });
  c.on('exit', (code, sig) => {
    console.error(`[parent] ${name} exited code=${code} sig=${sig}`);
    process.exit(code ?? 1);
  });
  children.push({ name, child: c });
  return c;
}

// Resolve the node binary that the Hostinger runtime can actually exec.
// process.execPath at runtime is /opt/alt/alt-nodejs22/root/usr/bin/node
// (confirmed by Hostinger logs) — we list it first.
function resolveNodeBin() {
  if (process.env.HOSTINGER_NODE_PATH && fs.existsSync(process.env.HOSTINGER_NODE_PATH)) {
    return process.env.HOSTINGER_NODE_PATH;
  }
  const candidates = [
    process.execPath,                                  // runtime path (varies)
    '/opt/alt/alt-nodejs22/root/usr/bin/node',         // Hostinger Alt
    '/opt/alt/alt-nodejs20/root/usr/bin/node',
    '/usr/bin/node',
    '/usr/local/bin/node',
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  // Last resort: defer to spawn's PATH lookup.
  return 'node';
}

async function main() {
  // __dirname is either cms/ (local dev) or cms/.next/ (Hostinger).
  // The published dir is cms/.next/, so look for:
  //   cms/.next/.next-standalone/server.js  (next standalone)
  //   cms/.next/node_modules/.bin/strapi    (strapi)
  //   cms/.next/node_modules_frontend/      (next standalone's deps)
  const candidates = [
    __dirname,                          // cms/ (local)
    path.join(__dirname, '..'),         // repo root (local) / cms/ (hostinger)
    path.join(__dirname, '..', '..'),   // repo root (hostinger)
  ];
  let publishRoot = __dirname;          // dir containing .next-standalone/ and node_modules/
  for (const c of candidates) {
    if (require('fs').existsSync(path.join(c, '.next-standalone', 'server.js'))) {
      publishRoot = c;
      break;
    }
  }
  console.log(`[parent] publishRoot = ${publishRoot}`);

  // ponytail: resolve node binary dynamically — process.execPath points at
  // the build image, not the runtime image (Hostinger's runtime layout).
  const nodeBin = resolveNodeBin();
  console.log(`[parent] nodeBin = ${nodeBin}`);
  console.log(`[parent] process.execPath = ${process.execPath}`);
  console.log(`[parent] /opt/alt/alt-nodejs22/root/usr/bin/node exists? ${fs.existsSync('/opt/alt/alt-nodejs22/root/usr/bin/node')}`);

  // Spawn Strapi from its bundled node_modules/.bin/strapi.
  const strapiBin = path.join(publishRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'strapi.cmd' : 'strapi');
  const strapiCwd = path.join(publishRoot, 'cms');
  const strapiEnv = { PORT: String(STRAPI_INTERNAL), HOST: '127.0.0.1' };
  spawnChild('strapi', nodeBin, [strapiBin], strapiEnv, strapiCwd);
  await waitForPort(STRAPI_INTERNAL, 'Strapi');
  console.log(`[parent] Strapi ready on :${STRAPI_INTERNAL}`);

  const nextServer = path.join(publishRoot, '.next-standalone', 'server.js');
  // Next.js standalone needs to find its own deps — set NODE_PATH so it can.
  const nextEnv = {
    PORT: String(NEXTJS_INTERNAL),
    HOSTNAME: '127.0.0.1',
    NODE_PATH: path.join(publishRoot, 'node_modules_frontend'),
  };
  spawnChild('nextjs', nodeBin, [nextServer], nextEnv, path.join(publishRoot, 'frontend'));
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
      : 'marena.alp-see.com';
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

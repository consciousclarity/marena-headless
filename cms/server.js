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

function spawnChild(name, cmd, args, env) {
  const c = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  c.on('exit', (code, sig) => {
    console.error(`[parent] ${name} exited code=${code} sig=${sig}`);
    process.exit(code ?? 1);
  });
  children.push({ name, child: c });
  return c;
}

async function main() {
  const strapiEnv = { PORT: String(STRAPI_INTERNAL), HOST: '127.0.0.1' };
  spawnChild('strapi', 'npx', ['strapi', 'start'], strapiEnv);
  await waitForPort(STRAPI_INTERNAL, 'Strapi');
  console.log(`[parent] Strapi ready on :${STRAPI_INTERNAL}`);

  const nextServer = path.join(__dirname, '.next-standalone', 'server.js');
  const nextEnv = { PORT: String(NEXTJS_INTERNAL), HOSTNAME: '127.0.0.1' };
  spawnChild('nextjs', 'node', [nextServer], nextEnv);
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
    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: targetPort,
        method: req.method,
        path: url,
        headers: req.headers,
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

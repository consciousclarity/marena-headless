// Hostinger entry point. The platform looks for a .js/.mjs/.cjs file
// to start the long-running process. Strapi's "start" script is just
// `strapi start`; we exec it so the Node process stays alive as the
// long-running server.
const { spawn } = require('child_process');
const child = spawn('npx', ['strapi', 'start'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => process.exit(code ?? 1));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => child.kill(sig));
}

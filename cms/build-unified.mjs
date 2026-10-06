/**
 * Build orchestration for the unified CMS+frontend deploy.
 *
 * Runs:
 *   1. Next.js standalone build (output goes to frontend/.next/standalone/)
 *   2. Strapi build (output goes to cms/.strapi/)
 *   3. Copies the Next.js static assets into cms/public/_next/ so the
 *      standalone server can serve them after the proxy forwards.
 *
 * Usage:  node scripts/build-unified.mjs
 *   or:  npm run build:unified
 */
import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function isWindows() {
  return process.platform === "win32";
}
function npmCmd() {
  return isWindows() ? "npm.cmd" : "npm";
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // On Windows, .cmd files need shell:true to spawn correctly.
    // On POSIX, the binary is invoked directly.
    const c = spawn(cmd, args, {
      stdio: "inherit",
      shell: isWindows(),
      ...opts,
    });
    c.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))
    );
  });
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  const frontendDir = resolve(repoRoot, "frontend");
  const cmsDir = resolve(repoRoot, "cms");

  // 1a. Install (with devDeps) — done here, not inside `npm run build`,
  //     because npm 11 propagates --ignore-scripts down into child npm
  //     invocations and blocks the sharp postinstall.
  console.log("▸ installing frontend deps (with dev)...");
  await run(npmCmd(), ["install", "--include=dev", "--foreground-scripts"], { cwd: frontendDir });

  // 1b. Next.js standalone build
  console.log("▸ building Next.js (standalone)...");
  await run(npmCmd(), ["run", "build"], { cwd: frontendDir });

  const standaloneServer = resolve(
    frontendDir,
    ".next",
    "standalone",
    "server.js"
  );
  if (!(await exists(standaloneServer))) {
    throw new Error(
      `Next.js standalone server not found at ${standaloneServer}. ` +
      `Make sure next.config.mjs has output: 'standalone'.`
    );
  }

  // 2. Strapi build
  console.log("▸ installing CMS deps...");
  await run(npmCmd(), ["install", "--include=dev", "--foreground-scripts"], { cwd: cmsDir });
  console.log("▸ building Strapi...");
  await run(npmCmd(), ["run", "build"], { cwd: cmsDir });

  // 3. Copy Next.js static assets into cms/public/_next/ so the standalone
  //    server (running as a child of cms/server.js) can find them.
  const staticSrc = resolve(frontendDir, ".next", "static");
  const staticDst = resolve(cmsDir, "public", "_next");
  if (await exists(staticSrc)) {
    console.log("▸ copying static assets...");
    await rm(staticDst, { recursive: true, force: true });
    await mkdir(resolve(cmsDir, "public"), { recursive: true });
    await cp(staticSrc, staticDst, { recursive: true });
  } else {
    console.warn(`⚠ no static assets at ${staticSrc} (skipping copy)`);
  }

  // 4. Also copy the standalone server.js into cms/ so cms/server.js can
  //    reference it relatively.
  const standaloneSrc = resolve(frontendDir, ".next", "standalone");
  const standaloneDst = resolve(cmsDir, ".next-standalone");
  console.log("▸ copying standalone server...");
  await rm(standaloneDst, { recursive: true, force: true });
  await cp(standaloneSrc, standaloneDst, { recursive: true });

  console.log("✓ unified build complete");
  console.log(`  cms/server.js -> ${standaloneDst}/server.js`);
  console.log(`  cms/public/_next/  <- frontend/.next/static/`);
}

main().catch((err) => {
  console.error("✗ build failed:", err);
  process.exit(1);
});

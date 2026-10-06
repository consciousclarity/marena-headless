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
import { cp, mkdir, rm, stat, symlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Script lives in cms/, so the repo root is one level up.
const repoRoot = resolve(__dirname, "..");

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
    // Merge env so NODE_ENV overrides don't clobber PATH (which the
    // build-unified.mjs caller needs for `npm` to be findable on Windows).
    const env = opts.env
      ? { ...process.env, ...opts.env }
      : process.env;
    const c = spawn(cmd, args, {
      stdio: "inherit",
      shell: isWindows(),
      ...opts,
      env,
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
  //     because npm 11 propagates strict allow-scripts down into child npm
  //     invocations and blocks the sharp postinstall. We force NODE_ENV=development
  //     so the install runs (sharp's binary download is otherwise blocked).
  console.log("▸ installing frontend deps (with dev)...");
  await run(npmCmd(), ["install", "--include=dev", "--foreground-scripts"], {
    cwd: frontendDir,
    env: { NODE_ENV: "development" },
  });

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
  await run(npmCmd(), ["install", "--include=dev", "--foreground-scripts"], {
    cwd: cmsDir,
    env: { NODE_ENV: "development" },
  });
  // ponytail: invoke strapi's binary directly, not `npm run build`,
  //     to avoid recursing into our own build script (which would loop
  //     because `cms/package.json` "build" is now THIS script).
  const strapiBin = isWindows() ? "strapi.cmd" : "strapi";
  console.log("▸ building Strapi...");
  await run(resolve(cmsDir, "node_modules", ".bin", strapiBin), ["build"], {
    cwd: cmsDir,
    env: { NODE_ENV: "production" },
  });

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

  // 4. Copy the standalone server into cms/ so cms/server.js can launch it.
//    Also create cms/.next/ as a REAL folder (not a symlink/junction) —
//    Hostinger's publish step uses a non-following file walker, so symlinks
//    and NTFS junctions are silently ignored. We move the standalone output
//    into cms/.next/ directly.
  const standaloneSrc = resolve(frontendDir, ".next", "standalone");
  const standaloneDst = resolve(cmsDir, ".next");
  const cacheDst = resolve(cmsDir, ".next-standalone");
  console.log("▸ copying standalone server to cms/.next/...");
  await rm(standaloneDst, { recursive: true, force: true });
  await cp(standaloneSrc, standaloneDst, { recursive: true });
  // Keep the .next-standalone mirror so cms/server.js can boot it without
  // caring which path the publish step expects.
  await rm(cacheDst, { recursive: true, force: true });
  await cp(standaloneSrc, cacheDst, { recursive: true });

  console.log("✓ unified build complete");
  console.log(`  cms/server.js -> ${standaloneDst}/server.js`);
  console.log(`  cms/public/_next/  <- frontend/.next/static/`);
}

main().catch((err) => {
  console.error("✗ build failed:", err);
  process.exit(1);
});

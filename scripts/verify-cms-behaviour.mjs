#!/usr/bin/env node
// Regression gate for the CMS-fallback behaviour.
//
// WHAT THIS CHECKS
// ----------------
// The homepage used to catch every CMS failure and render fallback
// copy with a placeholder hero image. That made a DEAD CMS look like
// a WORKING site: a headline, a hero photo, a villas heading, and an
// empty villa grid. The visitor saw a website. The owner saw a page
// that loads. Nobody saw the 403.
//
// This script boots the real Next.js build against a mock Strapi in
// two modes and asserts the difference is visible:
//
//   healthy CMS  -> the page shows the CMS's own content
//   dead CMS     -> the page SAYS the content is unavailable, and
//                   shows no placeholder copy and no placeholder image
//
// It also asserts the routes that had to exist:
//   /villas            -> the homepage CTA target (was a 404)
//   /<villa-slug>      -> a villa detail page (500'd when `features`
//                         was unpopulated)
//   /<unknown-slug>    -> a genuine 404
//
// USAGE
//   node scripts/verify-cms-behaviour.mjs
//   node scripts/verify-cms-behaviour.mjs --base-url http://127.0.0.1:3000
//
// With --base-url, the already-running instance is tested as-is and no
// mock or server is started.
//
// EXIT CODE 0 = every assertion passed. Non-zero = at least one failed.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const frontend = path.join(root, 'frontend');

const args = process.argv.slice(2);
const baseUrlArg = args.indexOf('--base-url');
const EXTERNAL = baseUrlArg !== -1 ? args[baseUrlArg + 1] : null;

// Ports are deliberately in the 47000s. Astro's dev server defaults to
// 4321, and a gate that binds a port some other project already holds
// ends up testing against that project instead — which is exactly what
// happened the first time this ran.
const MOCK_OK_PORT = 47311;
const MOCK_BAD_PORT = 47313;
const APP_OK_PORT = 47312;
const APP_BAD_PORT = 47314;
const MOCK_OK = `http://127.0.0.1:${MOCK_OK_PORT}`;
const MOCK_BAD = `http://127.0.0.1:${MOCK_BAD_PORT}`;

const results = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures++;
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

async function get(pathname, base = EXTERNAL || `http://127.0.0.1:${APP_OK_PORT}`) {
  const res = await fetch(`${base}${pathname}`);
  return { status: res.status, html: await res.text() };
}

const children = [];

function launch(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: opts.cwd || root, env: { ...process.env, ...opts.env }, stdio: 'ignore' });
  children.push(child);
  return child;
}

/**
 * Wait until the thing on `url` is up AND is the thing we expect.
 *
 * Checking only for "some HTTP response" is not enough: any other
 * server that happens to hold the port will answer, and the gate then
 * tests against it. The mock publishes an identity marker so the check
 * can prove it is talking to the mock and not a bystander.
 */
async function waitForMock(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/__ping`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.mock === 'marena-strapi') return body;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return null;
}

async function waitForHttp(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

function cleanup() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
}

try {
  if (!EXTERNAL) {
    console.log('Building the frontend...');
    const build = spawn(process.execPath, [path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
      cwd: frontend,
      stdio: 'inherit',
    });
    const buildCode = await new Promise((res) => build.on('close', res));
    if (buildCode !== 0) {
      console.error('Build failed — cannot verify.');
      process.exit(buildCode || 1);
    }

    console.log('Starting the mock Strapi (healthy) and the one that refuses...');
    launch(process.execPath, [path.join(here, 'mock-strapi.mjs'), String(MOCK_OK_PORT), 'ok']);
    launch(process.execPath, [path.join(here, 'mock-strapi.mjs'), String(MOCK_BAD_PORT), 'forbidden']);

    const okIdentity = await waitForMock(MOCK_OK);
    if (!okIdentity) {
      throw new Error(
        `the healthy mock never identified itself on ${MOCK_OK} — the port may be held by another server`
      );
    }
    const badIdentity = await waitForMock(MOCK_BAD);
    if (!badIdentity || badIdentity.mode !== 'forbidden') {
      throw new Error(
        `the refusing mock never identified itself on ${MOCK_BAD} — the port may be held by another server`
      );
    }
    console.log(`  healthy mock: ${JSON.stringify(okIdentity)}`);
    console.log(`  refusing mock: ${JSON.stringify(badIdentity)}`);

    // TWO app instances, not one.
    //
    // The healthy instance proves the site renders CMS content. The
    // refusing instance proves the site SAYS SO when the CMS is down.
    //
    // They have to be separate because of the fetch cache. Next caches
    // a successful CMS response for `revalidate` seconds. If one app
    // saw the healthy CMS first, its cache would hold that response and
    // it would keep serving it — correctly! — so the dead-CMS check
    // would never exercise the fault path. (A stale-but-REAL cached
    // page is the right thing to serve; FABRICATED fallback copy is
    // not. That is the whole difference this gate protects.)
    //
    // A second app instance, pointed at a mock that has always been
    // refusing, has a cold cache and no choice but to take the fault
    // path. That makes the check deterministic instead of a race
    // against a 60-second revalidation window.
    console.log('Starting Next.js (healthy) and Next.js (refusing)...');
    launch(process.execPath, [path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(APP_OK_PORT)], {
      cwd: frontend,
      env: { STRAPI_URL: MOCK_OK },
    });
    launch(process.execPath, [path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(APP_BAD_PORT)], {
      cwd: frontend,
      env: { STRAPI_URL: MOCK_BAD },
    });
    if (!(await waitForHttp(`http://127.0.0.1:${APP_OK_PORT}/`))) throw new Error('the healthy app never came up');
    if (!(await waitForHttp(`http://127.0.0.1:${APP_BAD_PORT}/`))) throw new Error('the refusing app never came up');
  }

  console.log('\nHealthy CMS');
  {
    const { status, html } = await get('/');
    const body = textOf(html);
    check('homepage returns 200', status === 200, `got ${status}`);
    check('homepage shows the CMS headline', body.includes('A quieter way to be in Bali'));
    check('homepage shows the CMS subheadline', body.includes('CMS content, not a fallback.'));
    check('homepage shows real villa names', body.includes('One Bedroom Villa') && body.includes('Two Bedroom Villa'));
    check('homepage uses the real hero image', html.includes('real-hero.jpg'));
    check('homepage does NOT use the placeholder image', !html.includes('hero_placeholder'));
    check('homepage does NOT show the fallback copy', !body.includes('Hand-picked villas, curated'));
    check('homepage does NOT show the CMS-fault message', !body.includes('content is not'));
  }

  console.log('\nRoutes');
  {
    const villas = await get('/villas');
    check('/villas returns 200 (the homepage CTA target)', villas.status === 200, `got ${villas.status}`);
    check('/villas lists the villas', textOf(villas.html).includes('One Bedroom Villa'));
    check('/villas links to a villa detail page', villas.html.includes('/villa-1br'));

    const detail = await get('/villa-1br');
    check('/villa-1br returns 200', detail.status === 200, `got ${detail.status}`);
    check('/villa-1br shows the villa name', textOf(detail.html).includes('One Bedroom Villa'));
    check('/villa-1br uses the villa hero image', detail.html.includes('real-1br.jpg'));

    const missing = await get('/nope-not-real');
    check('/nope-not-real returns 404', missing.status === 404, `got ${missing.status}`);
  }

  console.log('\nDead CMS (Strapi answering 403)');
  {
    // The refusing app instance has a cold cache and a CMS that has
    // never answered, so this takes the fault path directly.
    const base = EXTERNAL || `http://127.0.0.1:${APP_BAD_PORT}`;
    const { status, html } = await get('/', base);
    const body = textOf(html);
    check('homepage still returns 200', status === 200, `got ${status}`);
    check('homepage SAYS the content is unavailable', body.includes('content is not'));
    check('homepage shows the 403 status', body.includes('Content unavailable (403)'));
    check('homepage does NOT show the fallback copy', !body.includes('Hand-picked villas, curated'));
    check('homepage does NOT use the placeholder image', !html.includes('hero_placeholder'));

    // The health endpoint is the OPERATOR's signal. It asks the CMS
    // uncached, every time, and answers 503 when the CMS is not
    // answering — so a monitor can catch what a cached page hides.
    const health = await get('/api/health', base);
    check('/api/health returns 503 when the CMS is down', health.status === 503, `got ${health.status}`);
    check('/api/health says the CMS is unreachable', textOf(health.html).includes('"reachable":false'));
  }

  console.log('\nHealth endpoint (CMS answering)');
  {
    const base = EXTERNAL || `http://127.0.0.1:${APP_OK_PORT}`;
    const health = await get('/api/health', base);
    check('/api/health returns 200 when the CMS answers', health.status === 200, `got ${health.status}`);
    check('/api/health says the CMS is reachable', textOf(health.html).includes('"reachable":true'));
  }
} catch (e) {
  console.error('\nVerification could not run:', e.message);
  failures++;
} finally {
  cleanup();
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
console.log('All checks passed.');

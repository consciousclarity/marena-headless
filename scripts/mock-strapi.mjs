// A minimal Strapi 5-shaped API, enough to prove the frontend's
// populate queries and its error handling against something real.
//
//   node mock-strapi.mjs <port> <mode>
//     mode=ok    -> 200, returns seeded content
//     mode=403   -> 403, like the live alp-see.at proxy
const port = Number(process.argv[2] || 4010);
const mode = process.argv[3] || 'ok';

const img = (url) => ({
  url: `http://127.0.0.1:${port}${url}`,
  alternativeText: 'Bali villa',
  width: 2400,
  height: 1480,
});

const body = (data) => JSON.stringify({ data, meta: {} });

const homepage = {
  documentId: 'homepage1',
  heroHeadline: 'A quieter way to be in Bali',
  heroSubheadline: 'CMS content, not a fallback.',
  heroImage: img('/uploads/real-hero.jpg'),
  introEyebrow: 'Marena',
  introHeading: 'Villas by Marena',
  villasHeading: 'Three places, each its own rhythm.',
  experiencesHeading: 'In-villa',
};

const villas = [
  {
    documentId: 'villa1',
    slug: 'villa-1br',
    name: 'One Bedroom Villa',
    tagline: 'Secluded, private, close to the sea.',
    bedrooms: 1,
    maxGuests: 2,
    heroImage: img('/uploads/real-1br.jpg'),
  },
  {
    documentId: 'villa2',
    slug: 'villa-2br',
    name: 'Two Bedroom Villa',
    tagline: 'A longer stay with the same quiet.',
    bedrooms: 2,
    maxGuests: 4,
    heroImage: img('/uploads/real-2br.jpg'),
  },
];

const experiences = [
  { documentId: 'exp1', slug: 'private-chef', title: 'Private Chef', icon: img('/uploads/chef.svg') },
  { documentId: 'exp2', slug: 'yoga', title: 'Yoga', icon: img('/uploads/yoga.svg') },
];

// The mode is mutable at runtime so the verification can flip the mock
// from "healthy" to "refusing" WITHOUT killing and rebinding the port.
// A kill-and-rebind races with the socket release, and a race in a
// gate is a gate that fails for the wrong reason.
let currentMode = mode;

// Every request the mock receives, so a test can prove the app
// actually re-fetched instead of serving something stale.
const seen = [];

const server = (await import('node:http')).createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const p = url.pathname;
  seen.push({ path: p, query: url.search, mode: currentMode });
  if (seen.length > 200) seen.shift();

  // Identity marker. A health check that only looks for "any HTTP 200"
  // can be satisfied by a DIFFERENT server that happens to hold the
  // port — a local dev server, for instance. That is how a gate ends
  // up passing against the wrong thing.
  if (p === '/__ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const apiCalls = seen.filter((s) => s.path.startsWith('/api/'));
    res.end(
      JSON.stringify({
        mock: 'marena-strapi',
        mode: currentMode,
        port,
        requests: seen.length,
        apiRequests: apiCalls.length,
        lastApi: apiCalls.length
          ? { path: apiCalls[apiCalls.length - 1].path, query: apiCalls[apiCalls.length - 1].query }
          : null,
      })
    );
    return;
  }

  // Flip the mock's behaviour without restarting it.
  if (p === '/__mode' && req.method === 'POST') {
    const wanted = url.searchParams.get('mode');
    if (wanted !== 'ok' && wanted !== 'forbidden') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `unknown mode ${wanted}` }));
      return;
    }
    currentMode = wanted;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mock: 'marena-strapi', mode: currentMode, port }));
    return;
  }

  if (p.startsWith('/uploads/')) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
    return;
  }

  if (currentMode === '403' || currentMode === 'forbidden') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { status: 403, name: 'ForbiddenError', message: 'Forbidden' } }));
    return;
  }

  // Record the populate query so we can assert the frontend asks for
  // the right thing.
  if (p === '/__lastquery') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ query: globalThis.__lastQuery || null }));
    return;
  }
  globalThis.__lastQuery = url.search;

  if (p === '/api/homepage') return void (res.writeHead(200, { 'Content-Type': 'application/json' }), res.end(body(homepage)));
  if (p === '/api/villas') {
    const one = url.searchParams.get('filters[slug][$eq]');
    if (one) {
      const hit = villas.find((v) => v.slug === one);
      // Real Strapi returns an ARRAY for a filters query, even when one
      // row matches. Returning an object here made the frontend's
      // `rows?.length` check fail.
      return void (res.writeHead(hit ? 200 : 404, { 'Content-Type': 'application/json' }),
        res.end(body(hit ? [hit] : [])));
    }
    return void (res.writeHead(200, { 'Content-Type': 'application/json' }), res.end(body(villas)));
  }
  if (p === '/api/experiences') return void (res.writeHead(200, { 'Content-Type': 'application/json' }), res.end(body(experiences)));

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.on('error', (e) => {
  // A port that is already taken means someone else's server is on it.
  // Exiting loudly is better than letting a health check pass against
  // the wrong process.
  console.error(`mock-strapi: cannot listen on ${port}: ${e.code || e.message}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => console.log(`mock strapi (${mode}) on ${port}`));

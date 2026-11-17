/**
 * Strapi v5 typed client.
 * Single source of truth for how the frontend reads content.
 * Tag-based cache (revalidateTag) lets the /api/revalidate route
 * invalidate exactly what changed.
 */

const STRAPI_URL = process.env.STRAPI_URL || 'https://alp-see.at';
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN || '';

export type Image = {
  url: string;
  alternativeText?: string;
  width: number;
  height: number;
  formats?: Record<string, { url: string; width: number; height: number }>;
};

export type SEO = {
  metaTitle: string;
  metaDescription: string;
  ogImage?: Image;
  noindex?: boolean;
};

export type Villa = {
  documentId: string;
  slug: string;
  name: string;
  tagline: string;
  bedrooms: number;
  maxGuests: number;
  shortDescription: string;
  longDescription?: string;
  features: { label: string; icon?: string }[];
  heroImage: Image;
  gallery: Image[];
  priceFrom?: number;
  currency: 'USD' | 'EUR' | 'IDR' | 'AUD';
  order: number;
  seo?: SEO;
};

export type Experience = {
  documentId: string;
  slug: string;
  title: string;
  icon: Image;
  shortPitch: string;
  longDescription?: string;
  gallery: Image[];
  order: number;
};

export type Homepage = {
  heroHeadline: string;
  heroSubheadline?: string;
  heroImage: Image;
  heroVideo?: Image;
  introEyebrow?: string;
  introHeading: string;
  introBody?: string;
  villasHeading: string;
  experiencesHeading: string;
  seo?: SEO;
};

export class StrapiUnavailableError extends Error {
  /** The HTTP status Strapi returned, or 0 if the request never landed. */
  readonly status: number;
  /** The API path that failed, e.g. `/homepage?populate=*`. */
  readonly path: string;

  constructor(status: number, path: string, detail: string) {
    super(detail);
    this.name = 'StrapiUnavailableError';
    this.status = status;
    this.path = path;
  }
}

/**
 * Whether the CMS is reachable and answering.
 *
 * WHY THIS IS NOT THE SAME AS "THE CMS IS EMPTY"
 * -----------------------------------------------
 * A CMS that returns an empty array has content to show, and none of
 * it. A CMS that returns 403 has NO content to show, and that is a
 * fault, not a state.
 *
 * The homepage used to treat both the same way: it caught every
 * failure and rendered fallback copy with a placeholder hero image.
 * So when the CMS was unreachable, the site looked HEALTHY — a
 * finished-looking page with a headline, a hero photo and a villas
 * heading — while serving zero actual villas and zero actual
 * experiences. The visitor sees a site. The owner sees a green page.
 * Nobody sees the 403.
 *
 * That is the same failure shape as a CI gate that passes when it
 * should fail: the thing that would have told you is the thing that
 * got swallowed.
 *
 * So the error is kept and the page shows it.
 */
export type CmsState<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; detail: string };

/**
 * Is the CMS answering RIGHT NOW?
 *
 * WHY THIS IS NOT THE SAME AS READING CONTENT
 * -------------------------------------------
 * Next caches a successful CMS response for `revalidate` seconds. When
 * the window lapses, Next revalidates in the BACKGROUND and serves the
 * cached copy meanwhile. Measured on this build: with the CMS refusing
 * every query, the app kept issuing the three API calls on every
 * render (so the CMS was being asked, and was saying no) and the pages
 * kept serving the cached content — for as long as the cache entry
 * lived.
 *
 * That is defensible for a VISITOR: a stale-but-real page beats an
 * error page. It is not defensible for the OWNER, because a site
 * serving real content while its CMS is dead looks completely healthy.
 * That is how the CMS stayed broken here without anyone noticing.
 *
 * So the content read is not the health signal. This probe is: one
 * small request, deliberately NOT cached, that answers "can the CMS
 * reach us right now?".
 */
export async function cmsHealth(): Promise<{ reachable: boolean; status: number; detail: string }> {
  try {
    const res = await fetch(new URL('/api/homepage?fields[0]=documentId', STRAPI_URL), {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      return {
        reachable: false,
        status: res.status,
        detail: `Strapi ${res.status} on /api/homepage`,
      };
    }
    return { reachable: true, status: res.status, detail: 'ok' };
  } catch (e) {
    return {
      reachable: false,
      status: 0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Run a CMS read and report whether it FAILED, rather than what it
 * returned.
 *
 * `catch` here means "the CMS is down or refusing us", which is a
 * different thing from "the CMS has no entries yet".
 */
export async function cmsRead<T>(fn: () => Promise<T>): Promise<CmsState<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof StrapiUnavailableError) {
      return { ok: false, status: e.status, detail: e.message };
    }
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function strapiFetch<T>(
  path: string,
  opts: { tags?: string[]; draft?: boolean } = {},
  revalidate = 300
): Promise<T> {
  const url = new URL(`/api${path}`, STRAPI_URL);
  if (opts.draft) url.searchParams.set('publicationState', 'preview');
  const res = await fetch(url, {
    next: { tags: opts.tags, revalidate },
    headers: {
      Authorization: `Bearer ${STRAPI_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    // ponytail: throw a typed error so /[slug] can fall back to a 404,
    // and so the pages can tell a CMS fault from an empty CMS.
    throw new StrapiUnavailableError(
      res.status,
      path,
      `Strapi ${res.status} on ${path}: ${await res.text().catch(() => '')}`
    );
  }
  const body = await res.json();
  return body.data as T;
}

const mediaUrl = (m: any): Image | undefined =>
  m?.url
    ? {
        url: m.url.startsWith('http') ? m.url : `${STRAPI_URL}${m.url}`,
        alternativeText: m.alternativeText,
        width: m.width,
        height: m.height,
        formats: m.formats,
      }
    : undefined;

const flatten = (entity: any) => {
  if (!entity) return entity;
  const a = entity.attributes ?? entity;
  const out: any = { ...a };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v?.data) out[k] = Array.isArray(v.data) ? v.data.map(flatten) : flatten(v.data);
    if (k === 'heroImage' || k === 'icon' || k === 'ogImage') out[k] = mediaUrl(v?.data?.attributes ?? v) ?? out[k];
    if (k === 'gallery' || k === 'heroVideo') {
      const arr = v?.data ?? v;
      out[k] = Array.isArray(arr) ? arr.map((x: any) => mediaUrl(x?.attributes ?? x)).filter(Boolean) : [];
    }
    // Repeatable component fields (a villa's `features`) have to be
    // normalised to an array here.
    //
    // Strapi OMITS a repeatable field entirely when it is empty and
    // was not populated. So `out.features` came back `undefined`, and
    // the villa page did `v.features.map(...)` on it — which threw, and
    // the whole page returned a 500. One unseeded field took the page
    // down.
    //
    // The type says `features: { label: string }[]`, so it is an array
    // by contract. The normaliser is what makes that contract true
    // against real CMS data.
    if (k === 'features') {
      const arr = v?.data ?? v;
      out[k] = Array.isArray(arr) ? arr.map((x: any) => (x?.attributes ?? x)).filter(Boolean) : [];
    }
  }
  // The loop above only visits keys the response ACTUALLY contained. A
  // field Strapi omitted entirely never appears in Object.keys(), so it
  // never reached the normaliser above. These defaults run
  // unconditionally, which is what actually makes the types honest.
  if (out.features === undefined) out.features = [];
  if (out.gallery === undefined) out.gallery = [];
  out.documentId = a.documentId ?? String(a.id ?? '');
  return out;
};

// Strapi 5 has no built-in populate=deep (that needs a community plugin).
// populate=* only goes one level; media inside components (seo.ogImage)
// needs an explicit nested populate.
const HOMEPAGE_POPULATE =
  'populate[heroImage]=true&populate[heroVideo]=true&populate[seo][populate][ogImage]=true';
const VILLA_POPULATE =
  'populate[heroImage]=true&populate[gallery]=true&populate[seo][populate][ogImage]=true';
const EXPERIENCE_POPULATE = 'populate[icon]=true&populate[gallery]=true';

// Public API ---------------------------------------------------------------

export const getHomepage = (opts?: { draft?: boolean }) =>
  strapiFetch<any>(`/homepage?${HOMEPAGE_POPULATE}`, { tags: ['homepage'], draft: opts?.draft }, 60).then(
    flatten
  ) as Promise<Homepage>;

export const getAllVillas = (opts?: { draft?: boolean }) =>
  strapiFetch<any[]>(`/villas?${VILLA_POPULATE}&sort=order:asc`, { tags: ['villas'], draft: opts?.draft }, 60).then(
    (rows) => rows.map(flatten)
  ) as Promise<Villa[]>;

export const getVillaBySlug = async (slug: string, opts?: { draft?: boolean }) => {
  const tag = `villa:${slug}`;
  try {
    const rows = await strapiFetch<any[]>(
      `/villas?filters[slug][$eq]=${encodeURIComponent(slug)}&${VILLA_POPULATE}`,
      { tags: ['villas', tag], draft: opts?.draft },
      60
    );
    if (!rows?.length) return null;
    return flatten(rows[0]) as Villa;
  } catch {
    return null;
  }
};

export const getAllExperiences = (opts?: { draft?: boolean }) =>
  strapiFetch<any[]>(
    `/experiences?${EXPERIENCE_POPULATE}&sort=order:asc`,
    { tags: ['experiences'], draft: opts?.draft },
    60
  ).then((rows) => rows.map(flatten)) as Promise<Experience[]>;

export const getAllVillasSlugs = async (): Promise<string[]> =>
  (await getAllVillas()).map((v) => v.slug);

export { STRAPI_URL };

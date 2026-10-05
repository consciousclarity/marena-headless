/**
 * Strapi v5 typed client.
 * Single source of truth for how the frontend reads content.
 * Tag-based cache (revalidateTag) lets the /api/revalidate route
 * invalidate exactly what changed.
 */

const STRAPI_URL = process.env.STRAPI_URL || 'https://app.marena.alp-see.com';
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
    // ponytail: throw a typed error so /[slug] can fall back to a 404.
    throw new Error(`Strapi ${res.status} on ${path}: ${await res.text().catch(() => '')}`);
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
  }
  out.documentId = a.documentId ?? String(a.id ?? '');
  return out;
};

// Public API ---------------------------------------------------------------

export const getHomepage = (opts?: { draft?: boolean }) =>
  strapiFetch<any>('/homepage?populate=deep', { tags: ['homepage'], draft: opts?.draft }, 60).then(flatten) as Promise<Homepage>;

export const getAllVillas = (opts?: { draft?: boolean }) =>
  strapiFetch<any[]>('/villas?populate=deep&sort=order:asc', { tags: ['villas'], draft: opts?.draft }, 60).then((rows) =>
    rows.map(flatten)
  ) as Promise<Villa[]>;

export const getVillaBySlug = async (slug: string, opts?: { draft?: boolean }) => {
  const tag = `villa:${slug}`;
  try {
    const rows = await strapiFetch<any[]>(
      `/villas?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=deep`,
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
  strapiFetch<any[]>('/experiences?populate=deep&sort=order:asc', { tags: ['experiences'], draft: opts?.draft }, 60).then((rows) =>
    rows.map(flatten)
  ) as Promise<Experience[]>;

export const getAllVillasSlugs = async (): Promise<string[]> =>
  (await getAllVillas()).map((v) => v.slug);

export { STRAPI_URL };

import { getAllVillas } from '@/lib/cms';
import Link from 'next/link';

// Force runtime: pages depend on Strapi data, no useful prerender.
export const dynamic = 'force-dynamic';

export const revalidate = 60;

export const metadata = {
  title: 'Villas — Marena',
  description: 'Private pool villas in Bingin, Uluwatu, Bali.',
};

/**
 * The villa listing.
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * The homepage's primary call to action points at `/villas`:
 *
 *     <Hero ... ctaLabel="Explore the villas" ctaHref="/villas" />
 *
 * and there was NO `/villas` route. The only dynamic route was
 * `/[slug]`, so `/villas` matched it, `getVillaBySlug('villas')`
 * found nothing, and the page returned the 404. The main call to
 * action on the home page led to a dead end.
 *
 * `MIGRATION.md` lists `/villas` as a route the site is supposed to
 * have ("`/villas` lists all 3"), so this is the missing page, not
 * a new feature.
 *
 * A villa's own URL is `/<slug>` -- the detail page is `/[slug]`, and
 * the listing links there.
 */
export default async function VillasPage() {
  const villas = await getAllVillas().catch(() => []);

  return (
    <main className="mx-auto max-w-[89rem] px-[2.1rem] py-[8.9rem]">
      <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-black/55">
        Stay
      </p>
      <h1 className="mb-[5.5rem] max-w-[55rem] font-serif text-[clamp(2.6rem,7vw,5.6rem)] leading-[1.04] tracking-[-0.03em]">
        The villas
      </h1>

      {villas.length === 0 ? (
        <p className="max-w-[34rem] text-[1.05rem] leading-[1.6] text-black/65">
          No villas are published yet. Please check back shortly.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-[3.4rem] gap-y-[8.9rem] md:grid-cols-3">
          {villas.map((v) => (
            <Link key={v.documentId} href={`/${v.slug}`} className="group block">
              <div className="relative aspect-[1/1.21] overflow-hidden bg-black/5">
                {v.heroImage?.url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={v.heroImage.url}
                    alt={v.heroImage.alternativeText ?? v.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.04]"
                  />
                )}
              </div>
              <h2 className="mt-[2.1rem] font-serif text-[1.6rem] leading-[1.15] tracking-[-0.015em]">
                {v.name}
              </h2>
              <p className="mt-[0.6rem] text-[0.95rem] leading-[1.55] text-black/65">
                {v.tagline}
              </p>
              <p className="mt-[1.3rem] text-[0.82rem] uppercase tracking-[0.18em] text-black/55">
                {v.bedrooms} bedroom{v.bedrooms > 1 ? 's' : ''} · sleeps {v.maxGuests}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

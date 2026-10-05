import { getAllExperiences } from '@/lib/cms';

// Force runtime: pages depend on Strapi data, no useful prerender.
export const dynamic = "force-dynamic";


export const revalidate = 60;

export const metadata = { title: 'Marena Experience' };

export default async function ExperiencesPage() {
  const experiences = await getAllExperiences().catch(() => []);
  return (
    <main className="mx-auto max-w-[89rem] px-[2.1rem] py-[8.9rem]">
      <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-black/55">In-villa</p>
      <h1 className="mb-[5.5rem] max-w-[55rem] font-serif text-[clamp(2.6rem,7vw,5.6rem)] leading-[1.04] tracking-[-0.03em]">
        The Marena Experience
      </h1>
      {/* Anchor strip — 8 quick jumps. Replaces the 8 separate sub-pages. */}
      <nav aria-label="Jump to experience" className="mb-[8.9rem] flex flex-wrap gap-x-[2.1rem] gap-y-[0.8rem]">
        {experiences.map((x) => (
          <a key={x.documentId} href={`#${x.slug}`} className="text-[0.92rem] uppercase tracking-[0.18em] text-black/55 transition hover:text-black">
            {x.title}
          </a>
        ))}
      </nav>

      <div className="space-y-[13.6rem]">
        {experiences.map((x, i) => (
          <section
            key={x.documentId}
            id={x.slug}
            className={`grid grid-cols-1 gap-x-[5.5rem] gap-y-[3.4rem] scroll-mt-[8.9rem] md:grid-cols-[1fr_1.618fr] ${
              i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''
            }`}
          >
            <div>
              <h2 className="font-serif text-[clamp(1.8rem,4vw,3.4rem)] leading-[1.06] tracking-[-0.02em]">
                {x.title}
              </h2>
              <p className="mt-[2.1rem] max-w-[34rem] text-[1.05rem] leading-[1.6] text-black/75">{x.shortPitch}</p>
              {x.longDescription && (
                <div className="prose prose-base mt-[2.1rem] max-w-none text-black/65">
                  <p>{x.longDescription}</p>
                </div>
              )}
            </div>
            <div className="relative aspect-[1.618/1] overflow-hidden bg-black/5">
              {x.gallery[0] && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={x.gallery[0].url}
                  alt={x.gallery[0].alternativeText ?? x.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

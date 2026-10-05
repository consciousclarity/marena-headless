import { Gallery } from '@/components/Gallery';
import { Hero } from '@/components/Hero';
import { getVillaBySlug, getAllVillasSlugs, getAllVillas } from '@/lib/cms';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// Force runtime: pages depend on Strapi data, no useful prerender.
export const dynamic = "force-dynamic";


export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const slugs = await getAllVillasSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const v = await getVillaBySlug(params.slug).catch(() => null);
  if (!v?.seo) return { title: v?.name ?? 'Villa' };
  return {
    title: v.seo.metaTitle,
    description: v.seo.metaDescription,
    openGraph: v.seo.ogImage ? { images: [{ url: v.seo.ogImage.url, width: 1200, height: 630 }] } : undefined,
    robots: v.seo.noindex ? { index: false } : undefined,
  };
}

export default async function VillaPage({ params }: { params: { slug: string } }) {
  const v = await getVillaBySlug(params.slug).catch(() => null);
  if (!v) notFound();

  return (
    <main>
      <Hero eyebrow={`${v.bedrooms} Bedroom${v.bedrooms > 1 ? 's' : ''}`} headline={v.name} subheadline={v.tagline} image={v.heroImage} />

      <section className="mx-auto max-w-[89rem] px-[2.1rem] py-[8.9rem]">
        <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-black/55">Overview</p>
        <h2 className="mb-[3.4rem] max-w-[55rem] font-serif text-[clamp(1.8rem,4.4vw,4.2rem)] leading-[1.08] tracking-[-0.025em]">
          {v.shortDescription}
        </h2>
        <div className="grid grid-cols-1 gap-x-[5.5rem] gap-y-[3.4rem] md:grid-cols-[1.618fr_1fr]">
          {v.longDescription && (
            <div className="prose prose-lg max-w-none">
              {/* Editor-controlled prose — kept minimal. */}
              <p>{v.longDescription}</p>
            </div>
          )}
          <ul className="space-y-[0.9rem] self-start border-l border-black/10 pl-[2.1rem] text-[0.95rem] leading-[1.55]">
            {v.features.map((f, i) => (
              <li key={i} className="text-black/75">{f.label}</li>
            ))}
            <li className="pt-[1.3rem] text-black/55">Sleeps {v.maxGuests}</li>
            {v.priceFrom != null && (
              <li className="text-black/55">From {v.currency} {v.priceFrom.toLocaleString()} / night</li>
            )}
          </ul>
        </div>
      </section>

      <Gallery images={v.gallery} title="The residence" />
    </main>
  );
}

import { Hero } from '@/components/Hero';
import { getHomepage, getAllVillas, getAllExperiences } from '@/lib/cms';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const revalidate = 60;

export default async function HomePage() {
  const [home, villas, experiences] = await Promise.all([
    getHomepage().catch(() => null),
    getAllVillas().catch(() => []),
    getAllExperiences().catch(() => []),
  ]);
  if (!home) notFound();

  return (
    <main>
      <Hero
        eyebrow={home.introEyebrow}
        headline={home.heroHeadline}
        subheadline={home.heroSubheadline}
        image={home.heroImage}
        ctaLabel="Explore the villas"
        ctaHref="/villas"
      />

      <section className="mx-auto max-w-[89rem] px-[2.1rem] py-[8.9rem]">
        <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-black/55">
          Our villas
        </p>
        <h2 className="mb-[5.5rem] max-w-[55rem] font-serif text-[clamp(1.8rem,4.4vw,4.2rem)] leading-[1.08] tracking-[-0.025em]">
          {home.villasHeading}
        </h2>
        <div className="grid grid-cols-1 gap-x-[3.4rem] gap-y-[8.9rem] md:grid-cols-3">
          {villas.map((v) => (
            <Link key={v.documentId} href={`/${v.slug}`} className="group block">
              <div className="relative aspect-[1/1.21] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.heroImage.url}
                  alt={v.heroImage.alternativeText ?? v.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.04]"
                />
              </div>
              <h3 className="mt-[2.1rem] font-serif text-[1.6rem] leading-[1.15] tracking-[-0.015em]">
                {v.name}
              </h3>
              <p className="mt-[0.6rem] text-[0.95rem] leading-[1.55] text-black/65">{v.tagline}</p>
            </Link>
          ))}
        </div>
      </section>

      {experiences.length > 0 && (
        <section className="bg-black px-[2.1rem] py-[8.9rem] text-white">
          <div className="mx-auto max-w-[89rem]">
            <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-white/55">
              In-villa
            </p>
            <h2 className="mb-[5.5rem] max-w-[55rem] font-serif text-[clamp(1.8rem,4.4vw,4.2rem)] leading-[1.08] tracking-[-0.025em]">
              {home.experiencesHeading}
            </h2>
            <div className="grid grid-cols-2 gap-x-[3.4rem] gap-y-[3.4rem] md:grid-cols-4">
              {experiences.map((x) => (
                <Link key={x.documentId} href={`/experiences#${x.slug}`} className="group block">
                  <div className="relative mb-[1.3rem] aspect-square overflow-hidden bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={x.icon.url}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-contain p-[21%] invert transition-transform duration-700 group-hover:scale-110"
                    />
                  </div>
                  <h3 className="font-serif text-[1.3rem] tracking-[-0.01em]">{x.title}</h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

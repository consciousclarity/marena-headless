import { Hero } from '@/components/Hero';
import { getHomepage, getAllVillas, getAllExperiences, cmsRead, cmsHealth } from '@/lib/cms';
import Link from 'next/link';

// Force runtime: pages depend on Strapi data, no useful prerender.
export const dynamic = "force-dynamic";


export const revalidate = 60;

export default async function HomePage() {
  const [homeRes, villasRes, experiencesRes, health] = await Promise.all([
    cmsRead(getHomepage),
    cmsRead(getAllVillas),
    cmsRead(getAllExperiences),
    cmsHealth(),
  ]);

  // The content reads can succeed from Next's cache even when the CMS
  // is refusing every query. A cached-but-real page is the right thing
  // to show a visitor. But it is NOT the right thing to show an OWNER
  // who needs to know the CMS is down — and a site that looks perfect
  // while its CMS is dead is how this stayed broken without anyone
  // noticing.
  //
  // So the health probe is separate and uncached, and a mismatch is
  // logged loudly here. `/api/health` exposes the same signal as a
  // status code for a monitor.
  if (!health.reachable && (homeRes.ok || villasRes.ok || experiencesRes.ok)) {
    console.error(
      `[marena] the CMS is not answering (${health.detail}) but this page was served from cache. ` +
        `The content shown is real but stale. Point a monitor at /api/health.`
    );
  }

  // A CMS FAULT and an EMPTY CMS are different things, and this page
  // used to show the same thing for both.
  //
  // It caught every failure and rendered fallback copy with a
  // placeholder hero image. So when Strapi was down — and it WAS
  // down, answering 403 to every query — the site looked finished: a
  // headline, a hero photo, a "Three places, each its own rhythm."
  // heading, and a villa grid with nothing in it. The visitor saw a
  // website. The owner saw a page that loads. Nobody saw the 403.
  //
  // That is the same shape as a CI gate that passes when it should
  // fail: the signal that would have told you is the signal that got
  // swallowed.
  //
  // So when EVERY read failed, the page says so instead of pretending.
  // When the CMS answers and simply has no entries, the fallback copy
  // is still right — the site is under construction, not broken, and
  // a visitor should not see a stack trace either way.
  const allFailed = !homeRes.ok && !villasRes.ok && !experiencesRes.ok;

  if (allFailed) {
    const status = homeRes.ok ? 0 : homeRes.status;
    const detail = homeRes.ok ? '' : homeRes.detail;
    return (
      <main className="min-h-screen flex items-center justify-center px-[2.1rem]">
        <div className="max-w-[55rem] text-center">
          <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-black/55">
            {status ? `Content unavailable (${status})` : 'Content unavailable'}
          </p>
          <h1 className="mb-[2.6rem] font-serif text-[clamp(2.1rem,5vw,3.8rem)] leading-[1.06] tracking-[-0.025em]">
            The site is up, but its content is not.
          </h1>
          <p className="mx-auto max-w-[34rem] text-[1.05rem] leading-[1.6] text-black/70">
            The CMS did not answer, so there is nothing to show yet. This page
            is deliberately not filled with placeholder copy: a site that looks
            finished while serving no content is worse than one that says it is
            empty.
          </p>
          {detail && (
            <p className="mx-auto mt-[2.6rem] max-w-[34rem] font-mono text-[0.78rem] leading-[1.5] text-black/45 break-words">
              {detail}
            </p>
          )}
          <Link
            href="/"
            className="mt-[3.4rem] inline-block text-[0.92rem] uppercase tracking-[0.18em] border-b border-black/30 hover:border-black pb-[0.4rem] transition-colors"
          >
            Try again
          </Link>
        </div>
      </main>
    );
  }

  const home = homeRes.ok ? homeRes.data : null;
  const villas = villasRes.ok ? villasRes.data : [];
  const experiences = experiencesRes.ok ? experiencesRes.data : [];

  // ponytail: render with fallback copy when Strapi is empty instead of
  // 404ing. Once content is seeded this branch is never hit.
  const safeHome = home ?? {
    heroHeadline: 'A quieter way to be in Bali',
    heroSubheadline: 'Hand-picked villas, curated experiences, zero noise.',
    heroImage: null,
    introEyebrow: 'Marena',
    introHeading: 'Villas by Marena',
    villasHeading: 'Three places, each its own rhythm.',
    experiencesHeading: 'In-villa',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeHeroImage: any = safeHome.heroImage ?? {
    url: 'https://alp-see.at/uploads/hero_placeholder_8e2d1c.jpg',
    alternativeText: 'Bali villa at sunset',
    width: 2400,
    height: 1480,
  };

  return (
    <main>
      <Hero
        eyebrow={safeHome.introEyebrow}
        headline={safeHome.heroHeadline}
        subheadline={safeHome.heroSubheadline}
        image={safeHeroImage}
        ctaLabel="Explore the villas"
        ctaHref="/villas"
      />

      <section className="mx-auto max-w-[89rem] px-[2.1rem] py-[8.9rem]">
        <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-black/55">
          Our villas
        </p>
        <h2 className="mb-[5.5rem] max-w-[55rem] font-serif text-[clamp(1.8rem,4.4vw,4.2rem)] leading-[1.08] tracking-[-0.025em]">
          {safeHome.villasHeading}
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
              {safeHome.experiencesHeading}
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

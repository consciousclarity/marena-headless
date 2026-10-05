'use client';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

type Props = {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  image: { url: string; alternativeText?: string; width: number; height: number };
  ctaLabel?: string;
  ctaHref?: string;
};

/**
 * Editorial hero — Fibonacci-rhythm vertical scale, golden-ratio split
 * between image and the typographic block. Subtle parallax, no jank
 * (transform-only, GPU composited). Reduced-motion users get a static hero.
 */
export function Hero({ eyebrow, headline, subheadline, image, ctaLabel, ctaHref }: Props) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  // ponytail: simple 0 -> 0.2 parallax. Cheap. Upgrade: spring (motion.useSpring)
  // if visible jank on the 1BR / 2BR cards during scroll.
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[600px] w-full overflow-hidden">
      <motion.div style={{ y, opacity }} className="absolute inset-0 will-change-transform">
        <Image
          src={image.url}
          alt={image.alternativeText ?? headline}
          fill
          priority
          sizes="100vw"
          quality={88}
          placeholder="empty"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />
      </motion.div>

      <div className="relative z-10 flex h-full items-end pb-[13.6rem]">
        <div className="mx-auto w-full max-w-[89rem] px-[5.5rem]">
          <motion.div
            initial={{ opacity: 0, y: 21 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[55%]"
          >
            {eyebrow && (
              <p className="mb-[1.3rem] text-[0.78rem] uppercase tracking-[0.21em] text-white/70">
                {eyebrow}
              </p>
            )}
            <h1 className="font-serif text-[clamp(2.6rem,7vw,6.4rem)] leading-[1.02] tracking-[-0.025em] text-white">
              {headline}
            </h1>
            {subheadline && (
              <p className="mt-[1.6rem] max-w-[34rem] text-[clamp(1rem,1.4vw,1.25rem)] leading-[1.55] text-white/85">
                {subheadline}
              </p>
            )}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="mt-[2.6rem] inline-flex items-center gap-[0.8rem] border-b border-white/60 pb-[0.4rem] text-[0.92rem] uppercase tracking-[0.18em] text-white transition hover:border-white"
              >
                {ctaLabel}
                <span aria-hidden>→</span>
              </a>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

'use client';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useState } from 'react';

type Img = { url: string; alternativeText?: string; width: number; height: number };
type Props = { images: Img[]; title?: string };

/**
 * Curated editorial gallery. Per the architect's directive, we cap
 * Strapi to 6–10 images per villa — no more Divi dump. The layout
 * alternates a 1.618 hero shot with two side panels; remaining
 * images are an asymmetric grid using the golden ratio split.
 *
 * All transforms are GPU-only (translate/opacity). Images use
 * next/image with AVIF/WebP, zero CLS via explicit width/height.
 */
export function Gallery({ images, title }: Props) {
  const [lightbox, setLightbox] = useState<Img | null>(null);
  if (!images.length) return null;
  const [hero, ...rest] = images;
  const side = rest.slice(0, 2);
  const tail = rest.slice(2);

  return (
    <section className="mx-auto w-full max-w-[144rem] px-[2.1rem] py-[8.9rem]">
      {title && (
        <h2 className="mb-[4.4rem] font-serif text-[clamp(1.8rem,3.4vw,3.2rem)] tracking-[-0.02em]">
          {title}
        </h2>
      )}

      <div className="grid grid-cols-1 gap-[1.3rem] md:grid-cols-[61.8%_1fr]">
        <motion.button
          type="button"
          onClick={() => setLightbox(hero)}
          initial={{ opacity: 0, y: 34 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="group relative aspect-[1.618/1] overflow-hidden"
          aria-label={`Open ${hero.alternativeText ?? 'image'}`}
        >
          <Image
            src={hero.url}
            alt={hero.alternativeText ?? ''}
            fill
            sizes="(min-width: 768px) 62vw, 100vw"
            quality={85}
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        </motion.button>
        <div className="grid grid-rows-2 gap-[1.3rem]">
          {side.map((img, i) => (
            <motion.button
              key={i}
              type="button"
              onClick={() => setLightbox(img)}
              initial={{ opacity: 0, y: 34 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.8, delay: 0.08 * (i + 1), ease: [0.16, 1, 0.3, 1] }}
              className="group relative aspect-[1.618/1] overflow-hidden"
              aria-label={`Open ${img.alternativeText ?? 'image'}`}
            >
              <Image
                src={img.url}
                alt={img.alternativeText ?? ''}
                fill
                sizes="(min-width: 768px) 38vw, 100vw"
                quality={80}
                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            </motion.button>
          ))}
        </div>
      </div>

      {tail.length > 0 && (
        <div className="mt-[1.3rem] grid grid-cols-2 gap-[1.3rem] md:grid-cols-3">
          {tail.map((img, i) => (
            <motion.button
              key={i}
              type="button"
              onClick={() => setLightbox(img)}
              initial={{ opacity: 0, y: 21 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-5%' }}
              transition={{ duration: 0.6, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
              className="group relative aspect-[1/1.21] overflow-hidden"
              aria-label={`Open ${img.alternativeText ?? 'image'}`}
            >
              <Image
                src={img.url}
                alt={img.alternativeText ?? ''}
                fill
                sizes="(min-width: 768px) 33vw, 50vw"
                quality={78}
                className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              />
            </motion.button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-[2.1rem] backdrop-blur-md"
        >
          <Image
            src={lightbox.url}
            alt={lightbox.alternativeText ?? ''}
            width={lightbox.width}
            height={lightbox.height}
            quality={92}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </section>
  );
}

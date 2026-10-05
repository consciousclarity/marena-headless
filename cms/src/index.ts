/**
 * Fires a webhook to the Next.js frontend on every publish / unpublish.
 * Single chokepoint — every content type that has draftAndPublish goes
 * through this, so the frontend revalidation never misses an event.
 */
import type { Core } from '@strapi/strapi';

const WEBHOOK_URL = process.env.FRONTEND_REVALIDATE_URL || 'https://marena.alp-see.com/api/revalidate';
const WEBHOOK_SECRET = process.env.REVALIDATE_SECRET || '';

export default {
  'content-manager.publish': async (event: { model: string; result: { id: number; documentId: string; slug?: string; updatedAt: string } }) => {
    try {
      const { model, result } = event;
      const tag = `${model}:${result.documentId ?? result.id}`;
      const r = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': WEBHOOK_SECRET,
        },
        body: JSON.stringify({ tag, slug: result.slug, model }),
        // ponytail: 5s timeout. A slow webhook should not block Strapi's
        // publish flow. Upgrade: enqueue in a real job runner (BullMQ) if
        // reliability becomes a problem.
        signal: AbortSignal.timeout(5000),
      });
      strapi.log.info(`[revalidate] ${tag} -> ${r.status}`);
    } catch (err: any) {
      // Never throw — publishing must succeed even if the frontend is down.
      strapi.log.warn(`[revalidate] webhook failed: ${err.message}`);
    }
  },
  'content-manager.unpublish': async (event: { model: string; result: { id: number; documentId: string; slug?: string } }) => {
    const { model, result } = event;
    const tag = `${model}:${result.documentId ?? result.id}`;
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': WEBHOOK_SECRET },
        body: JSON.stringify({ tag, slug: result.slug, model, unpublish: true }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      strapi.log.warn(`[revalidate] unpublish webhook failed: ${err.message}`);
    }
  },
};

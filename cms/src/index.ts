/**
 * Fires a webhook to the Next.js frontend on every publish / unpublish.
 * Single chokepoint — every content type that has draftAndPublish goes
 * through this, so the frontend revalidation never misses an event.
 *
 * Strapi's src/index export only accepts register/bootstrap/destroy.
 * Publish events arrive on the event hub as entry.publish / entry.unpublish.
 */
import type { Core } from '@strapi/strapi';

const WEBHOOK_URL = process.env.FRONTEND_REVALIDATE_URL || 'https://marena.alp-see.com/api/revalidate';
const WEBHOOK_SECRET = process.env.REVALIDATE_SECRET || '';

type EntryEvent = {
  model: string;
  entry?: { id?: number; documentId?: string; slug?: string };
};

async function notify(strapi: Core.Strapi, event: EntryEvent, unpublish = false) {
  const entry = event.entry;
  if (!entry) return;
  const tag = `${event.model}:${entry.documentId ?? entry.id}`;
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        tag,
        slug: entry.slug,
        model: event.model,
        ...(unpublish ? { unpublish: true } : {}),
      }),
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
}

export default {
  register() {},
  bootstrap({ strapi }: { strapi: Core.Strapi }) {
    strapi.eventHub.on('entry.publish', async (event: EntryEvent) => {
      await notify(strapi, event, false);
    });
    strapi.eventHub.on('entry.unpublish', async (event: EntryEvent) => {
      await notify(strapi, event, true);
    });
  },
};

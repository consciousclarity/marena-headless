/**
 * Fires a webhook to the Next.js frontend on every publish / unpublish.
 * Single chokepoint — every content type with draftAndPublish goes through
 * the document service, so frontend revalidation never misses an event.
 *
 * Strapi only accepts `register`, `bootstrap` and `destroy` as exports of this
 * file (anything else fails validation at startup), so the hook is installed
 * as document-service middleware from `bootstrap`.
 */
import type { Core } from '@strapi/strapi';

const WEBHOOK_URL = process.env.FRONTEND_REVALIDATE_URL || 'https://alp-see.at/api/revalidate';
const WEBHOOK_SECRET = process.env.REVALIDATE_SECRET || '';

async function notify(strapi: Core.Strapi, body: Record<string, unknown>) {
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': WEBHOOK_SECRET },
      body: JSON.stringify(body),
      // ponytail: 5s timeout. A slow webhook should not block Strapi's
      // publish flow. Upgrade: enqueue in a real job runner (BullMQ) if
      // reliability becomes a problem.
      signal: AbortSignal.timeout(5000),
    });
    strapi.log.info(`[revalidate] ${body.tag} -> ${r.status}`);
  } catch (err: any) {
    // Never throw — publishing must succeed even if the frontend is down.
    strapi.log.warn(`[revalidate] webhook failed: ${err.message}`);
  }
}

export default {
  register() {},

  bootstrap({ strapi }: { strapi: Core.Strapi }) {
    strapi.documents.use(async (ctx: any, next: () => Promise<any>) => {
      const result = await next();
      if (ctx.action !== 'publish' && ctx.action !== 'unpublish') return result;
      if (!String(ctx.uid).startsWith('api::')) return result;

      // The frontend route keys on the short type name (villa, experience, homepage).
      const model = ctx.contentType?.info?.singularName ?? String(ctx.uid).split('.').pop();
      const documentId = ctx.params?.documentId ?? result?.documentId ?? result?.entries?.[0]?.documentId;
      const slug = result?.entries?.[0]?.slug ?? result?.slug;
      const body: Record<string, unknown> = { tag: `${model}:${documentId}`, slug, model };
      if (ctx.action === 'unpublish') body.unpublish = true;

      // Fire and forget: do not hold up the publish request.
      void notify(strapi, body);
      return result;
    });
  },

  destroy() {},
};

import { cmsHealth } from '@/lib/cms';

// Never cached — this endpoint exists to report the CURRENT state.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * A health endpoint for the CMS.
 *
 * WHY THIS EXISTS
 * --------------
 * The site keeps serving cached content when the CMS dies, and that is
 * the right behaviour for a visitor — a stale-but-real page beats an
 * error page. But it means the site looks perfectly healthy while its
 * CMS is refusing every query. That is exactly how the CMS stayed
 * broken here: every page loaded, every check was green, and the only
 * symptom was a homepage with placeholder copy that nobody questioned.
 *
 * A content read cannot be the health signal, because a cache hit
 * never asks the CMS anything. This endpoint asks, uncached, every
 * time it is called, and answers 503 when the CMS is not reachable.
 * Point a monitor at it and the fault becomes loud.
 *
 *   curl -s -o /dev/null -w '%{http_code}' https://alp-see.at/api/health
 *   200 = the CMS is answering
 *   503 = it is not
 */
export async function GET() {
  const cms = await cmsHealth();

  return Response.json(
    {
      ok: cms.reachable,
      cms: {
        reachable: cms.reachable,
        status: cms.status,
        detail: cms.detail,
      },
    },
    {
      status: cms.reachable ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

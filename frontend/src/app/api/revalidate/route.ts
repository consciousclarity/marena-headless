import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';

/**
 * Called by Strapi on every publish/unpublish (see cms/src/index.ts).
 * Auth: shared secret in x-revalidate-secret header.
 * Invalidates: the model's list tag + (if slug given) the slug-specific tag + paths.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-revalidate-secret');
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  let body: { tag?: string; slug?: string; model?: string; unpublish?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const revalidated: string[] = [];
  if (body.model) {
    revalidateTag(body.model);
    revalidated.push(`tag:${body.model}`);
  }
  if (body.tag) {
    revalidateTag(body.tag);
    revalidated.push(`tag:${body.tag}`);
  }
  if (body.slug) {
    // ponytail: hard-code the two known routes. Add /experiences/<slug> etc.
    // when more content types get their own URLs.
    revalidatePath(`/${body.slug}`);
    revalidated.push(`path:/${body.slug}`);
  }
  // Also bust the home + experiences list pages on any villa/experience change
  if (body.model === 'villa' || body.model === 'experience' || body.model === 'homepage') {
    revalidatePath('/');
    revalidatePath('/villas');
    revalidatePath('/experiences');
    revalidated.push('path:/', 'path:/villas', 'path:/experiences');
  }
  return NextResponse.json({ ok: true, revalidated, at: Date.now() });
}

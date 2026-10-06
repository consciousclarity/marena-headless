# Marena Bali — Headless Migration Runbook

From: `staging.marenabali.com` (WordPress + Divi 4.27.5, 18 pages, 100 media)
To: `alp-see.at` (Next.js 14 + Strapi v5, both on Hostinger)

**Direction (per Alejandro):** build from scratch, no Divi carryover. The
8 "Marena Experience" sub-pages fold into one `/experiences` page with
anchor sections.

---

## 1. Provision the Strapi CMS (Hostinger, ~30 min)

1. hPanel → **Websites** → `alp-see.at` → **Node.js** → **Create app**.
   - Framework: **Strapi** (preset is detected once `package.json` is read).
   - Node version: **22 LTS**.
   - Source: import this `cms/` folder from a GitHub repo (or upload the zip).
2. hPanel → **Databases** → **Create MySQL DB** named `marena_cms` with
   user `marena_cms`. Save the generated password.
3. In the Strapi app's **Environment Variables**, paste values from
   `cms/.env.example` (real ones, never the example). The app will auto-deploy.
4. Open the public URL (e.g. `https://alp-see.at/admin`),
   create the **first admin user**, then go to **Settings → API Tokens**
   and create a **Read-only** token. Paste it into the frontend's
   `STRAPI_API_TOKEN`.
5. Go to **Content Manager**. The 4 collection types and 1 component
   (Villas, Experiences, Homepage, Contact page, shared.seo) are already
   registered from `cms/src/api/`. Click into each and **Save** to
   trigger Strapi's content-type rebuild.

## 2. Provision the Next.js frontend (Hostinger, ~20 min)

1. hPanel → **Websites** → `alp-see.at` → **Node.js** → **Create second app**.
   - Framework: **Next.js**.
   - Node version: **22 LTS**.
   - Source: same GitHub repo, subfolder `frontend/`.
   - Build command: `npm run build`. Start command: `npm start`.
2. Paste the frontend `.env` values (`STRAPI_URL`, `STRAPI_API_TOKEN`,
   `REVALIDATE_SECRET`).
3. Set the **app's domain** to `alp-see.at`. The unified server serves the
   Strapi admin at `https://alp-see.at/admin`, so no CMS subdomain is needed.

## 3. Migrate the photos (one-time, ~45 min)

The current site has **100 media items** in staging. Of those, ~360
references are spread across the 3 villa pages (Divi galleries). We do
**not** carry the full Divi dump — the architect's directive is to
curate.

1. Download the WP media library to local disk:
   ```bash
   # From the staging REST API you already verified
   curl -sL -u "marenabot:***" \
     "https://staging.marenabali.com/wp-json/wp/v2/media?per_page=100" \
     -o staging-media.json
   ```
2. Filter to JPGs (96 of 100), sort by which villa page they appeared on
   using the existing page content (use the `marena-headless` script
   `scripts/classify_media.py` — TODO if you want me to add it).
3. For each villa, pick **6–10** hero shots. The Strapi `gallery`
   field has `min:6, max:10` validation — the schema itself will
   refuse anything else.
4. Upload the chosen set to **Strapi Media Library** (drag-drop in the
   admin, or via the Strapi upload REST endpoint).
5. Re-attach to the relevant Villa entry's `gallery` field.

## 4. Migrate the editorial copy (~30 min)

The current site has ~6 unique content blocks once you strip Divi
shortcodes:

| New Strapi type | Source page(s) | Notes |
|---|---|---|
| `homepage` (1 entry) | staging `/home` | headline, subheadline, intro, hero image |
| `villa` (3 entries: 1BR, 2BR, 4BR) | staging `/1-bedroom-villa`, `/2-bedroom-villa`, `/4-bedroom-villa` | One Strapi entry **per villa type**, not per physical villa (matches current content). |
| `experience` (8 entries) | staging `/marena-experience-bbq-and-groceries`, `…spa-wellness`, `…flowers`, `…wine-champagne`, `…spirits`, `…cakes`, `…beers-and-mix-softdrinks`, `/marena-experience` (intro) | New: all 8 collapse into one `/experiences` page with anchors. |
| `contact-page` (1 entry) | staging `/contact` | email/phone/WhatsApp/address/map. |
| Footer / company info | staging `/company-information` | Static footer copy — put in `app/layout.tsx` directly, not in the CMS. |

Schema-level guardrails (already in `cms/src/api/`) handle character
caps, image dimension rules, and required fields. The editor **cannot
break the layout** without tripping a validation error.

## 5. Cutover and DNS (when client signs off, ~10 min)

1. `alp-see.at` is **already** on Hostinger (verified: HTTP 200,
   hcdn, PHP 8.3 panel). We don't need to move DNS — we just point the
   document root at the Node Web App, then remove the default index.html
   (if any) so Next serves `/`.
2. In hPanel, set the **Node.js app as the primary handler** for
   `alp-see.at` (the panel handles this when you assign a
   domain to a Web App).
3. Smoke test on a real device: `https://alp-see.at/` should
   return 200 with the new hero, `/api/revalidate` should reject POST
   without the secret, and Strapi publish should revalidate the
   affected page within ~2s.
4. **Do not touch `marenabali.com`** — that stays on Premium WP, untouched,
   per Alejandro's instruction.
5. The legacy `staging.marenabali.com` keeps running in parallel during
   the soft-launch window. After 14 days, freeze it (read-only) but
   keep it online for 90 days as a rollback target.

---

## What I deliberately cut (and when to add it back)

- **Contact form email handler** — the schema has the email field but
  no POST handler. Add a Next.js route `/api/contact` + Resend (or
  Hostinger SMTP) when ready. One file.
- **Preview mode** — the `draft: true` query is wired in `cms.ts` but
  no `/api/preview` route exists. Add when the editor needs in-browser
  draft preview. ~30 lines.
- **i18n / multi-language** — schema has `pluginOptions.i18n` but no
  content yet. Add when the client asks.
- **Image blurhash placeholders** — using AVIF/WebP + explicit
  `width`/`height` is already zero-CLS. Blurhash is a polish add.
- **Vercel/Cloudflare image optimization** — the build is locked to
  Hostinger's Node stack. Switching to Vercel would unlock edge
  optimization; the `next.config.mjs` images block is the one knob.
- **Search / filters** — `/villas` lists all 3. Add when there are 10+.

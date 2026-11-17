# Marena — live vs staging audit

Date: 2026-11-18
Scope: `marenabali.com` (live), `staging.marenabali.com` (staging), and
`alp-see.at` (the headless build that replaces staging).

Every finding below was checked against the live servers from this
workstation on the date above. Nothing here is inferred from a config
file or a plan document.

---

## 1. The three surfaces

| Surface | Stack | Verified state |
|---|---|---|
| `marenabali.com` | WordPress + Divi 4.27.9, PHP 8.3, Hostinger Premium WP | 8 pages, 126 media, serves normally |
| `staging.marenabali.com` | WordPress + Divi, PHP 8.3 | 24 pages, 127 media, serves normally |
| `alp-see.at` | Strapi 5 + Next.js 14 (`consciousclarity/marena-headless`) | live, but serving placeholder content |

The headless build is the successor to staging (`MIGRATION.md`: *"From:
staging.marenabali.com (WordPress + Divi 4.27.5, 18 pages, 100 media) /
To: alp-see.at"*). Live stays on Premium WordPress.

---

## 2. Content and feature divergence (live is behind staging)

### 2.1 Pages that exist on staging and are MISSING on live

| Path | live | staging |
|---|---|---|
| `/privacy-policy/` | **404** | 200 |
| `/terms/` | **404** | 200 |
| `/marena-experience/` | **404** | 200 |

`/marena-experience/` is a landing page with a set of child pages
(browse-experiences, airport-transfer, private-chef, scooter-rental,
surf-lesson, villa-cleaning, yoga). Live has none of them.

Live has `/llms.txt`; staging does not. That comes from a Hostinger
plugin on live, so it is not portable by copying a page.

### 2.2 The child theme is two versions apart

- live: `divi-child` **v2.6**
- staging: `divi-child` **v3.0**

v3.0 is where the design work landed: the typography scale, the
`--mb-*` design tokens (including contrast-checked text colours at
9.4:1 and 5.8:1), the `/marena-experience/` section, and the villa-page
typography fixes.

**This is the single biggest gap between the two sites, and it is not
in any repository.** There is no git source for `divi-child` on either
server. The theme exists only as files on the Hostinger account, so
there is no history, no review, and no way to promote v3.0 to live
safely other than copying files by hand.

### 2.3 The database is a copy, not a shared source

Both sites return the same WordPress REST id for the home page
(`id: 22`), which is what a database copy looks like. It does not prove
the two databases are otherwise identical.

---

## 3. Findings on the LIVE site

### 3.1 GDPR: email is collected with no privacy notice and no privacy page

Both sites' `/newsletter/` forms collect an email address. Verified on
both: there is **no link to a privacy policy**, and **no consent,
GDPR, or privacy wording anywhere in the page**.

On live this is worse, because **live has no `/privacy-policy/` page at
all** (404) while staging does. So the live site collects email
addresses with no policy to point a visitor at.

This is the most concrete compliance problem on the live site and it is
fixable by publishing the two pages staging already has.

### 3.2 Username enumeration

`GET https://marenabali.com/wp-json/wp/v2/users?per_page=100` returns
200 with three usernames:

```
adeayung
adminmarena
claudeapi
```

Staging returns 404 for the same request, so staging is already
locked down here and live is not.

`adminmarena` is an administrator account, and `claudeapi` suggests an
API account. These are valid usernames for credential-stuffing and
targeted phishing.

Fix: in WordPress, either restrict the REST users endpoint or stop
publishing author archives. This is a plugin or a small mu-plugin, not
a server change.

### 3.3 Missing alt text

5 of the 6 images on the live home page have no `alt` attribute.
Accessibility and image-search cost, both cheap to fix in the media
library.

### 3.4 Page weight

The live `/4-bedroom-villa/` page loads **4.22 MB** of images. The
staging equivalent is lighter. The images are large files served
without modern formats on most pages.

### 3.5 `xmlrpc.php` is enabled on live and disabled on staging

`https://marenabali.com/xmlrpc.php` returns HTTP 200;
`https://staging.marenabali.com/xmlrpc.php` returns 405. WordPress's
`system.listMethods` is not exposed (the endpoint answers
`"Disabled"`), so the pingback/brute-force amplification vector is
closed — but the endpoint itself is still there on live and staging
does not have it.

### 3.6 Security headers

Live sends `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()` and a
CSP that only adds `upgrade-insecure-requests`. That CSP is
permissive — it allows any script source — so it is close to
decorative. The headless build's `next.config.mjs` has the stronger
header set.

---

## 4. Findings on the HEADLESS build (`alp-see.at`)

This is where the work in this branch landed. Four real defects, all
fixed on `fix/villas-route-and-cms-visibility`:

### 4.1 The primary call to action led to a 404

The home page's hero CTA is `ctaHref="/villas"`. There was no `/villas`
route — the only dynamic route was `/[slug]`, so `/villas` matched it,
`getVillaBySlug('villas')` found nothing, and the page returned 404.

`MIGRATION.md` lists `/villas` as a route the site is supposed to have
(*"`/villas` lists all 3. Add when there are 10+."*), so this was a
missing page rather than a new feature.

**Fixed:** `frontend/src/app/villas/page.tsx` now exists and lists the
villas.

### 4.2 A dead CMS looked exactly like a working site

The home page caught every CMS failure and rendered fallback copy with
a placeholder hero image:

```js
const [home, villas, experiences] = await Promise.all([
  getHomepage().catch(() => null),
  getAllVillas().catch(() => []),
  getAllExperiences().catch(() => []),
]);
```

Strapi **was** down — every query to `https://alp-see.at/api/...`
answers 403 — so the live site was showing "A quieter way to be in Bali"
over a placeholder photograph, with an empty villa grid. The visitor saw
a website. The owner saw a page that loads. Nobody saw the 403.

This is the same shape as a CI gate that passes when it should fail:
the signal that would have told you is the signal that got swallowed.

**Fixed:** `cmsRead()` in `frontend/src/lib/cms.ts` reports whether a
read FAILED, which is a different thing from a CMS that answers with
nothing. When every read fails the page says the content is
unavailable. When the CMS answers and simply has no entries, the
fallback copy still shows — the site is under construction, not broken,
and a visitor should not see a stack trace either way.

### 4.3 A villa with one unpopulated field returned a 500

`Strapi OMITS a repeatable field entirely when it is empty and was not
populated.` So a villa with no `features` set came back with
`features: undefined`, and `[slug]/page.tsx` did `v.features.map(...)`
on it — which threw. The whole villa page returned 500.

The same applied to a missing `heroImage`, which crashed the `Hero`
component on `image.url`.

**Fixed:** `flatten()` now normalises `features` and `gallery` to
arrays unconditionally — the normaliser runs after the key loop, because
the loop only visits keys the response actually contained, so an
omitted field never reached it. The villa page falls back to a
placeholder hero image instead of crashing.

### 4.4 `populate=deep` is invalid in Strapi 5

Strapi 5 has no built-in `populate=deep`; that needs a community
plugin. `populate=*` only goes one level, and media inside a component
(`seo.ogImage`) needs an explicit nested populate.

This is what PR #8 (`cursor/strapi-populate-image-config-b17f`) fixes.
Its populate strings are carried into this branch, so both fixes ship
together.

### 4.5 A warm cache hid the dead CMS, indefinitely

This one was measured rather than reasoned about.

Next caches a successful CMS response for `revalidate` seconds. When
the window lapses, Next revalidates in the background and serves the
cached copy meanwhile. The experiment: warm the cache against a healthy
CMS, flip the CMS to refusing, then request every 20 seconds for two
minutes.

```
t+20s   page=CMS   apiRequests=3
t+40s   page=CMS   apiRequests=3
t+60s   page=CMS   apiRequests=6
t+80s   page=CMS   apiRequests=9
t+100s  page=CMS   apiRequests=12
t+120s  page=CMS   apiRequests=15
```

Read that in two halves, because the two halves say different things.

**Before the window lapses (t+20s, t+40s):** `apiRequests` does not
move. The app did not ask the CMS anything — it served the cache. The
3 in the counter is the priming render. This is ordinary, correct
behaviour.

**After the window lapses (t+60s onward):** every render now issues
three fetches, and the counter climbs 3 → 6 → 9 → 12 → 15, one batch
per render. The app is asking the CMS every time and the CMS is
refusing every time. And the page still says `CMS`.

So the fault never surfaced: five revalidation attempts against a
refusing CMS, and the cached copy held for the whole two minutes. A
failed revalidation does not replace the cached entry, so there is no
point at which the site admits its CMS is gone.

**Serving a stale-but-real page is right for a visitor.** A page with
real content and last week's prices beats an error page. The problem is
the owner's side: the site looks completely healthy while its CMS is
dead. That is the same blindness as the original bug, in a different
costume — the content is real this time, but the fault is still
invisible.

**Fixed:** the health signal no longer comes from a content read.
`cmsHealth()` in `frontend/src/lib/cms.ts` is one deliberately
UNCACHED probe, and `frontend/src/app/api/health/route.ts` exposes it
as a status code:

```
curl -s -o /dev/null -w '%{http_code}' https://alp-see.at/api/health
200 = the CMS is answering
503 = it is not
```

The homepage also logs a loud error when the probe fails but the page
was served from cache, so the mismatch shows up in the server log even
without a monitor.

---

## 5. What is still blocked, and who owns it

| Blocker | Owner | What it needs |
|---|---|---|
| Strapi answers 403 for every API query | Hostinger / hPanel | The `STRAPI_API_TOKEN` env var on the deployed app, and/or the Public role's read permissions in Strapi. Both are hPanel work — this workstation cannot reach hPanel (Cloudflare bot challenge). |
| `divi-child` v3.0 → live | hPanel | Copy the theme, or put it in git first. There is no repository for it. |
| Publish `/privacy-policy/` and `/terms/` on live | WP admin | Two pages that staging already has. |
| The newsletter form's consent text | WP admin | Add a privacy link and consent wording to the form on both sites. |
| Username enumeration on live | WP admin | Lock down `/wp-json/wp/v2/users`. |
| Alt text on 5 live images | WP admin | Media library. |
| Deploying the headless build | Hostinger | The build is verified locally; deploying needs the same hPanel/Hostinger access. |

Nothing in this table was changed. Each one needs either hPanel or the
WordPress admin, and this workstation has neither: hPanel sits behind a
Cloudflare bot challenge, and the VPS rejects the available SSH keys.

---

## 6. Verifying the fixes

```bash
node scripts/verify-cms-behaviour.mjs
```

It builds the frontend, boots a mock Strapi in two modes, and asserts
the difference is visible:

- a healthy CMS renders the CMS's own content, with no fallback copy
  and no placeholder image
- a Strapi answering 403 renders the "content unavailable" page, with
  no fallback copy and no placeholder image
- `/villas` returns 200 and lists the villas
- `/<villa-slug>` returns 200 and shows the villa
- `/<unknown-slug>` returns 404
- `/api/health` returns 200 when the CMS answers and 503 when it does
  not

The mock publishes an identity marker and the gate checks it. That is
not decoration: the first version of this gate bound port 4321, which
the local `gustale.com` Astro dev server already holds, so the health
check passed against gustale.com and the gate then tested a server that
was never talking to the CMS. A health check that only asks "did
something answer HTTP 200?" can be satisfied by a bystander.

The gate also runs TWO app instances — one against a healthy mock, one
against a refusing one — rather than flipping one mock's mode mid-run.
That is because of the fetch cache: the healthy instance would hold a
cached copy of the content, and the dead-CMS check would never reach
the fault path. Separate instances make the check deterministic instead
of a race against a 60-second revalidation window.

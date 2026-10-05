# marena-headless

Decoupled Strapi v5 + Next.js 14 build for the Marena Bali hotel/villa
site. Replaces the legacy WordPress + Divi 4.27.5 install at
`staging.marenabali.com`. Lives at `marena.alp-see.com` (Hostinger,
Business+ plan, Node 22 LTS).

## Layout

```
cms/        Strapi v5 admin + REST API (cms.marena.alp-see.com)
frontend/   Next.js 14 App Router (marena.alp-see.com)
MIGRATION.md  The 5-step runbook
```

## Quick start (local dev)

```bash
# CMS
cd cms && cp .env.example .env  # fill in real DB creds
npm install
npm run develop
# → admin on http://localhost:1337/admin

# Frontend
cd frontend && cp .env.example .env  # point at local Strapi
npm install
npm run dev
# → site on http://localhost:3000
```

## Deploy to Hostinger

See `MIGRATION.md` § 1–2 for the Node Web App setup. Both apps are
deployed from this repo via Hostinger's GitHub integration: `cms/` and
`frontend/` as separate Web Apps.

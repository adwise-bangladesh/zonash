# Splitting Zonash into two projects

One codebase, two deployables. The storefront and the staff dashboard talk to
the **same** backend and the same WooCommerce store, so no data migration is
involved — you only prune code.

```text
this project  --remix-->  copy
     |                      |
 strip-admin.mjs      strip-storefront.mjs
     |                      |
 storefront only        dashboard only
 (public server)        (staff console)
```

## 1. Create the second project

Right-click this project in the Lovable sidebar (or open project name → Settings)
and choose **Remix**. Name it `zonash-admin`. The remix is a full copy that keeps
the same backend connection.

## 2. In the remix: keep only the dashboard

```bash
node scripts/strip-storefront.mjs          # dry run, lists what goes
node scripts/strip-storefront.mjs --apply  # delete
bun install && bun run build
```

It removes storefront routes (`/`, `/cart`, `/checkout`, `/products/*`,
`/step/*`, `/search`, order-status screens, `robots.txt`, `sitemap.xml`),
storefront-only components and feed/pricing helpers, and the storefront Docker
scaffolding. Then it rewrites:

- `src/routes/index.tsx` → redirects `/` to `/admin`
- `src/components/NotFoundView.tsx` → console-styled 404
- `src/routes/__root.tsx` → drops the storefront bottom nav

Shared modules stay in both trees on purpose: `src/lib/woo.*`, `format`,
`customer-history.functions`, the Steadfast / Hoorin / SMS layers, and
`components/checkout/ThanaCombobox` (the POS and order drawer use it).

## 3. In this project: keep only the storefront

```bash
node scripts/strip-admin.mjs --apply
bun run build
```

Deploy the result to your own server with `Dockerfile` / `docker-compose.yml`
(see `DEPLOY.md`), or publish it from Lovable.

## Guard rails

Both scripts refuse to delete anything while a surviving file still imports a
removed module — they print `file -> module` and exit non-zero. Fix by moving
the shared part into `src/lib/`, then re-run.

## Post-split checklist

- Staff sign-in (`/auth`) exists only in the dashboard project.
- Point the dashboard at a private host or subdomain (e.g. `admin.zonash.com`).
- The WooCommerce webhook (`/api/public/webhooks/woo`) must target **one**
  deployment — keep it on the storefront URL and let the dashboard read the
  shared `orders_cache`.
- Update `SITE_URL` in `src/lib/site.ts` per deployment.

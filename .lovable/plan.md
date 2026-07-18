
# Fast WooCommerce Storefront + Custom Order Dashboard

WooCommerce is the API-only backend (products, orders, customers, payments). This app is a fast custom storefront + admin dashboard. Everything sits on TanStack Start with Lovable Cloud for auth, caching, and audit data. Designed to comfortably handle 2000 orders/day (~1.4 orders/min average, ~10-20/min peak).

## Architecture

```text
[Browser]  →  TanStack Start (SSR)
                │
                ├─ Public storefront (products, cart, checkout)
                ├─ Customer area (/_authenticated: my orders)
                └─ Staff dashboard (/_authenticated/admin: order mgmt)
                │
                ▼
   Server functions & /api/public/* routes
                │
   ┌────────────┴────────────┐
   ▼                         ▼
WooCommerce REST API   Lovable Cloud (Supabase)
 (via connector         - auth (customers + staff)
  gateway; server-       - user_roles (admin/staff/viewer/customer)
  side only)             - order cache (fast reads)
                         - webhook events + audit log
                         - notifications
                         - realtime channel
```

Key decision: **WooCommerce stays source of truth**, but we mirror orders into a Lovable Cloud `orders_cache` table so the dashboard is fast and searchable. Writes (status changes, refunds) go to WC first, then update the cache. Webhooks from WC keep the cache fresh in near-realtime.

## Roles & Auth

Table `user_roles` (separate from profiles) with enum `app_role`:
- `admin` — full access, user mgmt, settings
- `staff` — manage orders, refunds, status
- `viewer` — read-only dashboard + analytics
- `customer` — sees only their own orders (matched by email)

Security-definer `has_role()` function used in RLS and route guards. Customers auth via email/password + Google. Staff invited by admins.

## Storefront (public)

- `/` — landing with featured products (SSR, cached 60s)
- `/products` — grid with filters (category, price, search), paginated
- `/products/$slug` — product detail with variants, add-to-cart
- `/cart` — client-side cart (localStorage) + server validation
- `/checkout` — creates WC order via API, redirects to payment
- `/order/$key` — thank-you page (uses WC order key, no login needed)

Performance: SSR + TanStack Query, WC responses cached with stale-while-revalidate, images lazy-loaded, LCP image preloaded per route.

## Customer area (`/_authenticated/`)

- `/account/orders` — list of orders matching the signed-in email
- `/account/orders/$id` — detail, tracking, invoice

## Staff dashboard (`/_authenticated/admin/`)

Gated by `has_role('staff' | 'admin')`.

- `/admin` — today's KPIs (revenue, orders, AOV, pending count)
- `/admin/orders` — paginated table, filters: status, date range, customer, payment method, search (order #, email, name). CSV export.
- `/admin/orders/$id` — full detail: line items, customer, shipping, notes, timeline. Actions: change status (processing → completed / on-hold / cancelled), add note, trigger refund (full/partial), resend email.
- `/admin/analytics` — revenue chart (day/week/month), top products, status breakdown, order volume trend.
- `/admin/notifications` — bell in header, realtime toast on new order via Supabase Realtime channel `orders_cache`.
- `/admin/users` (admin only) — invite staff, assign roles.
- `/admin/settings` (admin only) — WC connection health check, webhook status.

## WooCommerce integration

Connect via `standard_connectors--connect` (`woocommerce`). All calls go through the connector gateway from server functions only — consumer keys never touch the browser.

Server-fn helpers in `src/lib/woo.functions.ts`:
- `listProducts`, `getProduct` (public, cached)
- `createOrder` (from checkout)
- `listOrders`, `getOrder` (staff)
- `updateOrderStatus`, `refundOrder`, `addOrderNote` (staff, audited)
- `getReports` (analytics)

Rate-limit protection: server-side request coalescing + retries with exponential backoff on 429/5xx. Timeouts (5s) with typed error fallbacks so a WC hiccup never blanks the dashboard.

## Webhook ingestion (`/api/public/webhooks/woo`)

WC configured to send webhooks (order.created, order.updated, order.deleted) to our public endpoint. Handler:
1. Verify HMAC signature (`x-wc-webhook-signature`, base64 HMAC-SHA256 of raw body with shared secret). Timing-safe compare.
2. Idempotency: check `webhook_events` table by `x-wc-webhook-delivery-id`; skip if seen.
3. Upsert into `orders_cache`.
4. Insert notification row (triggers realtime).
5. Return 200 quickly.

## Data model (Lovable Cloud)

```sql
app_role enum: 'admin' | 'staff' | 'viewer' | 'customer'
profiles(id, email, full_name, created_at)
user_roles(id, user_id, role, unique(user_id, role))
orders_cache(
  wc_order_id bigint PK, order_number, status, total, currency,
  customer_email, customer_name, payment_method,
  created_at, updated_at, raw jsonb,
  fts tsvector generated  -- for fast search
)
webhook_events(delivery_id PK, topic, received_at, processed_at, error)
order_audit_log(id, wc_order_id, actor_user_id, action, before jsonb, after jsonb, at)
notifications(id, user_id, type, payload, read_at, created_at)
```

All tables: explicit `GRANT`s + RLS. `orders_cache` readable by staff/admin/viewer; customers only see rows matching their verified email. Audit log insert-only.

Indexes: `orders_cache(status)`, `(created_at desc)`, `(customer_email)`, GIN on `fts`. Comfortably handles 2000 orders/day (~730k/year — trivial for Postgres with these indexes).

## Performance targets

- p95 storefront TTFB < 300ms (SSR + edge)
- p95 dashboard list < 400ms (reads from `orders_cache`, not WC)
- Webhook processing < 200ms
- Zero WC calls on dashboard list views — only on detail actions

## Security

- All WC credentials server-only (connector gateway).
- RLS on every table; roles in separate table; `has_role()` security-definer.
- Zod validation on every server-fn input and webhook payload.
- HMAC-verified webhooks, idempotent.
- Rate-limit sensitive endpoints (checkout, login) with a small Postgres-backed limiter.
- HTTPS everywhere, secure cookies, CSRF-safe (server fns use bearer + same-origin).
- Audit log for every staff action.
- Leaked-password protection (HIBP) enabled.
- Input validation client + server; encoded URL params; no `dangerouslySetInnerHTML`.
- Error boundaries never leak raw provider errors to users.

## Build order

1. **Enable Lovable Cloud** — auth + DB.
2. **Connect WooCommerce** via `standard_connectors--connect`.
3. **Schema migration**: roles, orders_cache, webhook_events, audit, notifications + RLS + grants + indexes.
4. **Auth foundation**: email/password + Google, `_authenticated` layout, profiles trigger, role helpers, sign-in/up UI.
5. **WC server-fn layer**: typed wrappers around WC REST via gateway, with retries + Zod schemas.
6. **Storefront**: products list/detail, cart, checkout → creates WC order.
7. **Webhook endpoint** + backfill script to seed `orders_cache` from existing WC orders.
8. **Customer area**: my orders list + detail.
9. **Staff dashboard**: order list, filters, search, CSV export, detail + status/refund actions, audit trail.
10. **Realtime + notifications**: subscribe to `orders_cache` changes, bell + toast.
11. **Analytics**: KPI cards + charts (revenue, AOV, top products, volume).
12. **Admin user mgmt**: invite staff, assign roles, settings page with WC health check.
13. **Polish**: SEO metadata per route, error/404 boundaries, loading skeletons, mobile.
14. **Hardening**: rate limits, run security scan, load-test webhook.

## Design direction

Clean, dense, utility-first admin (think Linear/Stripe dashboard) with a warmer, product-forward storefront. Dark-mode-ready via CSS variables in `src/styles.css`. Fonts + palette committed once as tokens — no generic Inter/purple defaults.

## Deliverables per milestone

Each build step ends with: working feature in preview, RLS + grants in place, error boundaries wired, and (where relevant) a security scan pass.

---

**Scope note:** This is a large build (12–14 milestones). I'll ship milestone 1–3 in the first pass (Cloud + WC connection + schema + auth skeleton) so you can verify the foundation before we layer features. I'll pause after each milestone for you to review.

Ready to start with milestone 1 when you approve.

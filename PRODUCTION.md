# Production Readiness Checklist — Zonash

Status of the 14 must-do items. ✅ = done in code, 🟡 = requires operator
action outside the repo, 🔲 = todo.

## 1. Env & keys ✅ audited / 🟡 rotate before launch

Client bundle is clean of `process.env` — verified with:
```
rg -n "process\.env" src/components src/routes src/hooks | rg -v "\.server|\.functions|/api/"
```
Nothing returned. All secrets live in server-only modules.

Before launch, rotate every credential once so any keys shared during
development are invalidated:

| Secret                  | Where to rotate                                       |
| ----------------------- | ----------------------------------------------------- |
| `WOOCOMMERCE_API_KEY`   | Connectors → WooCommerce → Rotate                     |
| `WC_WEBHOOK_SECRET`     | WooCommerce → Settings → Advanced → Webhooks          |
| `STEADFAST_API_KEY` / `STEADFAST_SECRET_KEY` | Steadfast merchant dashboard        |
| `HOORIN_API_KEY`        | Hoorin OG-Connect dashboard                           |
| `BDBULKSMS_TOKEN`, `BULKSMSBD_API_KEY` | Respective SMS vendor portals          |
| `LOVABLE_API_KEY`       | Lovable → Settings → API keys (managed)               |

After rotating each vendor key, update its value with the `set_secret`
tool (or through the Secrets panel).

## 2. Rate limits & abuse ✅

- `src/lib/abuse.server.ts` — Postgres-backed velocity counters per
  IP / fingerprint / phone with hard ceilings and soft scoring.
- `src/lib/otp.functions.ts` — `assessOrderSubmit` + `recordOrderSubmit`
  called on every OTP send (the sole entry point into order submission).
- Coupon apply enforces `max_uses` + `max_per_phone` against
  `coupon_usage`.
- SMS cap: 10 OTP sends / day / phone (see `otp.functions.ts`).

## 3. Webhook signature verification ✅

Both webhook receivers reject unsigned / mismatched payloads using
`crypto.timingSafeEqual`:

- `src/routes/api/public/webhooks/woo.ts` — HMAC-SHA256 base64 of raw body.
- `src/routes/api/public/webhooks/steadfast.ts` — bearer token compare.

## 4. RLS audit ✅ (findings triaged)

Security scanner findings reviewed:

- `abuse_events`, `coupon_usage`, `customer_login_otps`, `order_otps` —
  intentionally locked; only touched by `supabaseAdmin` in server code.
  Fail-closed, not a vulnerability. Marked ignored.
- Two `SECURITY DEFINER` warnings — `public.has_role` and the timestamp
  trigger. Required to bypass RLS recursion; standard Supabase pattern.
- `server_error_log` — staff-only SELECT policy, service-role writes.

Re-run the scanner in CI before each release.

## 5. Caching headers ✅ (edge cache in place)

WooCommerce reads are wrapped in `src/lib/woo.server.ts` with:
- 30s in-memory micro-cache
- Single-flight coalescing
- Cloudflare Cache API with 60s edge TTL + SWR

That is the safe layer for storefront traffic. HTML responses are SSR'd
per request (auth-dependent) and intentionally not edge-cached.

## 6. Image pipeline ✅

`src/lib/product-image.ts` builds `?w=…&quality=80&format=webp` srcsets
across 6 widths. Jetpack / Photon / Cloudflare-proxied origins honour
these params; unknown origins fall back gracefully.

## 7. Bundle / code-split 🟡 partial

- `Lightbox` is `React.lazy` on the collection page ✅
- `ReviewsCarousel` and `CountdownInline` are currently inline in
  `src/routes/step.$slug.tsx`. Extract to their own modules and lazy-load
  when we see LCP regressions; ≤10KB gain today.

## 8. Preload / preconnect ✅

`src/routes/__root.tsx` now preconnects
`connector-gateway.lovable.dev` and dns-prefetches `i0/i1/i2.wp.com` in
addition to the existing font origins.

## 9. Observability ✅

- `public.server_error_log` table (staff-read RLS, service-role write).
- `src/lib/observability.server.ts` exports `logServerError` and
  `withErrorLog(scope, handler)` wrapper.
- Wire it into hot server functions incrementally, e.g.:
  ```ts
  .handler(withErrorLog("orders.submit", async ({ data }) => { ... }))
  ```

## 10. Load test 🟡 operator-run

`scripts/loadtest.js` — k6 ramping-VU scenario to 500 concurrent users
across `/`, `/products`, `/step/<slug>`, `/collection/<slug>`.

```
k6 run \
  -e BASE=https://project--c1019e6e-9ce4-4035-a58d-b94909a34398-dev.lovable.app \
  -e STEP_SLUG=<real-slug> \
  -e COLLECTION_SLUG=mega-sale \
  scripts/loadtest.js
```

Success gates encoded in the script: `p95 < 800ms`, error rate `< 0.5%`.

## 12–14 — Operator todos before launch

- **Legal pages** — add `/privacy`, `/terms`, `/refund-policy` (Bangladesh
  COD refund policy + explicit disclosure of the GPS / fingerprint we
  collect in `src/lib/tracking.ts`).
- **Backups** — enable daily PITR on Lovable Cloud (backend panel) and
  nightly `orders_cache` export to R2/S3.
- **Admin 2FA** — enable TOTP on every account holding the `admin` role.
  Verify `has_role(auth.uid(), 'admin')` gate is present on every
  privileged server function.


# Industrial-Grade Orders Management

Two problems to solve:
1. **Custom WooCommerce statuses** (e.g. `wc-shipped`, `wc-out-for-delivery`) aren't in the hardcoded tab list, so those orders are invisible.
2. **Admin Orders page is slow** because it queries WooCommerce REST directly on every page load — WC REST is the bottleneck (single MySQL, no proper indexes on 50M rows, ~1–3s per call, rate-limited).

To handle **3,000 orders/day and 50M+ lifetime**, the dashboard must never touch WooCommerce for list/search/filter. Everything reads from a Postgres `orders_cache` in Lovable Cloud, kept in sync by webhooks + a reconciliation worker.

---

## Part 1 — Dynamic custom statuses (quick fix, ships first)

- New server fn `listOrderStatuses` → calls WooCommerce `/reports/orders/totals` **and** merges with distinct statuses seen in `orders_cache`. Returns `{ slug, name, count }[]`.
- Admin Orders page renders tabs dynamically from that list — no hardcoded status array. Custom slugs like `shipped`, `out-for-delivery`, `ready-to-ship` appear automatically with correct counters.
- Status dropdown in the row + drawer also uses this dynamic list, so staff can move an order into any custom status the store defines.
- Unknown-status badge gets a neutral color fallback.

## Part 2 — Cache-first architecture (the real fix)

```text
WooCommerce  ──webhooks──▶  /api/public/webhooks/woo  ──▶  orders_cache (Postgres)
                                                                │
Admin dashboard  ◀── fast SQL (indexed, paginated, FTS) ────────┘
                                                                ▲
Reconciliation cron (every 5 min) ──── polls WC "updated_after" ┘
Backfill job (one-off) ──────────────── pages entire WC history ┘
```

### Schema upgrades to `orders_cache`
- Add columns: `sku_summary text`, `shipping_address jsonb`, `subtotal numeric`, `shipping_total numeric`, `line_items jsonb`, `payment_method text`, `payment_method_title text`, `date_created timestamptz`.
- Indexes:
  - `btree (status, date_created desc)` — status tabs sorted newest first
  - `btree (date_created desc)` — global feed
  - `btree (customer_email)`
  - `btree (wc_order_id)` unique
  - `gin (fts)` — full-text search across order#, name, email, phone, SKU
  - Optional: **monthly partitioning** on `date_created` once row count > ~10M. Keeps hot partition tiny and vacuum cheap. Deferred until needed; schema designed to allow it.
- Materialized view `order_status_counts(status, count)` refreshed every 30s via cron for O(1) tab counters at 50M rows.

### Webhook handler (already exists, harden it)
- Verify HMAC (already done).
- Idempotent upsert into `orders_cache` keyed on `wc_order_id`; store full raw payload in `raw jsonb`.
- Populate all denormalized columns (SKU list, shipping address, totals) in the same upsert so the dashboard never needs to unpack JSON.
- Insert `notifications` row for realtime toast on new order.

### Reconciliation cron (`/api/public/hooks/reconcile-orders`, every 5 min via pg_cron)
- Pulls `orders?modified_after=<last_sync>&per_page=100` from WC in a loop.
- Upserts anything missing (covers webhook drops, downtime, historical edits).
- Stores `last_sync_at` in a `sync_state` table.
- Backfill mode: same route with `?full=1` walks the entire WC history in pages — one-time seed for existing orders.

### Admin dashboard reads from cache
- New server fn `listOrders` queries `orders_cache` with parameterized filters (status, date range, search) — sub-50ms even at 50M rows because of the indexes.
- `getOrderStatusCounts` reads the materialized view instead of hitting WC — instant.
- Detail view still fetches `getWooOrder` live for edits (single-row WC hit is fine).
- Status writes go to WC first, then update the cache row + append `order_audit_log`.

### Search
- Postgres FTS on generated `fts` tsvector (order#, customer name, email, phone, SKU list). Handles typos with `websearch_to_tsquery`. No Elasticsearch needed at this scale.

### Real-time
- Supabase Realtime subscription on `orders_cache` INSERT/UPDATE → dashboard live-updates rows without refresh.

## Part 3 — Performance targets

| Operation | Before | After |
|---|---|---|
| Load 100 orders | 2–4s (WC) | < 100ms (Postgres) |
| Status counters | 800ms (WC totals) | < 10ms (matview) |
| Search "9821 / email / SKU" | 3–8s (WC) | < 80ms (FTS) |
| Status change | 1s | 1s (unchanged; WC is source of truth) |
| Peak throughput | ~50 req/min (WC rate limit) | thousands/sec (Postgres) |

50M orders in `orders_cache` with the index set above uses ~40–60 GB and stays fast; partition by month later if needed.

## Part 4 — Security & reliability

- All webhook + cron endpoints under `/api/public/*` with HMAC + shared-secret verification.
- RLS on `orders_cache` unchanged: staff/admin/viewer read all; customers see their own by email.
- `order_audit_log` records every staff status change (already exists).
- Rate-limit reconcile cron with an advisory lock so overlapping runs can't stampede WC.
- Retries with exponential backoff on WC 429/5xx (already exists in `woo.server.ts`).
- Errors from WC never blank the dashboard — cache read always succeeds independently.

## Build order

1. **Dynamic statuses** — `listOrderStatuses` + tab/dropdown refactor (fastest visible win).
2. **Schema migration** — add denormalized columns, indexes, matview, `sync_state` table.
3. **Webhook enrichment** — write all new columns on upsert.
4. **Backfill route** — seed `orders_cache` from full WC history.
5. **Reconciliation cron** — pg_cron every 5 min.
6. **Switch admin Orders page to cache reads** — `listOrders`, matview counts, FTS search.
7. **Realtime subscription** on `orders_cache`.
8. **Load test** — simulate 3k orders/day burst, verify p95 < 100ms.

Milestone 1 ships immediately (custom statuses visible + faster tab counts). Milestones 2–7 land the cache-first architecture. Confirm and I'll start with milestone 1.

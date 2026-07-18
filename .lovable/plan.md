# Admin Header + POS Upgrade

## 1. Global search bar

Replace the placeholder search input with a **command-palette-style global search** wired to WooCommerce.

- **Scope**: Name, Mobile, Order ID (`#12345`), Consignment ID (Steadfast tracking/invoice), Email.
- **Behaviour**:
  - 300 ms debounce, min 2 chars.
  - Detects intent from input:
    - Pure digits ≥ 5 → try Order ID + Mobile + Consignment ID in parallel.
    - Contains `@` → email search.
    - Starts with `#` → strip and treat as Order ID.
    - Otherwise → name + mobile fuzzy.
  - Results dropdown shows up to 8 orders (order #, customer, phone, status pill, total).
  - Click → open the existing `OrderDrawer` for that order.
  - `⌘K` / `Ctrl+K` shortcut opens/focuses; `Esc` closes.
- **Server**: new `searchOrders` server fn that fans out WooCommerce queries:
  - `GET /orders?search={q}` for name/email/phone
  - `GET /orders/{id}` when numeric
  - `GET /orders?meta_key=_steadfast_consignment_id&meta_value={q}` for consignment lookup
  - De-duplicate by order ID, sort by date desc.

## 2. Header enhancements

Redesign `AdminShell` topbar into these zones (left → right):

```text
[☰] [Search…                    ⌘K]   [Clock]  [⛶ Fullscreen]  [🔔 Issues N]  [+ New Order ▾]  [avatar]
```

- **Live clock**: shows `Sat, 18 Jul · 09:42 AM` — updates every 30 s, uses Asia/Dhaka timezone.
- **Fullscreen toggle**: uses `document.documentElement.requestFullscreen()` / `exitFullscreen()`; swaps icon between `Maximize2` and `Minimize2`.
- **Issues badge**: mirrors the sidebar shake-badge but as a top-bar bell icon. Same `useIssuesCount` hook (already built). Clicking navigates to `/admin/returns`.
- **New Order dropdown**: `[+ New Order ▾]` opens a small menu:
  - Phone call → `/admin/pos?channel=phone`
  - WhatsApp → `/admin/pos?channel=whatsapp`
  - Messenger → `/admin/pos?channel=messenger`
  - Instagram → `/admin/pos?channel=instagram`
  - In-store → `/admin/pos?channel=instore`
  - Other → `/admin/pos?channel=other`

## 3. POS page — `/admin/pos`

A focused single-page order creation flow for staff to punch in manual orders.

**Layout**: two-column desktop, single column mobile.

- **Left — Cart / product search**
  - Search box: name / SKU with debounced WooCommerce product lookup.
  - Result rows: image, name, SKU, price, "+ Add" button. Handles variations (pick variation before add).
  - Cart list: qty +/−, unit price editable, per-line remove, live subtotal.
  - Shipping: same Dhaka Inside / Outside toggle used in checkout (80 / 130 BDT fixed).
  - Discount field (flat BDT).

- **Right — Customer & meta**
  - Channel pill pre-filled from `?channel=` (editable).
  - Customer: Name, Mobile, Email (optional), Address, Thana, Notes — the same minimal set as checkout.
  - Auto-verify: as soon as a valid mobile is entered, call `getCustomerStats` + Hoorin ratio pill inline (helps staff spot risky callers before confirming).
  - Payment: fixed to Cash on Delivery.
  - Totals card: items + shipping − discount = grand total.
  - Buttons: **Save as draft** (status `on-hold`) / **Confirm order** (status `processing`).

- **Server fn**: `createManualOrder` — builds a WooCommerce `POST /orders` payload with:
  - `set_paid: false`, `payment_method: cod`, `payment_method_title: "Cash on Delivery"`
  - `meta_data: [{ key: "_zonash_channel", value: channel }, { key: "_zonash_created_by", value: staff name }]`
  - `customer_note`, billing/shipping blocks, `line_items`, `shipping_lines`, `fee_lines` (discount as negative fee).
- On success → toast + redirect to `/admin/orders` with new order preselected (via `?open={orderId}`).

## 4. Additional recommended improvements

Bundled in the same pass:

1. **Persist orders-page filters in URL** — status tab, page, and search now live in TanStack `validateSearch`, so refresh and share-links keep state.
2. **Toast on new inbound orders** — every 60 s, quietly refetch order counts; when count of `processing` increases, toast "🛎️ New order received" and animate the sidebar Orders row.
3. **Keyboard shortcuts**: `⌘K` search, `⌘N` new order menu, `g o` → orders, `g d` → dashboard.
4. **`?open={orderId}` deep link** on `/admin/orders` opens the drawer automatically — used by search results, POS success redirect, and shareable links.
5. **Header compaction on scroll** — reduces topbar height from 56 → 44 px after 40 px scroll for more vertical room on order lists.

## Technical file changes

```text
src/components/admin/AdminShell.tsx           — new topbar layout, clock, fullscreen, bell, New-Order menu
src/components/admin/GlobalSearch.tsx         — new command-palette search + dropdown
src/components/admin/NewOrderMenu.tsx         — new dropdown with channel choices
src/lib/orders.functions.ts                   — add searchOrders({ q, signal })
src/lib/pos.functions.ts                      — new createManualOrder server fn
src/routes/_authenticated/admin/pos.tsx       — new POS page
src/routes/_authenticated/admin/orders.tsx    — support ?open= deep link + URL-persisted filters
```

No DB migration required — POS orders live in WooCommerce like every other order; the `_zonash_channel` / `_zonash_created_by` order meta drives analytics later.

## Out of scope (for this milestone)

- POS receipt printing (can reuse the existing label print later).
- Inventory reservation before order confirmation.
- Split payments / partial COD.

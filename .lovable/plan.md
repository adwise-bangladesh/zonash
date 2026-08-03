# Storefront order workflow: stages + statuses

Adopt your two-layer model now, on the storefront only. WooCommerce keeps a small set of milestone statuses; the detailed workflow status lives in a separate field the storefront writes and reads. The admin dashboard can consume the same field later without any rework.

## The two layers

**Layer 1 — WooCommerce status (milestones only, unchanged compatibility):**
`checkout-draft`, `pending`, `processing`/`confirmed`, `completed`, `cancelled`, `refunded`, `failed`.

**Layer 2 — workflow stage + status (new, source of truth for display):**
stored on the order as `_zonash_stage` and `_zonash_workflow_status`, plus `_zonash_stage_history` (append-only JSON list of `{stage, status, at, note, actor}`).

Full catalogue (exactly your list):

```text
created        draft, order_placed, otp_verified, manual_review
verification   pending_verification, awaiting_call, callback_requested,
               unreachable, verification_failed, verified
fulfillment    awaiting_payment, paid, print_invoice, picking,
               quality_check, packing, packed
shipping       ready_for_pickup, pickup_scheduled, picked_up, in_transit,
               at_delivery_hub, out_for_delivery, delivery_attempted,
               delivery_on_hold
delivered      delivered
returns        return_requested, return_approved, return_in_transit,
               return_received, refund_pending, refunded
cancelled      cancelled_by_customer, cancelled_by_admin, cancelled_unreachable,
               cancelled_duplicate, cancelled_fraud, cancelled_out_of_stock
failed         payment_failed, courier_rejected, address_invalid, system_error
```

Each workflow status carries a fixed customer-facing label, a short customer-facing note, and the Woo milestone status it implies. Internal-only statuses (picking, quality_check, print_invoice, manual_review reasons) get a neutral customer label so the timeline never leaks ops detail.

## What the storefront writes

The checkout/OTP flow stops inventing ad-hoc meta combinations and instead sets one workflow status per transition (keeping today's existing meta for backwards compatibility):

| Moment | Woo status | Workflow status |
| --- | --- | --- |
| Checkout form autosave | `checkout-draft` | `created / draft` |
| Place Order clicked, OTP sent | `pending` | `created / order_placed` |
| OTP code verified | `pending` | `created / otp_verified` |
| Session phone matched, OTP skipped | `pending` | `created / otp_verified` |
| Fraud/duplicate/GPS+fingerprint match | `pending` | `created / manual_review` |
| Verified + trusted, awaiting call choice | `pending` | `verification / pending_verification` |
| Customer asks for a call | `pending` | `verification / callback_requested` |
| Customer confirms without call | `confirmed`/`processing` | `verification / verified` |
| Blocked customer | `cancelled` | `cancelled / cancelled_fraud` |

Courier and warehouse statuses (fulfillment, shipping, returns) are not written by the storefront — they arrive later from the dashboard and courier webhooks. The storefront only needs to *render* them, which it will as soon as the field is present.

## What the storefront reads

`/order-status` timeline is rebuilt from the stage catalogue instead of hardcoded stage logic:

- All eight stages come from one shared definition, so a status written by the future dashboard (e.g. `shipping / out_for_delivery`) renders correctly with zero extra code.
- The stage rail shows only stages that are relevant to the order: created → verification → fulfillment → shipping → delivered normally; returns/cancelled/failed replace the tail when terminal.
- Each stage lists its events from `_zonash_stage_history`, so the customer sees real timestamps in real order instead of derived guesses.
- Legacy orders with no workflow meta fall back to today's derivation, so existing orders keep working.
- Status pill and the call-choice card read the workflow status rather than raw Woo status.

## Technical notes

- New `src/lib/order-workflow.ts` — pure, shared: stage/status enums, labels, customer notes, Woo-status mapping, ordering, `resolveWorkflow()` fallback for legacy orders. No server imports, so both storefront and the later dashboard can import it.
- New `src/lib/order-workflow.server.ts` — `setWorkflowStatus(orderId, status, {note, actor})`: writes `_zonash_stage`, `_zonash_workflow_status`, appends to `_zonash_stage_history` (capped, e.g. last 40 entries), and sets the mapped Woo status in the same PUT — one call, no extra round trip, keeps the existing draft-demotion guard.
- `src/lib/otp.functions.ts` — replace scattered status/meta writes with `setWorkflowStatus` calls at the transitions in the table above. Keep existing `_zonash_*` meta writes so nothing that reads them breaks.
- `src/lib/order-timeline.functions.ts` — derive stages from the catalogue + history; keep the current derivation as the legacy fallback path.
- `src/routes/order-status.tsx` — render N stages generically (already close to this), add icons/tones for shipping/returns/failed stages.
- Private WooCommerce order notes stay as they are today, one professional line per transition.
- No database migration needed: workflow state lives on the Woo order, matching where the rest of the storefront's order truth already lives.

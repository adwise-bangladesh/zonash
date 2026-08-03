/**
 * Order workflow: business stages + granular statuses.
 *
 * Two layers:
 *  1. WooCommerce status — milestones only (checkout-draft, pending,
 *     confirmed/processing, completed, cancelled, refunded, failed) so plugins
 *     and courier integrations keep working.
 *  2. Workflow stage + status — the detailed operational state, stored on the
 *     order as `_zonash_stage`, `_zonash_workflow_status` and an append-only
 *     `_zonash_stage_history` JSON list.
 *
 * This module is PURE (no server imports) so the storefront and the future
 * admin dashboard can both import it.
 */

export type WorkflowStage =
  | "created"
  | "verification"
  | "fulfillment"
  | "shipping"
  | "delivered"
  | "returns"
  | "cancelled"
  | "failed";

export type WorkflowStatus =
  // created
  | "draft"
  | "order_placed"
  | "otp_verified"
  | "manual_review"
  // verification
  | "pending_verification"
  | "awaiting_call"
  | "callback_requested"
  | "unreachable"
  | "verification_failed"
  | "verified"
  // fulfillment
  | "awaiting_payment"
  | "paid"
  | "print_invoice"
  | "picking"
  | "quality_check"
  | "packing"
  | "packed"
  // shipping
  | "ready_for_pickup"
  | "pickup_scheduled"
  | "picked_up"
  | "in_transit"
  | "at_delivery_hub"
  | "out_for_delivery"
  | "delivery_attempted"
  | "delivery_on_hold"
  // delivered
  | "delivered"
  // returns
  | "return_requested"
  | "return_approved"
  | "return_in_transit"
  | "return_received"
  | "refund_pending"
  | "refunded"
  // cancelled
  | "cancelled_by_customer"
  | "cancelled_by_admin"
  | "cancelled_unreachable"
  | "cancelled_duplicate"
  | "cancelled_fraud"
  | "cancelled_out_of_stock"
  // failed
  | "payment_failed"
  | "courier_rejected"
  | "address_invalid"
  | "system_error";

export type WorkflowTone = "default" | "warn" | "danger" | "success";

export type WorkflowStatusDef = {
  stage: WorkflowStage;
  /** Customer-facing label. Never leaks internal ops vocabulary. */
  label: string;
  /** Customer-facing one-liner shown on the order timeline. */
  note: string;
  /** WooCommerce milestone status this workflow status implies. */
  woo: string;
  tone?: WorkflowTone;
};

export const STAGE_ORDER: WorkflowStage[] = [
  "created",
  "verification",
  "fulfillment",
  "shipping",
  "delivered",
  "returns",
  "cancelled",
  "failed",
];

export const STAGE_LABEL: Record<WorkflowStage, string> = {
  created: "Created",
  verification: "Verification",
  fulfillment: "Fulfillment",
  shipping: "Shipping",
  delivered: "Delivered",
  returns: "Returns",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** Stages that replace the normal tail once reached. */
export const TERMINAL_STAGES: WorkflowStage[] = ["returns", "cancelled", "failed"];

/** The happy-path rail shown to customers. */
export const MAIN_STAGES: WorkflowStage[] = [
  "created",
  "verification",
  "fulfillment",
  "shipping",
  "delivered",
];

export const WORKFLOW_STATUSES: Record<WorkflowStatus, WorkflowStatusDef> = {
  // ---------- Created ----------
  draft: {
    stage: "created",
    label: "Order drafted",
    note: "Your details were saved and the order was reserved for you.",
    woo: "checkout-draft",
  },
  order_placed: {
    stage: "created",
    label: "Order placed",
    note: "We received your order and started verification.",
    woo: "pending",
  },
  otp_verified: {
    stage: "created",
    label: "Phone number verified",
    note: "The one-time code sent to your mobile was confirmed.",
    woo: "pending",
  },
  manual_review: {
    stage: "created",
    label: "Manual review",
    note: "Our team is taking a quick look at this order before dispatch.",
    woo: "pending",
    tone: "warn",
  },

  // ---------- Verification ----------
  pending_verification: {
    stage: "verification",
    label: "Pending verification",
    note: "We are confirming your order details before dispatch.",
    woo: "pending",
  },
  awaiting_call: {
    stage: "verification",
    label: "Awaiting confirmation call",
    note: "An agent will call you on this number to confirm your order.",
    woo: "pending",
  },
  callback_requested: {
    stage: "verification",
    label: "Confirmation call requested",
    note: "You asked us to call before dispatch. We will ring you shortly.",
    woo: "pending",
  },
  unreachable: {
    stage: "verification",
    label: "Could not reach you",
    note: "We tried calling without success. We will try again soon.",
    woo: "pending",
    tone: "warn",
  },
  verification_failed: {
    stage: "verification",
    label: "Verification unsuccessful",
    note: "We could not verify this order. Contact support to reinstate it.",
    woo: "pending",
    tone: "danger",
  },
  verified: {
    stage: "verification",
    label: "Order confirmed",
    note: "Confirmed. Cash on Delivery — pay only when the parcel arrives.",
    woo: "confirmed",
    tone: "success",
  },

  // ---------- Fulfillment ----------
  awaiting_payment: {
    stage: "fulfillment",
    label: "Awaiting payment",
    note: "We are waiting for your payment to clear.",
    woo: "pending",
  },
  paid: {
    stage: "fulfillment",
    label: "Payment received",
    note: "Your payment has been received.",
    woo: "processing",
    tone: "success",
  },
  print_invoice: {
    stage: "fulfillment",
    label: "Preparing your order",
    note: "Your invoice is being prepared in our warehouse.",
    woo: "processing",
  },
  picking: {
    stage: "fulfillment",
    label: "Preparing your order",
    note: "Your items are being collected from our warehouse.",
    woo: "processing",
  },
  quality_check: {
    stage: "fulfillment",
    label: "Quality check",
    note: "Your items are being checked before packing.",
    woo: "processing",
  },
  packing: {
    stage: "fulfillment",
    label: "Packing",
    note: "Your parcel is being packed.",
    woo: "processing",
  },
  packed: {
    stage: "fulfillment",
    label: "Packed",
    note: "Your parcel is packed and ready for the courier.",
    woo: "processing",
  },

  // ---------- Shipping ----------
  ready_for_pickup: {
    stage: "shipping",
    label: "Ready for pickup",
    note: "Your parcel is waiting for the courier to collect it.",
    woo: "processing",
  },
  pickup_scheduled: {
    stage: "shipping",
    label: "Pickup scheduled",
    note: "Courier pickup has been scheduled for your parcel.",
    woo: "processing",
  },
  picked_up: {
    stage: "shipping",
    label: "Handed to courier",
    note: "Your parcel has been collected by our courier partner.",
    woo: "processing",
  },
  in_transit: {
    stage: "shipping",
    label: "In transit",
    note: "Your parcel is on the way to your city.",
    woo: "processing",
  },
  at_delivery_hub: {
    stage: "shipping",
    label: "At delivery hub",
    note: "Your parcel reached the local delivery hub.",
    woo: "processing",
  },
  out_for_delivery: {
    stage: "shipping",
    label: "Out for delivery",
    note: "The delivery agent will call you before arriving. Keep cash ready.",
    woo: "processing",
  },
  delivery_attempted: {
    stage: "shipping",
    label: "Delivery attempted",
    note: "We could not complete the delivery. Another attempt is scheduled.",
    woo: "processing",
    tone: "warn",
  },
  delivery_on_hold: {
    stage: "shipping",
    label: "Delivery on hold",
    note: "Delivery is temporarily on hold. Our team is on it.",
    woo: "on-hold",
    tone: "warn",
  },

  // ---------- Delivered ----------
  delivered: {
    stage: "delivered",
    label: "Delivered",
    note: "Delivered. Thank you for shopping with us.",
    woo: "completed",
    tone: "success",
  },

  // ---------- Returns ----------
  return_requested: {
    stage: "returns",
    label: "Return requested",
    note: "We received your return request.",
    woo: "completed",
  },
  return_approved: {
    stage: "returns",
    label: "Return approved",
    note: "Your return was approved. A courier will collect the parcel.",
    woo: "completed",
  },
  return_in_transit: {
    stage: "returns",
    label: "Return in transit",
    note: "Your returned parcel is on the way back to us.",
    woo: "completed",
  },
  return_received: {
    stage: "returns",
    label: "Return received",
    note: "We received your returned parcel and are checking it.",
    woo: "completed",
  },
  refund_pending: {
    stage: "returns",
    label: "Refund pending",
    note: "Your refund has been approved and is being processed.",
    woo: "completed",
  },
  refunded: {
    stage: "returns",
    label: "Refunded",
    note: "Your refund has been issued.",
    woo: "refunded",
  },

  // ---------- Cancelled ----------
  cancelled_by_customer: {
    stage: "cancelled",
    label: "Cancelled at your request",
    note: "This order was cancelled as you requested.",
    woo: "cancelled",
    tone: "danger",
  },
  cancelled_by_admin: {
    stage: "cancelled",
    label: "Cancelled",
    note: "This order was cancelled by our team. Contact support for details.",
    woo: "cancelled",
    tone: "danger",
  },
  cancelled_unreachable: {
    stage: "cancelled",
    label: "Cancelled — could not reach you",
    note: "We could not reach you to confirm, so the order was cancelled.",
    woo: "cancelled",
    tone: "danger",
  },
  cancelled_duplicate: {
    stage: "cancelled",
    label: "Cancelled — duplicate order",
    note: "This order duplicated another recent order, so it was cancelled.",
    woo: "cancelled",
    tone: "danger",
  },
  cancelled_fraud: {
    stage: "cancelled",
    label: "Cancelled — security review",
    note: "Our security checks flagged this order, so it was cancelled. Contact support if you believe this is a mistake.",
    woo: "cancelled",
    tone: "danger",
  },
  cancelled_out_of_stock: {
    stage: "cancelled",
    label: "Cancelled — out of stock",
    note: "The item went out of stock, so this order was cancelled.",
    woo: "cancelled",
    tone: "danger",
  },

  // ---------- Failed ----------
  payment_failed: {
    stage: "failed",
    label: "Payment failed",
    note: "Your payment did not go through. Please try again.",
    woo: "failed",
    tone: "danger",
  },
  courier_rejected: {
    stage: "failed",
    label: "Courier could not accept the parcel",
    note: "Our courier partner could not accept this parcel. Our team is fixing it.",
    woo: "failed",
    tone: "danger",
  },
  address_invalid: {
    stage: "failed",
    label: "Delivery address needs attention",
    note: "We could not deliver to the address provided. Please contact support.",
    woo: "failed",
    tone: "danger",
  },
  system_error: {
    stage: "failed",
    label: "Something went wrong",
    note: "A technical problem interrupted this order. Our team is on it.",
    woo: "failed",
    tone: "danger",
  },
};

export type WorkflowEvent = {
  stage: WorkflowStage;
  status: WorkflowStatus;
  at: string;
  /** Internal/ops note. Optional; never required for customer display. */
  note?: string;
  actor?: string;
};

export const META_STAGE = "_zonash_stage";
export const META_STATUS = "_zonash_workflow_status";
export const META_HISTORY = "_zonash_stage_history";
/** ISO timestamp of the last workflow transition. */
export const META_UPDATED_AT = "_zonash_workflow_updated_at";
/** Schema version of the workflow meta payload, so readers can migrate safely. */
export const META_VERSION = "_zonash_workflow_version";
export const WORKFLOW_SCHEMA_VERSION = "1";

/** Keep history bounded so Woo meta stays small. */
const HISTORY_CAP = 40;


export function isWorkflowStatus(v: unknown): v is WorkflowStatus {
  return typeof v === "string" && v in WORKFLOW_STATUSES;
}

export function stageOf(status: WorkflowStatus): WorkflowStage {
  return WORKFLOW_STATUSES[status].stage;
}

export function wooStatusFor(status: WorkflowStatus): string {
  return WORKFLOW_STATUSES[status].woo;
}

export function parseHistory(raw: unknown): WorkflowEvent[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is WorkflowEvent =>
        !!e && isWorkflowStatus((e as WorkflowEvent).status) && typeof (e as WorkflowEvent).at === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Append `status` to `history` and return the meta entries to PUT on the order.
 * Pure — callers that already hold the prior history avoid an extra Woo read.
 */
export function workflowMetaEntries(
  status: WorkflowStatus,
  history: WorkflowEvent[],
  opts?: { note?: string; actor?: string; at?: string },
): { meta: { key: string; value: string }[]; history: WorkflowEvent[] } {
  const stage = stageOf(status);
  const event: WorkflowEvent = {
    stage,
    status,
    at: opts?.at ?? new Date().toISOString(),
    ...(opts?.note ? { note: opts.note } : {}),
    ...(opts?.actor ? { actor: opts.actor } : {}),
  };
  const last = history[history.length - 1];
  const next =
    last && last.status === status
      ? [...history.slice(0, -1), event]
      : [...history, event].slice(-HISTORY_CAP);
  return {
    history: next,
    meta: [
      { key: META_STAGE, value: stage },
      { key: META_STATUS, value: status },
      { key: META_HISTORY, value: JSON.stringify(next) },
    ],
  };
}

/**
 * Derive a workflow status from a legacy order that has no workflow meta yet,
 * using the WooCommerce status plus the older `_zonash_*` decision meta.
 */
export function deriveLegacyStatus(input: {
  wooStatus: string;
  decision?: string;
  blocked?: boolean;
  callRequested?: boolean;
  awaitingChoice?: boolean;
  otpVerified?: boolean;
}): WorkflowStatus {
  const s = input.wooStatus;
  if (input.blocked) return "cancelled_fraud";
  if (s === "checkout-draft") return "draft";
  if (s === "completed") return "delivered";
  if (s === "refunded") return "refunded";
  if (s === "failed") return "system_error";
  if (s === "cancelled") return "cancelled_by_admin";
  if (s === "confirmed" || s === "processing") return "verified";
  if (s === "shipped") return "in_transit";
  if (s === "on-hold") return "delivery_on_hold";
  // pending / otp-pending family
  if (input.callRequested) return "callback_requested";
  if (input.awaitingChoice) return "pending_verification";
  if (input.decision === "review") return "manual_review";
  if (input.otpVerified) return "otp_verified";
  return "order_placed";
}

/**
 * Which stages to render for an order, in order. Terminal stages replace the
 * remaining happy-path tail.
 */
export function visibleStages(current: WorkflowStage): WorkflowStage[] {
  if (TERMINAL_STAGES.includes(current)) {
    const idx = current === "returns" ? MAIN_STAGES.length : 2;
    return [...MAIN_STAGES.slice(0, idx), current];
  }
  return MAIN_STAGES;
}

export function stageState(
  stage: WorkflowStage,
  current: WorkflowStage,
  rail: WorkflowStage[],
): "done" | "current" | "upcoming" {
  const i = rail.indexOf(stage);
  const c = rail.indexOf(current);
  if (i < 0 || c < 0) return "upcoming";
  if (i < c) return "done";
  if (i === c) return "current";
  return "upcoming";
}

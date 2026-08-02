/**
 * Unified post-checkout order timeline.
 *
 * Replaces the separate review / callback / pending / confirmed screens with a
 * single status page. Everything is derived server-side from the WooCommerce
 * order (status + `_zonash_*` meta) so the customer sees the same truth the
 * ops team sees, with professional, human-readable notes.
 *
 * SECURITY: same gate as `getPublicOrderById` — a signed httpOnly customer
 * session cookie whose phone matches the order's billing phone. Responses are
 * identical for "unauthenticated", "not yours" and "no such order".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type TimelineStageKey =
  | "created"
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled";

export type TimelineEvent = {
  title: string;
  detail?: string;
  at?: string;
  tone?: "default" | "warn" | "danger";
};

export type TimelineStage = {
  key: TimelineStageKey;
  label: string;
  state: "done" | "current" | "upcoming";
  events: TimelineEvent[];
};

export type OrderTimeline = {
  id: number;
  number: string;
  status: string;
  statusLabel: string;
  total: string;
  awaiting_call_choice: boolean;
  call_requested: boolean;
  stages: TimelineStage[];
};

export const getOrderTimeline = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ timeline: OrderTimeline | null }> => {
    try {
      const normalizePhone = (raw: unknown): string => {
        const digits = String(raw ?? "").replace(/\D+/g, "");
        if (digits.length === 13 && digits.startsWith("880")) return digits.slice(2);
        if (digits.length === 11 && digits.startsWith("01")) return digits;
        return digits.slice(-11);
      };

      const { readCustomerSession } = await import("./customer-token.server");
      const sessionPhone = await readCustomerSession();
      if (!sessionPhone) return { timeline: null };

      const { wooFetch } = await import("./woo.server");
      const o = await wooFetch<Record<string, unknown>>({
        path: `/orders/${data.id}`,
        timeoutMs: 15_000,
      });
      if (!o?.id) return { timeline: null };

      const b = (o.billing ?? {}) as Record<string, unknown>;
      if (normalizePhone(b.phone) !== normalizePhone(sessionPhone)) {
        return { timeline: null };
      }

      const meta = new Map<string, string>();
      for (const m of (Array.isArray(o.meta_data) ? o.meta_data : []) as Record<
        string,
        unknown
      >[]) {
        if (m?.key) meta.set(String(m.key), String(m.value ?? ""));
      }
      const get = (k: string) => meta.get(k) || "";
      const truthy = (k: string) => {
        const v = get(k);
        return v === "1" || v === "true" || v === "yes";
      };

      const status = String(o.status ?? "");
      const createdAt = String(o.date_created ?? "");
      const otpVerifiedAt = get("_zonash_otp_verified_at");
      const confirmedAt = get("_zonash_confirmed_at");
      const callRequested = truthy("_zonash_call_requested");
      const callRequestedAt = get("_zonash_call_requested_at");
      const awaiting = truthy("_zonash_awaiting_call_choice");
      const decision = get("_zonash_decision");
      const reason = get("_zonash_decision_reason");
      const blocked = decision === "blocked" || !!get("_zonash_blocked_hit");

      // ---------- Created ----------
      const created: TimelineEvent[] = [
        {
          title: "Order drafted",
          detail: "Your details were saved and the order was reserved for you.",
          at: createdAt,
        },
      ];
      if (otpVerifiedAt) {
        created.push({
          title: "Phone number verified",
          detail: "The one-time code sent to your mobile was confirmed.",
          at: otpVerifiedAt,
        });
      } else if (decision) {
        created.push({
          title: "Phone number verified",
          detail: "Verified from your signed-in session — no code was required.",
        });
      }

      // ---------- Pending ----------
      const pending: TimelineEvent[] = [];
      if (blocked) {
        pending.push({
          title: "Security review failed",
          detail:
            "Our fraud-prevention checks flagged this order, so it was cancelled automatically.",
          tone: "danger",
        });
      } else if (decision === "review") {
        pending.push({
          title: "Manual review required",
          detail:
            reason ||
            "Our verification checks need a quick look from our team before dispatch.",
          tone: "warn",
        });
        pending.push({
          title: "Confirmation call scheduled",
          detail: "An agent will call you on this number to confirm your order.",
        });
      }
      if (callRequested) {
        pending.push({
          title: "Confirmation call requested",
          detail: "You asked us to call before dispatch. The order stays pending until we speak.",
          at: callRequestedAt,
        });
      }
      if (awaiting) {
        pending.push({
          title: "Awaiting your choice",
          detail: "Tell us whether you'd like a confirmation call before we dispatch.",
        });
      }

      // ---------- Confirmed and beyond ----------
      const confirmed: TimelineEvent[] = [];
      if (status === "confirmed" || status === "processing") {
        confirmed.push({
          title: "Order confirmed",
          detail: "We're packing your parcel. Cash on Delivery — pay only on arrival.",
          at: confirmedAt,
        });
      }
      const shipped: TimelineEvent[] = [];
      if (status === "shipped" || status === "completed") {
        shipped.push({
          title: "Handed to courier",
          detail: "Your parcel is on the way. Our courier partner will call before delivery.",
        });
      }
      const delivered: TimelineEvent[] = [];
      if (status === "completed") {
        delivered.push({ title: "Delivered", detail: "Thank you for shopping with Zonash." });
      }
      const cancelled: TimelineEvent[] = [];
      if (status === "cancelled" || status === "failed" || status === "refunded") {
        cancelled.push({
          title: status === "refunded" ? "Order refunded" : "Order cancelled",
          detail: blocked
            ? "Cancelled by our security system. Contact support if you believe this is a mistake."
            : "This order will not be delivered. Contact support if you'd like it reinstated.",
          tone: "danger",
        });
      }

      const isTerminalBad = cancelled.length > 0;
      const isConfirmed = confirmed.length > 0;
      const isShipped = shipped.length > 0;
      const isDelivered = delivered.length > 0;

      const stages: TimelineStage[] = [
        { key: "created", label: "Created", state: "done", events: created },
        {
          key: "pending",
          label: "Pending",
          state: isTerminalBad
            ? "done"
            : isConfirmed || isShipped
              ? "done"
              : "current",
          events:
            pending.length > 0
              ? pending
              : [
                  {
                    title: "Verification complete",
                    detail: "No issues found — your order moved straight through.",
                  },
                ],
        },
        {
          key: "confirmed",
          label: "Confirmed",
          state: isConfirmed || isShipped || isDelivered
            ? isShipped || isDelivered
              ? "done"
              : "current"
            : "upcoming",
          events: confirmed,
        },
        {
          key: "shipped",
          label: "Shipped",
          state: isShipped ? (isDelivered ? "done" : "current") : "upcoming",
          events: shipped,
        },
        {
          key: "delivered",
          label: "Delivered",
          state: isDelivered ? "current" : "upcoming",
          events: delivered,
        },
      ];
      if (isTerminalBad) {
        stages.splice(2, stages.length - 2, {
          key: "cancelled",
          label: status === "refunded" ? "Refunded" : "Cancelled",
          state: "current",
          events: cancelled,
        });
      }

      const labels: Record<string, string> = {
        "checkout-draft": "Draft",
        pending: "Pending",
        "otp-pending": "Verifying",
        confirmed: "Confirmed",
        processing: "Confirmed",
        shipped: "Shipped",
        completed: "Delivered",
        cancelled: "Cancelled",
        failed: "Cancelled",
        refunded: "Refunded",
        "on-hold": "On hold",
      };

      return {
        timeline: {
          id: Number(o.id),
          number: String(o.number ?? o.id),
          status,
          statusLabel: labels[status] ?? status.replace(/-/g, " "),
          total: String(o.total ?? "0"),
          awaiting_call_choice: awaiting && !isTerminalBad,
          call_requested: callRequested,
          stages,
        },
      };
    } catch (e) {
      console.error("getOrderTimeline failed", e);
      return { timeline: null };
    }
  });

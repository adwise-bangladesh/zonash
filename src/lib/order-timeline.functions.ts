/**
 * Unified post-checkout order timeline.
 *
 * Renders the two-layer workflow model: business stages (Created, Verification,
 * Fulfillment, Shipping, Delivered, Returns, Cancelled, Failed) each containing
 * the granular statuses recorded in `_zonash_stage_history`. Orders written
 * before the workflow layer existed are derived from the WooCommerce status and
 * the legacy `_zonash_*` decision meta, so nothing regresses.
 *
 * SECURITY: same gate as `getPublicOrderById` — a signed httpOnly customer
 * session cookie whose phone matches the order's billing phone. Responses are
 * identical for "unauthenticated", "not yours" and "no such order".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  META_HISTORY,
  META_STATUS,
  STAGE_LABEL,
  WORKFLOW_STATUSES,
  deriveLegacyStatus,
  isWorkflowStatus,
  parseHistory,
  stageOf,
  stageState,
  visibleStages,
  type WorkflowEvent,
  type WorkflowStage,
  type WorkflowStatus,
} from "./order-workflow";

export type TimelineStageKey = WorkflowStage;

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
  /** Granular workflow status, e.g. `pending_verification`. */
  workflowStatus: WorkflowStatus;
  stage: WorkflowStage;
  stageLabel: string;
  total: string;
  awaiting_call_choice: boolean;
  call_requested: boolean;
  stages: TimelineStage[];
};

function toTimelineEvent(e: WorkflowEvent): TimelineEvent {
  const def = WORKFLOW_STATUSES[e.status];
  const tone =
    def.tone === "danger" ? "danger" : def.tone === "warn" ? "warn" : "default";
  return {
    title: def.label,
    detail: def.note,
    ...(e.at ? { at: e.at } : {}),
    tone,
  };
}

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

      const wooStatus = String(o.status ?? "");
      const createdAt = String(o.date_created ?? "");
      const otpVerifiedAt = get("_zonash_otp_verified_at");
      const confirmedAt = get("_zonash_confirmed_at");
      const callRequested = truthy("_zonash_call_requested");
      const callRequestedAt = get("_zonash_call_requested_at");
      const awaiting = truthy("_zonash_awaiting_call_choice");
      const decision = get("_zonash_decision");
      const blocked = decision === "blocked" || !!get("_zonash_blocked_hit");

      // ---------- Resolve the workflow status ----------
      const rawStatus = get(META_STATUS);
      let status: WorkflowStatus;
      let history: WorkflowEvent[];

      if (isWorkflowStatus(rawStatus)) {
        status = rawStatus;
        history = parseHistory(get(META_HISTORY));
        if (history.length === 0) {
          history = [{ stage: stageOf(status), status, at: createdAt }];
        }
      } else {
        // Legacy order — synthesise the history from the timestamps we have.
        status = deriveLegacyStatus({
          wooStatus,
          decision,
          blocked,
          callRequested,
          awaitingChoice: awaiting,
          otpVerified: !!otpVerifiedAt || !!decision,
        });
        const synth: WorkflowEvent[] = [
          { stage: "created", status: "draft", at: createdAt },
          { stage: "created", status: "order_placed", at: createdAt },
        ];
        if (otpVerifiedAt || decision) {
          synth.push({
            stage: "created",
            status: "otp_verified",
            at: otpVerifiedAt || createdAt,
          });
        }
        if (callRequested) {
          synth.push({
            stage: "verification",
            status: "callback_requested",
            at: callRequestedAt || createdAt,
          });
        }
        if (confirmedAt && (wooStatus === "confirmed" || wooStatus === "processing")) {
          synth.push({ stage: "verification", status: "verified", at: confirmedAt });
        }
        const last = synth[synth.length - 1];
        if (!last || last.status !== status) {
          synth.push({ stage: stageOf(status), status, at: "" });
        }
        history = synth;
      }

      const stage = stageOf(status);
      const rail = visibleStages(stage);

      const stages: TimelineStage[] = rail.map((s) => ({
        key: s,
        label: STAGE_LABEL[s],
        state: stageState(s, stage, rail),
        events: history.filter((e) => e.stage === s).map(toTimelineEvent),
      }));

      // The "current" stage should never look empty to the customer.
      for (const s of stages) {
        if (s.state === "current" && s.events.length === 0) {
          const def = WORKFLOW_STATUSES[status];
          s.events.push({ title: def.label, detail: def.note, tone: "default" });
        }
      }

      const def = WORKFLOW_STATUSES[status];

      return {
        timeline: {
          id: Number(o.id),
          number: String(o.number ?? o.id),
          status: wooStatus,
          statusLabel: def.label,
          workflowStatus: status,
          stage,
          stageLabel: STAGE_LABEL[stage],
          total: String(o.total ?? "0"),
          awaiting_call_choice: status === "pending_verification" && awaiting,
          call_requested: status === "callback_requested" || callRequested,
          stages,
        },
      };
    } catch (e) {
      console.error("getOrderTimeline failed", e);
      return { timeline: null };
    }
  });

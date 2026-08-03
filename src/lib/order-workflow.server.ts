/**
 * Server-side writer for the order workflow layer.
 *
 * `setWorkflowStatus` writes `_zonash_stage`, `_zonash_workflow_status` and the
 * appended `_zonash_stage_history` together with the mapped WooCommerce
 * milestone status — in a single PUT.
 */
import {
  META_HISTORY,
  parseHistory,
  workflowMetaEntries,
  wooStatusFor,
  type WorkflowEvent,
  type WorkflowStatus,
} from "./order-workflow";
import { formatOpsNote, type NoteFacts } from "./order-notes";

type SetOpts = {
  /** Internal note stored in history and (optionally) as a Woo private note. */
  note?: string;
  actor?: string;
  /** Extra order meta to write in the same PUT. */
  extraMeta?: { key: string; value: string }[];
  /**
   * Prior history when the caller already knows it (avoids a Woo read).
   */
  priorHistory?: WorkflowEvent[];
  /** Override the mapped Woo status (e.g. a store without `confirmed`). */
  wooStatus?: string | null;
  /** Don't touch the Woo status at all — only workflow meta. */
  keepWooStatus?: boolean;
  /**
   * One professional sentence. When set, a uniform private order note is
   * composed automatically (preferred over passing `privateNote` by hand).
   */
  summary?: string;
  /** Extra key/value context appended to the composed private note. */
  facts?: NoteFacts;
  /** Fully custom private note. Overrides `summary`. */
  privateNote?: string;
};


export async function setWorkflowStatus(
  orderId: number,
  status: WorkflowStatus,
  opts: SetOpts = {},
): Promise<{ ok: boolean; wooStatus?: string }> {
  const { wooFetch } = await import("./woo.server");

  let history = opts.priorHistory;
  if (!history) {
    try {
      const existing = await wooFetch<{ meta_data?: { key: string; value: unknown }[] }>({
        path: `/orders/${orderId}?_fields=id,status,meta_data`,
        method: "GET",
        timeoutMs: 8_000,
      });
      const raw = (existing.meta_data ?? []).find((m) => m.key === META_HISTORY)?.value;
      history = parseHistory(raw);
    } catch {
      history = [];
    }
  }

  const built = workflowMetaEntries(status, history, {
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.actor ? { actor: opts.actor } : {}),
  });

  const target = opts.wooStatus === undefined ? wooStatusFor(status) : opts.wooStatus;
  const body: Record<string, unknown> = {
    meta_data: [...built.meta, ...(opts.extraMeta ?? [])],
  };
  if (!opts.keepWooStatus && target) body.status = target;

  let applied = typeof body.status === "string" ? body.status : undefined;
  try {
    await wooFetch({ path: `/orders/${orderId}`, method: "PUT", body, timeoutMs: 12_000 });
  } catch (e) {
    console.error(`setWorkflowStatus(${orderId}, ${status}) failed`, e);
    // Some stores don't know custom milestones like `confirmed`. Retry with the
    // closest core status so the workflow layer never gets stuck.
    if (applied === "confirmed") {
      try {
        applied = "processing";
        await wooFetch({
          path: `/orders/${orderId}`,
          method: "PUT",
          body: {
            ...body,
            status: "processing",
            meta_data: [
              ...(body.meta_data as { key: string; value: string }[]),
              { key: "_zonash_status_fallback", value: "confirmed->processing" },
            ],
          },
          timeoutMs: 12_000,
        });
      } catch (e2) {
        console.error("setWorkflowStatus fallback failed", e2);
        return { ok: false };
      }
    } else {
      return { ok: false };
    }
  }

  if (opts.privateNote) {
    try {
      await wooFetch({
        path: `/orders/${orderId}/notes`,
        method: "POST",
        body: { note: opts.privateNote, customer_note: false },
      });
    } catch {
      /* notes are best-effort */
    }
  }

  return { ok: true, ...(applied ? { wooStatus: applied } : {}) };
}

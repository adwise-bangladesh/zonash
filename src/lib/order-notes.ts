/**
 * Canonical formatter for WooCommerce private (internal) order notes.
 *
 * Every automated note the storefront writes goes through `formatOpsNote` so
 * the order log reads the same way regardless of which handler produced it:
 *
 *   [Zonash Ops] Verification / Callback Requested
 *   Customer requested a confirmation call before dispatch.
 *   Actor: customer | WooCommerce status: pending
 *   Duplicates: #24700, #24698
 *
 * Pure module (no server imports) so both the storefront and the admin
 * dashboard can reuse it.
 */
import { STAGE_LABEL, stageOf, type WorkflowStatus } from "./order-workflow";

export const NOTE_PREFIX = "[Zonash Ops]";

/** `callback_requested` -> `Callback Requested` */
export function humanizeStatus(status: string): string {
  return status
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** `Verification / Callback Requested` — the ops reference for a status. */
export function workflowRef(status: WorkflowStatus): string {
  return `${STAGE_LABEL[stageOf(status)]} / ${humanizeStatus(status)}`;
}

export type NoteFacts = Record<string, string | number | boolean | null | undefined>;

export type OpsNoteInput = {
  status: WorkflowStatus;
  /** One professional sentence describing what happened. */
  summary: string;
  /** WooCommerce milestone status applied by this transition, if any. */
  wooStatus?: string | null | undefined;
  /** Who triggered it: `customer`, `system`, `agent:<name>`, `courier:<name>`. */
  actor?: string | undefined;
  /** Extra key/value context. Empty values are dropped. */
  facts?: NoteFacts | undefined;
};

/** Build a uniform, audit-friendly private note. */
export function formatOpsNote(input: OpsNoteInput): string {
  const lines: string[] = [`${NOTE_PREFIX} ${workflowRef(input.status)}`];

  const summary = input.summary.trim();
  if (summary) lines.push(summary.endsWith(".") ? summary : `${summary}.`);

  const head: string[] = [];
  if (input.actor) head.push(`Actor: ${input.actor}`);
  if (input.wooStatus) head.push(`WooCommerce status: ${input.wooStatus}`);
  else head.push("WooCommerce status: unchanged");
  lines.push(head.join(" | "));

  for (const [key, raw] of Object.entries(input.facts ?? {})) {
    if (raw === null || raw === undefined || raw === "" || raw === false) continue;
    const value = typeof raw === "boolean" ? "yes" : String(raw).trim();
    if (!value) continue;
    lines.push(`${key}: ${value}`);
  }

  return lines.join("\n");
}

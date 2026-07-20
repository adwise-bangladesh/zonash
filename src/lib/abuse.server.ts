/**
 * Server-only abuse / rate-limit helper for order submission.
 *
 * Strategy (per user decision):
 *  - Rate limit ORDER SUBMIT: Postgres-backed, global across all workers.
 *  - Bot signals: velocity counts on IP / fingerprint / phone.
 *  - Abuse response: silent shadow-flag on the order (never block a normal
 *    user with a scary error). BUT we hard-cap egregious rates with a
 *    generic error — that IS the rate limit.
 *
 * Two thresholds:
 *  - HARD ceilings → block with generic error (rate limit).
 *  - Any signal below ceiling → shadow-flag with a risk score written into
 *    order meta so admins can see it in the dashboard.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type VelocityCounts = {
  ip_1m: number;
  ip_10m: number;
  ip_1h: number;
  fp_1m: number;
  fp_10m: number;
  fp_1h: number;
  phone_1m: number;
  phone_10m: number;
  phone_1h: number;
};

export type AbuseAssessment = {
  blocked: boolean;
  /** 0–100 risk score. Higher = more suspicious. */
  score: number;
  /** Human-readable signals that fired. Stamped onto order meta. */
  signals: string[];
  counts: VelocityCounts;
};

// Hard ceilings (blocks) — chosen for a real shop pushing ~2000 orders/day.
// A legitimate customer never trips these; only scripts / abusive fan-outs do.
const HARD = {
  ip_1m: 8,      // >8 submits/min from one IP → block
  ip_10m: 30,
  ip_1h: 120,
  fp_1m: 5,      // one device
  fp_10m: 15,
  fp_1h: 40,
  phone_1m: 3,   // one phone
  phone_10m: 8,
  phone_1h: 20,
};

// Soft thresholds (score contributors, do NOT block).
const SOFT = {
  ip_10m: 10,
  fp_10m: 5,
  phone_10m: 3,
};

const zero: VelocityCounts = {
  ip_1m: 0, ip_10m: 0, ip_1h: 0,
  fp_1m: 0, fp_10m: 0, fp_1h: 0,
  phone_1m: 0, phone_10m: 0, phone_1h: 0,
};

async function countSince(
  column: "ip" | "fingerprint" | "phone",
  value: string,
  secondsAgo: number,
): Promise<number> {
  if (!value) return 0;
  const since = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("abuse_events")
    .select("id", { head: true, count: "exact" })
    .eq("kind", "order_submit")
    .eq(column, value)
    .gte("created_at", since);
  if (error) {
    console.error(`abuse.countSince ${column}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/** Count recent order_submit events across three time windows for each key. */
export async function measureVelocity(
  ip: string,
  fingerprint: string,
  phone: string,
): Promise<VelocityCounts> {
  try {
    const [ip1, ip10, ip60, fp1, fp10, fp60, ph1, ph10, ph60] = await Promise.all([
      countSince("ip", ip, 60),
      countSince("ip", ip, 600),
      countSince("ip", ip, 3600),
      countSince("fingerprint", fingerprint, 60),
      countSince("fingerprint", fingerprint, 600),
      countSince("fingerprint", fingerprint, 3600),
      countSince("phone", phone, 60),
      countSince("phone", phone, 600),
      countSince("phone", phone, 3600),
    ]);
    return {
      ip_1m: ip1, ip_10m: ip10, ip_1h: ip60,
      fp_1m: fp1, fp_10m: fp10, fp_1h: fp60,
      phone_1m: ph1, phone_10m: ph10, phone_1h: ph60,
    };
  } catch (e) {
    console.error("abuse.measureVelocity failed:", (e as Error).message);
    return zero;
  }
}

/**
 * Assess a submit attempt. Fail-open: if the DB is unreachable, we allow
 * the order through with score 0 rather than blocking real customers.
 */
export async function assessOrderSubmit(input: {
  ip: string;
  fingerprint: string;
  phone: string;
}): Promise<AbuseAssessment> {
  const counts = await measureVelocity(input.ip, input.fingerprint, input.phone);
  const signals: string[] = [];
  let score = 0;
  let blocked = false;

  // Hard blocks
  if (counts.ip_1m > HARD.ip_1m)       { blocked = true; signals.push(`ip_burst_${counts.ip_1m}/1m`); }
  if (counts.ip_10m > HARD.ip_10m)     { blocked = true; signals.push(`ip_burst_${counts.ip_10m}/10m`); }
  if (counts.ip_1h > HARD.ip_1h)       { blocked = true; signals.push(`ip_burst_${counts.ip_1h}/1h`); }
  if (counts.fp_1m > HARD.fp_1m)       { blocked = true; signals.push(`fp_burst_${counts.fp_1m}/1m`); }
  if (counts.fp_10m > HARD.fp_10m)     { blocked = true; signals.push(`fp_burst_${counts.fp_10m}/10m`); }
  if (counts.fp_1h > HARD.fp_1h)       { blocked = true; signals.push(`fp_burst_${counts.fp_1h}/1h`); }
  if (counts.phone_1m > HARD.phone_1m) { blocked = true; signals.push(`phone_burst_${counts.phone_1m}/1m`); }
  if (counts.phone_10m > HARD.phone_10m) { blocked = true; signals.push(`phone_burst_${counts.phone_10m}/10m`); }
  if (counts.phone_1h > HARD.phone_1h) { blocked = true; signals.push(`phone_burst_${counts.phone_1h}/1h`); }

  // Soft scoring
  if (counts.ip_10m >= SOFT.ip_10m)       { score += 25; signals.push(`ip_elevated_${counts.ip_10m}/10m`); }
  else if (counts.ip_10m >= 5)            { score += 10; }
  if (counts.fp_10m >= SOFT.fp_10m)       { score += 30; signals.push(`fp_elevated_${counts.fp_10m}/10m`); }
  else if (counts.fp_10m >= 3)            { score += 15; }
  if (counts.phone_10m >= SOFT.phone_10m) { score += 25; signals.push(`phone_elevated_${counts.phone_10m}/10m`); }
  else if (counts.phone_10m >= 2)         { score += 10; }

  if (blocked) score = Math.max(score, 90);
  score = Math.min(100, score);

  return { blocked, score, signals, counts };
}

/**
 * Record the event AFTER assessment (so counts reflect prior activity, not
 * this attempt). Fire-and-forget: never let logging failure break checkout.
 */
export async function recordOrderSubmit(input: {
  ip: string;
  fingerprint: string;
  phone: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("abuse_events").insert({
      kind: "order_submit",
      ip: input.ip || null,
      fingerprint: input.fingerprint || null,
      phone: input.phone || null,
      meta: (input.meta ?? {}) as never,
    });
  } catch (e) {
    console.error("abuse.recordOrderSubmit failed:", (e as Error).message);
  }
}

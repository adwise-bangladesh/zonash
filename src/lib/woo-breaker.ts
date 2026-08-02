/**
 * WooCommerce circuit breaker (rate-limited, per-isolate).
 *
 * The existing negative cache stops a *single* failing URL from being retried
 * for 5s, but it is per-key: during a real outage every distinct URL the
 * storefront reads (feed page 1..n, taxonomy, each PDP, each search) still
 * gets its own full round trip — two, counting the 429/5xx retry — before it
 * is remembered. With traffic at scale that is thousands of doomed requests
 * per minute aimed at an origin that is already unhealthy, plus a matching
 * number of 8s timeouts stacked in front of our own render path.
 *
 * This breaker is global (not per-key) and rate limits how often we are
 * willing to touch a failing origin at all:
 *
 *   closed    -> normal traffic; failures are counted in a rolling window
 *   open      -> fail fast, zero origin calls, for OPEN_MS
 *   half-open -> at most ONE probe per PROBE_INTERVAL_MS; a success closes the
 *                breaker, a failure re-opens it
 *
 * Only failures that indicate an unhealthy origin are counted: transport
 * errors, timeouts/aborts, 429 and 5xx. A 404 (missing product) or any other
 * 4xx is a normal answer from a healthy origin and must never open the
 * breaker — otherwise one bad slug takes the storefront down.
 *
 * Pure and side-effect free apart from its module state, so it is unit
 * testable with an injectable clock.
 */

export type BreakerState = "closed" | "open" | "half-open";

/** Rolling window over which failures are counted. */
export const WINDOW_MS = 10_000;
/** Failures inside the window required to open the breaker. */
export const FAILURE_THRESHOLD = 8;
/** How long the breaker stays fully open before allowing a probe. */
export const OPEN_MS = 5_000;
/** While half-open, allow at most one probe per interval. */
export const PROBE_INTERVAL_MS = 2_000;
/** Consecutive probe successes required to fully close again. */
export const CLOSE_AFTER_SUCCESSES = 2;

type Breaker = {
  /** Timestamps of counted failures, ascending, pruned to WINDOW_MS. */
  failures: number[];
  /** When the breaker opened (0 = closed). */
  openedAt: number;
  /** Last time a probe was allowed through while half-open. */
  lastProbeAt: number;
  /** Probe successes accumulated since the breaker opened. */
  probeSuccesses: number;
  /** Requests rejected without touching the origin (observability). */
  shortCircuited: number;
};

const breaker: Breaker = {
  failures: [],
  openedAt: 0,
  lastProbeAt: 0,
  probeSuccesses: 0,
  shortCircuited: 0,
};

/** Thrown instead of calling a origin we believe to be down. */
export class WooCircuitOpenError extends Error {
  readonly code = "WOO_CIRCUIT_OPEN";
  constructor() {
    super("WooCommerce is temporarily unavailable (circuit open)");
  }
}

/**
 * True when the error means "origin is unhealthy". Timeouts surface as
 * `AbortError`/`TimeoutError`; anything with an HTTP status is judged on the
 * status alone.
 */
export function isOriginFailure(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const name = (err as { name?: unknown }).name;
  if (name === "AbortError" || name === "TimeoutError") return true;
  // Transport-level failures (DNS, TLS, connection reset) have no status.
  return err instanceof Error;
}

export function breakerState(now = Date.now()): BreakerState {
  if (breaker.openedAt === 0) return "closed";
  return now - breaker.openedAt < OPEN_MS ? "open" : "half-open";
}

/**
 * Should this request be allowed to reach WooCommerce?
 *
 * `false` means fail fast. Half-open lets one probe through per interval and
 * records the grant immediately, so concurrent isolate requests cannot all
 * decide they are "the probe".
 */
export function allowRequest(now = Date.now()): boolean {
  const state = breakerState(now);
  if (state === "closed") return true;
  if (state === "open") {
    breaker.shortCircuited++;
    return false;
  }
  if (now - breaker.lastProbeAt >= PROBE_INTERVAL_MS) {
    breaker.lastProbeAt = now;
    return true;
  }
  breaker.shortCircuited++;
  return false;
}

export function recordSuccess(now = Date.now()): void {
  if (breaker.openedAt !== 0) {
    // Require a couple of consecutive good answers before trusting the origin
    // again: a single lucky response during a flapping outage would otherwise
    // release the full request volume straight back onto it.
    breaker.probeSuccesses++;
    if (breaker.probeSuccesses < CLOSE_AFTER_SUCCESSES) {
      breaker.lastProbeAt = now - PROBE_INTERVAL_MS; // let the next probe through immediately
      return;
    }
    reset();
    return;
  }
  // Healthy traffic slowly drains the window so isolated blips never add up.
  if (breaker.failures.length) breaker.failures.pop();
}

export function recordFailure(err: unknown, now = Date.now()): void {
  if (!isOriginFailure(err)) return;

  if (breaker.openedAt !== 0) {
    // A failed probe re-arms the full open period.
    breaker.openedAt = now;
    breaker.probeSuccesses = 0;
    return;
  }

  const cutoff = now - WINDOW_MS;
  // Timestamps are appended in order, so dropping the expired prefix is enough.
  let i = 0;
  while (i < breaker.failures.length && breaker.failures[i]! < cutoff) i++;
  if (i > 0) breaker.failures.splice(0, i);

  breaker.failures.push(now);
  if (breaker.failures.length >= FAILURE_THRESHOLD) {
    breaker.openedAt = now;
    breaker.probeSuccesses = 0;
    breaker.failures.length = 0;
    console.error(
      `[woo-breaker] opened after ${FAILURE_THRESHOLD} failures in ${WINDOW_MS}ms — failing fast for ${OPEN_MS}ms`,
    );
  }
}

export function reset(): void {
  breaker.failures.length = 0;
  breaker.openedAt = 0;
  breaker.lastProbeAt = 0;
  breaker.probeSuccesses = 0;
  breaker.shortCircuited = 0;
}

/** Diagnostics only. */
export function breakerStats(now = Date.now()) {
  return {
    state: breakerState(now),
    failures: breaker.failures.length,
    shortCircuited: breaker.shortCircuited,
    probeSuccesses: breaker.probeSuccesses,
  };
}

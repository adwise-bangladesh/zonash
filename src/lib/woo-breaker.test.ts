import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  allowRequest,
  breakerState,
  recordFailure,
  recordSuccess,
  reset,
  isOriginFailure,
  FAILURE_THRESHOLD,
  OPEN_MS,
  PROBE_INTERVAL_MS,
  WINDOW_MS,
  CLOSE_AFTER_SUCCESSES,
  WooCircuitOpenError,
} from "./woo-breaker";

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

const failTimes = (n: number, at = Date.now()) => {
  for (let i = 0; i < n; i++) recordFailure(new HttpError(503), at);
};

describe("woo circuit breaker", () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("classifies only unhealthy-origin errors as failures", () => {
    expect(isOriginFailure(new HttpError(500))).toBe(true);
    expect(isOriginFailure(new HttpError(429))).toBe(true);
    expect(isOriginFailure(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isOriginFailure(new Error("connection reset"))).toBe(true);
    // Healthy origin answering normally must never trip the breaker.
    expect(isOriginFailure(new HttpError(404))).toBe(false);
    expect(isOriginFailure(new HttpError(400))).toBe(false);
    expect(isOriginFailure(new HttpError(401))).toBe(false);
  });

  it("stays closed below the threshold and allows traffic", () => {
    failTimes(FAILURE_THRESHOLD - 1);
    expect(breakerState()).toBe("closed");
    expect(allowRequest()).toBe(true);
  });

  it("ignores 4xx entirely, however many arrive", () => {
    for (let i = 0; i < FAILURE_THRESHOLD * 3; i++) recordFailure(new HttpError(404));
    expect(breakerState()).toBe("closed");
  });

  it("opens at the threshold and fails fast with no origin call", () => {
    failTimes(FAILURE_THRESHOLD);
    expect(breakerState()).toBe("open");
    for (let i = 0; i < 50; i++) expect(allowRequest()).toBe(false);
  });

  it("does not open on failures spread beyond the rolling window", () => {
    const t0 = Date.now();
    for (let i = 0; i < FAILURE_THRESHOLD * 2; i++) {
      recordFailure(new HttpError(503), t0 + i * (WINDOW_MS / 2));
    }
    expect(breakerState(t0 + FAILURE_THRESHOLD * WINDOW_MS)).toBe("closed");
  });

  it("rate limits probes to one per interval while half-open", () => {
    const t0 = Date.now();
    failTimes(FAILURE_THRESHOLD, t0);
    const halfOpen = t0 + OPEN_MS + 1;
    expect(breakerState(halfOpen)).toBe("half-open");

    expect(allowRequest(halfOpen)).toBe(true); // the one probe
    expect(allowRequest(halfOpen)).toBe(false); // concurrent requests fail fast
    expect(allowRequest(halfOpen + PROBE_INTERVAL_MS - 1)).toBe(false);
    expect(allowRequest(halfOpen + PROBE_INTERVAL_MS)).toBe(true); // next window
  });

  it("closes only after the required consecutive probe successes", () => {
    const t0 = Date.now();
    failTimes(FAILURE_THRESHOLD, t0);
    const halfOpen = t0 + OPEN_MS + 1;
    for (let i = 0; i < CLOSE_AFTER_SUCCESSES - 1; i++) {
      recordSuccess(halfOpen);
      expect(breakerState(halfOpen)).not.toBe("closed");
    }
    recordSuccess(halfOpen);
    expect(breakerState(halfOpen)).toBe("closed");
    expect(allowRequest(halfOpen)).toBe(true);
  });

  it("re-arms the full open period when a probe fails", () => {
    const t0 = Date.now();
    failTimes(FAILURE_THRESHOLD, t0);
    const halfOpen = t0 + OPEN_MS + 1;
    expect(allowRequest(halfOpen)).toBe(true);
    recordFailure(new HttpError(502), halfOpen);
    expect(breakerState(halfOpen)).toBe("open");
    expect(allowRequest(halfOpen)).toBe(false);
    expect(breakerState(halfOpen + OPEN_MS + 1)).toBe("half-open");
  });

  it("drains the failure window on healthy responses", () => {
    failTimes(FAILURE_THRESHOLD - 1);
    recordSuccess();
    recordSuccess();
    failTimes(1);
    expect(breakerState()).toBe("closed");
  });

  it("exposes a typed open error", () => {
    const err = new WooCircuitOpenError();
    expect(err.code).toBe("WOO_CIRCUIT_OPEN");
    expect(err).toBeInstanceOf(Error);
  });
});

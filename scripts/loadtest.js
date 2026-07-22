// k6 load test — 500 concurrent VUs against key storefront routes.
//
// Usage (from a machine with k6 installed):
//   BASE=https://zonash.lovable.app k6 run scripts/loadtest.js
//
// Success criteria:
//   - p95 latency  < 800ms on /, /products, /step/<slug>
//   - error rate   < 0.5%
//   - Woo origin RPS observed at gateway ≤ ~5 rps (thanks to edge cache
//     + single-flight coalescing in src/lib/woo.server.ts).
//
// Do NOT run against production without warning ops; run against the
// preview URL first.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "https://zonash.lovable.app";
// Replace with a real product slug from your store before running.
const STEP_SLUG = __ENV.STEP_SLUG || "example-product";
const COLLECTION_SLUG = __ENV.COLLECTION_SLUG || "mega-sale";

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "1m",  target: 300 },
        { duration: "2m",  target: 500 },
        { duration: "1m",  target: 500 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed:   ["rate<0.005"],
    http_req_duration: ["p(95)<800", "p(99)<1500"],
  },
};

const paths = [
  "/",
  "/products",
  "/products?sort=popularity",
  `/step/${STEP_SLUG}`,
  `/collection/${COLLECTION_SLUG}`,
];

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE}${path}`, {
    headers: { Accept: "text/html" },
    tags: { path },
  });
  check(res, {
    "status is 200": (r) => r.status === 200,
    "has body":      (r) => (r.body?.length ?? 0) > 1000,
  });
  sleep(Math.random() * 2 + 0.5);
}

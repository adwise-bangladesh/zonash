/**
 * Storefront surface contract.
 *
 * The staff dashboard lives in a separate project. This suite proves the
 * customer build:
 *   1. serves every customer route,
 *   2. returns 404 for every legacy admin/auth URL,
 *   3. never links to or leaks staff-only surfaces.
 *
 * Run against the dev server (default) or any deployment:
 *   STOREFRONT_URL=https://zonash.lovable.app bunx vitest run src/tests
 */
import { describe, expect, it, beforeAll } from "vitest";

// Note: BASE_URL is reserved by Vite (it injects "/"), so use our own name.
const BASE = process.env.STOREFRONT_URL || "http://localhost:8080";


/** Customer-facing routes that must render. */
const PUBLIC_ROUTES = [
  "/",
  "/products",
  "/categories",
  "/cart",
  "/checkout",
  "/search",
  "/support",
  "/orders",
  "/robots.txt",
  "/sitemap.xml",
];

/** Every URL the dashboard used to own. All must be gone. */
const REMOVED_ROUTES = [
  "/admin",
  "/admin/",
  "/admin/orders",
  "/admin/pos",
  "/admin/users",
  "/admin/settings",
  "/admin/analytics",
  "/admin/backfill",
  "/admin/profile",
  "/auth",
  "/auth?redirect=/admin",
  "/account/orders",
];

async function get(path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, { redirect: "manual", ...init });
}

beforeAll(async () => {
  const res = await get("/").catch(() => null);
  if (!res) throw new Error(`No server at ${BASE}. Start it with: bun run dev`);
}, 30_000);

describe("customer routes stay available", () => {
  it.each(PUBLIC_ROUTES)("GET %s renders", async (path) => {
    const res = await get(path);
    expect(res.status, `${path} -> ${res.status}`).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("home page ships storefront chrome and SEO metadata", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain("<title>");
    expect(html).toMatch(/Zonash/i);
    expect(html).toMatch(/rel="canonical"/);
  });

  it("robots.txt disallows transactional and staff paths", async () => {
    const txt = await (await get("/robots.txt")).text();
    expect(txt).toMatch(/Disallow:\s*\/admin/);
    expect(txt).toMatch(/Sitemap:/);
  });
});

describe("legacy admin/auth URLs are gone", () => {
  it.each(REMOVED_ROUTES)("GET %s is not reachable", async (path) => {
    const res = await get(path);
    // 404 only: a 3xx would mean the route still exists behind a guard.
    expect(res.status, `${path} -> ${res.status}`).toBe(404);
  });

  it("no customer page links to /admin or /auth", async () => {
    for (const path of ["/", "/products", "/categories", "/cart", "/support"]) {
      const html = await (await get(path)).text();
      expect(html, `${path} links to admin`).not.toMatch(/href="\/admin/);
      expect(html, `${path} links to auth`).not.toMatch(/href="\/auth/);
    }
  });

  it("sitemap never advertises staff URLs", async () => {
    const xml = await (await get("/sitemap.xml")).text();
    expect(xml).not.toMatch(/\/admin/);
    expect(xml).not.toMatch(/\/auth/);
  });
});

describe("no admin data is reachable", () => {
  it("staff order APIs are not exposed as server routes", async () => {
    const paths = [
      "/api/admin/orders",
      "/api/orders",
      "/api/users",
      "/api/pos",
      "/api/steadfast",
    ];
    for (const p of paths) {
      const res = await get(p);
      expect([404, 405], `${p} -> ${res.status}`).toContain(res.status);
    }
  });

  it("public order lookup refuses unauthenticated access", async () => {
    // getPublicOrderById is session-gated; hitting it without a customer
    // cookie must never return billing details.
    const res = await get("/orders?id=1");
    const html = await res.text();
    expect(html).not.toMatch(/billing_phone/);
    expect(html).not.toMatch(/consumer_secret/);
  });

  it("no WooCommerce or service credentials appear in served HTML", async () => {
    const html = await (await get("/")).text();
    for (const needle of [
      "consumer_key",
      "consumer_secret",
      "SERVICE_ROLE",
      "service_role",
      "CUSTOMER_SESSION_SECRET",
      "STEADFAST_",
      "HOORIN_",
    ]) {
      expect(html, `leaked ${needle}`).not.toContain(needle);
    }
  });
});

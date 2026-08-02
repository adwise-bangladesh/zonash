import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getCachedDocument,
  isShareableDocumentRequest,
  putCachedDocument,
  flushPendingDocumentPuts,
} from "./html-cache.server";

/** Minimal stand-in for Cloudflare's `caches.default`. */
class FakeCache {
  store = new Map<string, Response>();
  async match(req: Request) {
    return this.store.get(req.url);
  }
  async put(req: Request, res: Response) {
    // Real Cache API consumes the body; read it so a leak would show up here.
    const text = await res.text();
    this.store.set(req.url, new Response(text, { status: res.status, headers: res.headers }));
  }
}

let fake: FakeCache;
const g = globalThis as unknown as { caches?: unknown };

beforeEach(() => {
  fake = new FakeCache();
  g.caches = { default: fake };
});
afterEach(() => {
  delete g.caches;
});

const doc = (body = "<html>home</html>", init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });

const req = (url = "https://z.test/", headers: Record<string, string> = {}) =>
  new Request(url, { method: "GET", headers });

describe("isShareableDocumentRequest", () => {
  it("accepts an anonymous homepage GET", () => {
    expect(isShareableDocumentRequest(req())).toBe(true);
  });

  it("never shares a request that carries any cookie", () => {
    expect(isShareableDocumentRequest(req("https://z.test/", { cookie: "zonash_cs=x" }))).toBe(
      false,
    );
    expect(
      isShareableDocumentRequest(req("https://z.test/", { cookie: "zonash_customer_phone=1" })),
    ).toBe(false);
  });

  it("ignores non-GET and non-allow-listed paths", () => {
    expect(isShareableDocumentRequest(new Request("https://z.test/", { method: "POST" }))).toBe(
      false,
    );
    expect(isShareableDocumentRequest(req("https://z.test/checkout"))).toBe(false);
  });
});

describe("document cache", () => {
  it("stores a miss and serves the next request from cache", async () => {
    const out = putCachedDocument(req(), doc(), null);
    await flushPendingDocumentPuts();
    expect(out.headers.get("x-zonash-html-cache")).toBe("miss");
    expect(out.headers.get("cache-control")).toContain("s-maxage=15");
    // Response body must still be readable by the visitor.
    expect(await out.text()).toBe("<html>home</html>");

    const hit = await getCachedDocument(req());
    expect(hit).not.toBeNull();
    expect(hit!.headers.get("x-zonash-html-cache")).toBe("hit");
    expect(await hit!.text()).toBe("<html>home</html>");
  });

  it("stores without Vary (Workers Cache API only honours Accept-Encoding) but still sends it", async () => {
    const out = putCachedDocument(req(), doc(), null);
    await flushPendingDocumentPuts();
    expect(out.headers.get("vary")).toBe("Cookie");
    expect(fake.store.get("https://z.test/")!.headers.get("vary")).toBeNull();
    const hit = await getCachedDocument(req());
    expect(hit!.headers.get("vary")).toBe("Cookie");
    expect(hit!.headers.get("cache-control")).toContain("s-maxage=15");
  });

  it("refuses to store a response that sets a cookie", async () => {
    putCachedDocument(req(), doc("<html>me</html>", { headers: { "content-type": "text/html", "set-cookie": "zonash_cs=x" } }), null);
    await flushPendingDocumentPuts();
    expect(await getCachedDocument(req())).toBeNull();
  });

  it("refuses to store non-200 or non-HTML responses", async () => {
    putCachedDocument(req(), new Response("boom", { status: 500, headers: { "content-type": "text/html" } }), null);
    await flushPendingDocumentPuts();
    expect(await getCachedDocument(req())).toBeNull();
    putCachedDocument(req(), Response.json({ a: 1 }), null);
    await flushPendingDocumentPuts();
    expect(await getCachedDocument(req())).toBeNull();
  });

  it("never caches query-string variants", async () => {
    putCachedDocument(req("https://z.test/?utm_source=fb"), doc(), null);
    await flushPendingDocumentPuts();
    expect(await getCachedDocument(req("https://z.test/?utm_source=fb"))).toBeNull();
  });

  it("degrades to a pass-through when no Cache API exists", async () => {
    delete g.caches;
    const out = putCachedDocument(req(), doc(), null);
    await flushPendingDocumentPuts();
    expect(await out.text()).toBe("<html>home</html>");
    expect(await getCachedDocument(req())).toBeNull();
  });
});

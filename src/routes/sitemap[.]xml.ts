/**
 * sitemap.xml — dynamic, generated from the live WooCommerce catalog.
 *
 * Only crawlable surfaces are listed: static content pages, category pages and
 * published products. Checkout / order-state screens are excluded here and in
 * robots.txt.
 *
 * The whole document is memoized per isolate for 30 minutes via `cachedDerived`
 * and single-flighted, so a crawler hammering this URL costs at most one set of
 * upstream WooCommerce reads per window.
 */
import { createFileRoute } from "@tanstack/react-router";
import { cachedDerived, categoryIndex, wooFetch } from "@/lib/woo.server";
import { canonicalUrl } from "@/lib/site";

const TTL_MS = 30 * 60_000;
const MAX_PRODUCT_PAGES = 10;

type Entry = { loc: string; lastmod?: string; changefreq: string; priority: string };

const STATIC_ENTRIES: Entry[] = [
  { loc: canonicalUrl("/"), changefreq: "daily", priority: "1.0" },
  { loc: canonicalUrl("/products"), changefreq: "daily", priority: "0.9" },
  { loc: canonicalUrl("/categories"), changefreq: "weekly", priority: "0.7" },
  { loc: canonicalUrl("/support"), changefreq: "monthly", priority: "0.3" },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

async function productEntries(): Promise<Entry[]> {
  const fetchPage = (page: number) =>
    wooFetch<unknown>({
      path: "/products",
      query: {
        per_page: 100,
        page,
        status: "publish",
        orderby: "date",
        order: "desc",
        _fields: "slug,date_modified,date_modified_gmt",
      },
      timeoutMs: 10_000,
    })
      .then((body) => (Array.isArray(body) ? body : []))
      .catch(() => [] as unknown[]);

  const out: Entry[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const rows = await fetchPage(page);
    for (const raw of rows) {
      const row = raw as { slug?: unknown; date_modified?: unknown; date_modified_gmt?: unknown };
      const slug = typeof row.slug === "string" ? row.slug : "";
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({
        loc: canonicalUrl(`/products/${encodeURIComponent(slug)}`),
        lastmod: isoDate(row.date_modified_gmt) ?? isoDate(row.date_modified),
        changefreq: "weekly",
        priority: "0.8",
      });
    }
    if (rows.length < 100) break;
  }

  return out;
}

async function categoryEntries(): Promise<Entry[]> {
  const rows = await categoryIndex().catch(() => []);
  return rows
    .filter((r) => r.slug && r.count > 0)
    .map((r) => ({
      loc: canonicalUrl(`/c/${encodeURIComponent(r.slug)}`),
      changefreq: "weekly",
      priority: "0.6",
    }));
}

function renderSitemap(entries: Entry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildSitemap(): Promise<string> {
  return cachedDerived<string>("sitemap:xml", TTL_MS, async () => {
    const [products, categories] = await Promise.all([productEntries(), categoryEntries()]);
    return renderSitemap([...STATIC_ENTRIES, ...categories, ...products]);
  });
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const xml = await buildSitemap();
          return new Response(xml, {
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, max-age=1800, stale-while-revalidate=3600",
            },
          });
        } catch (error) {
          console.error("sitemap generation failed", error);
          // Never 500 at a crawler: serve the static skeleton instead.
          return new Response(renderSitemap(STATIC_ENTRIES), {
            status: 200,
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, max-age=300",
            },
          });
        }
      },
    },
  },
});

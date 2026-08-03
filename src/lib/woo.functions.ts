import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WooOrder, WooProduct, WooVariation } from "./woo.server";

/** Guard every WooCommerce list response — upstream may return an error object. */
/** Category fields the storefront renders; the raw payload adds descriptions, image EXIF dates and HAL links. */
const CATEGORY_FIELDS = "id,name,slug,count,image";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// -------------------- Products (public) --------------------

/**
 * Card-only projection.
 *
 * `PRODUCT_FIELDS` carries `description` + `short_description` because the home
 * feed seeds the product-detail query straight off the list payload ("instant
 * open"). Grids that do NOT seed (the /products filtered results) pay for those
 * HTML blobs twice per visitor — once in the SSR HTML, once in the dehydrated
 * Query cache — for markup they never render. `fields: "card"` asks WooCommerce
 * for the render set only.
 */
const CARD_PRODUCT_FIELDS =
  "id,name,slug,type,price,regular_price,sale_price,price_html,on_sale,stock_status,images";

const listProductsSchema = z.object({
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(50).default(12),
  /**
   * Row offset into the result set. WooCommerce ignores `page` when `offset` is
   * present, which is exactly what a cursor-style feed needs: a merged first
   * page (curated + popular) can consume a partial upstream page and the next
   * request resumes at the exact row it stopped at instead of skipping the
   * remainder. Capped like the deep-pagination guard below.
   */
  offset: z.number().int().min(0).max(1000).optional(),
  search: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  featured: z.boolean().optional(),
  orderby: z.enum(["date", "price", "popularity", "rating", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  fields: z.enum(["full", "card"]).optional(),
});


export const listProducts = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => listProductsSchema.parse(raw ?? {}))
  .handler(async ({ data }) => {
    try {
      const { wooFetch, trimProducts, PRODUCT_FIELDS, categorySlugMap, enrichVariableRegular } = await import("./woo.server");
      // Woo's `category` filter takes a term ID, not a slug: passing a slug
      // silently returned zero products. Resolve slugs off a cached slug->id
      // Map (O(1) per slug, no extra upstream call once warm).
      let categoryId = data.category;
      if (categoryId && !/^\d+(,\d+)*$/.test(categoryId)) {
        // A taxonomy outage used to be indistinguishable from "slug does not
        // exist": both produced an empty Map and the handler returned zero
        // products with `error: null`, so the page rendered a confident "No
        // matches found" for a category that does exist. Under load the
        // negative cache pins that state for the whole error window, so a
        // blip is shown to every visitor as an empty catalog. Surface the
        // failure instead so the UI shows its retry affordance.
        let taxonomyFailed = false;
        const bySlug = await categorySlugMap().catch(() => {
          taxonomyFailed = true;
          return new Map<string, number>();
        });
        if (taxonomyFailed) {
          return {
            products: [] as WooProduct[],
            hasMore: false,
            error: "Product catalog is temporarily unavailable.",
          };
        }
        const ids = categoryId
          .split(",")
          .map((slug) => bySlug.get(slug))
          .filter((id): id is number => typeof id === "number");
        if (!ids.length)
          return { products: [] as WooProduct[], hasMore: false, error: null as string | null };
        categoryId = ids.join(",");
      }


      const baseQuery = {
        page: data.page,
        ...(typeof data.offset === "number" ? { offset: data.offset } : {}),
        per_page: data.perPage,
        category: categoryId,
        featured: data.featured,
        orderby: data.orderby,
        order: data.order,
        status: "publish",
        // Ask WooCommerce for storefront fields only — the untrimmed payload is
        // ~3x larger and is embedded in SSR HTML for every visitor.
        _fields: data.fields === "card" ? CARD_PRODUCT_FIELDS : PRODUCT_FIELDS,

      } as Record<string, unknown>;


      // Run name/description search AND SKU search in parallel, then merge unique.
      // The SKU probe is page-1 only: it ignores `page`, so re-running it for
      // every page re-fetched the same rows, and those duplicates were dropped
      // by the client de-dupe — making later pages look partially empty and
      // stalling the visible result count.
      // Normalise before it becomes a cache key. WooCommerce search is
      // case-insensitive and ignores repeated whitespace, so "Gold Chain",
      // "gold  chain" and "GOLD chain" are the same upstream query — but as raw
      // strings they were three distinct cache entries and three origin calls.
      // Folding them collapses the long tail of near-duplicate queries that a
      // 100k-visitor day (and every crawler) generates.
      const term = data.search?.trim().replace(/\s+/g, " ").toLowerCase() || undefined;

      // Deep-pagination guard. `page` accepted up to 500, and a deep page of a
      // filtered view is a cache-miss by construction, so `?q=a&page=417` —
      // or `?category=rings&page=417` — was a free uncached round trip to
      // WooCommerce that could be replayed indefinitely. The guard covered the
      // search lane only; category and featured filters are just as cheap to
      // enumerate. 20 pages is ~480 rows, far past any real browsing depth.
      if ((term || data.category || data.featured) && data.page > 20) {
        return { products: [] as WooProduct[], hasMore: false, error: null as string | null };
      }




      // Only probe /products?sku= when the term could plausibly BE a SKU.
      // Store SKUs are hyphenated alphanumerics with no whitespace (PL-4,
      // BWG-01), so a natural-language query like "gold chain" can never match
      // one — yet it still cost a second upstream WooCommerce round trip on
      // every page-1 search. At scale that doubled origin load for the
      // overwhelming majority of queries in exchange for guaranteed zero rows.
      const skuCandidate =
        !!term && !/\s/.test(term) && term.length <= 32 && /[\d-]/.test(term);
      // A failed TEXT query is an outage, not "zero products". Swallowing it
      // into `[]` with `error: null` made every list view — the unfiltered shop
      // feed included — render a confident "No matches found" / empty catalog
      // during a WooCommerce blip, with no retry affordance, and `wooFetch`'s
      // negative cache then pinned that state for the whole error window. The
      // taxonomy path above already surfaces its failure; this one is the
      // request that actually returns the products.
      let textFailed = false;
      const [byText, bySku] = await Promise.all([
        wooFetch<WooProduct[]>({
          path: "/products",
          query: { ...baseQuery, search: term || undefined },
          timeoutMs: 8000,
        }).catch(() => {
          textFailed = true;
          return [] as WooProduct[];
        }),
        // The SKU probe stays best-effort: it is a bonus exact-match lane, and
        // its failure must not hide a healthy text result set.
        skuCandidate && data.page === 1
          ? wooFetch<WooProduct[]>({
              path: "/products",
              query: { ...baseQuery, sku: term },
              timeoutMs: 8000,
            }).catch(() => [] as WooProduct[])
          : Promise.resolve([] as WooProduct[]),
      ]);

      if (textFailed) {
        return {
          products: [] as WooProduct[],
          hasMore: false,
          error: "Product catalog is temporarily unavailable.",
        };
      }

      const textRows = trimProducts(byText);
      const seen = new Set<number>();
      const products: WooProduct[] = [];
      // Validate the upstream shape: Woo can return an object error payload.
      // SKU matches first — usually the more precise intent for staff.
      for (const p of [...trimProducts(bySku), ...textRows]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        products.push(p);
      }
      // Pagination must be judged on the PAGINATED query alone. The merged
      // length was used as the page-full signal, so a short text page topped up
      // by SKU hits (e.g. 20 + 5 = 25 >= 24) advertised another page that only
      // ever came back empty — a dead "Load more" button.
      return {
        products: await enrichVariableRegular(products),
        hasMore: textRows.length >= data.perPage,
        error: null as string | null,
      };


    } catch (e) {
      console.error("listProducts failed", e);
      return {
        products: [] as WooProduct[],
        hasMore: false,
        error: "Product catalog is temporarily unavailable.",
      };

    }
  });

/**
 * Typeahead suggestions for the storefront search bar.
 *
 * Deliberately tiny: only the fields a suggestion row renders, so the response
 * stays a couple of KB even on a slow mobile network. Never throws — the UI
 * shows an inline error state instead of an empty dropdown.
 */
export type ProductSuggestion = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  image: string | null;
  sell: string | number | null;
  regular: string | number | null;
};

export const suggestProducts = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        q: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(10).default(6),
      })
      .parse(raw),
  )
  .handler(async ({ data }): Promise<{ items: ProductSuggestion[]; error: string | null }> => {
    try {
      const { wooFetch } = await import("./woo.server");
      const { resolveCardPrices } = await import("./price-range");
      const query = {
        per_page: data.limit,
        status: "publish",
        // No `orderby: relevance` — WooCommerce rejects it unless order=asc,
        // and the rejection would silently empty the dropdown.

        _fields: "id,name,slug,sku,type,price,regular_price,sale_price,price_html,on_sale,images",
      } as Record<string, unknown>;

      const [byText, bySku] = await Promise.all([
        wooFetch<unknown>({ path: "/products", query: { ...query, search: data.q }, timeoutMs: 5000 }).catch(
          () => [],
        ),
        wooFetch<unknown>({ path: "/products", query: { ...query, sku: data.q }, timeoutMs: 5000 }).catch(
          () => [],
        ),
      ]);

      const seen = new Set<number>();
      const items: ProductSuggestion[] = [];
      for (const raw of [...asArray<WooProduct>(bySku), ...asArray<WooProduct>(byText)]) {
        if (!raw || typeof raw.id !== "number" || seen.has(raw.id)) continue;
        seen.add(raw.id);
        const { sell, regular } = resolveCardPrices(raw);
        items.push({
          id: raw.id,
          name: String(raw.name ?? ""),
          slug: String(raw.slug ?? ""),
          sku: String(raw.sku ?? ""),
          image: raw.images?.[0]?.src ?? null,
          sell: sell ?? null,
          regular: regular ?? null,
        });
        if (items.length >= data.limit) break;
      }
      return { items, error: null };
    } catch (e) {
      console.error("suggestProducts failed", e);
      return { items: [], error: "Search is temporarily unavailable." };
    }
  });


export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(raw))
  .handler(async ({ data }) => {
    try {
      const { wooFetch, trimProducts, PRODUCT_FIELDS } = await import("./woo.server");
      const products = await wooFetch<WooProduct[]>({
        path: "/products",
        query: { slug: data.slug, _fields: PRODUCT_FIELDS },
      });
      return { product: trimProducts(products)[0] ?? null, error: null as string | null };

    } catch (e) {
      console.error("getProductBySlug failed", e);
      return { product: null, error: "Product is temporarily unavailable." };
    }
  });

/**
 * Fields the product page actually reads off a variation. Woo's default
 * variation payload ships ~30 unused keys per row (dates, downloads, tax,
 * shipping class, `_links`, permalink, meta_data) — ~1.8 KB per variation.
 * At 100 variations that is ~180 KB fetched, parsed, cached in the isolate,
 * AND dehydrated into the SSR HTML of every single visitor.
 */
const VARIATION_FIELDS =
  "id,sku,price,regular_price,sale_price,stock_status,image,attributes,menu_order";

export const getProductVariations = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ productId: z.number().int().positive() }).parse(raw))
  .handler(async ({ data }) => {
    try {
      const raw = await (await import("./woo.server")).wooFetch<WooVariation[]>({
        path: `/products/${data.productId}/variations`,
        // `status: publish` keeps draft/private variations out of the option
        // grid — they were previously rendered as selectable, unbuyable rows.
        query: { per_page: 100, status: "publish", _fields: VARIATION_FIELDS },
        timeoutMs: 10000,
      });
      // Second trim: Woo returns the full attachment object for `image`
      // (dates, name, id). Only `src`/`alt` are rendered, and this array is
      // serialized into the SSR HTML, so drop the rest before it leaves here.
      const variations: WooVariation[] = (Array.isArray(raw) ? raw : []).map((v) => ({
        id: v.id,
        sku: v.sku,
        price: v.price,
        regular_price: v.regular_price,
        sale_price: v.sale_price,
        stock_status: v.stock_status,
        menu_order: v.menu_order,
        attributes: Array.isArray(v.attributes)
          ? v.attributes.map((a) => ({ id: a.id, name: a.name, option: a.option }))
          : [],
        ...(v.image?.src ? { image: { id: 0, src: v.image.src, alt: v.image.alt ?? "" } } : {}),
      }));
      return { variations, error: null as string | null };
    } catch (e) {
      console.error("getProductVariations failed", e);
      return { variations: [] as WooVariation[], error: "Variations unavailable." };
    }
  });


/**
 * Server-authoritative re-pricing for bag lines.
 *
 * Cart prices are snapshotted at add-time and can drift while the bag sits in
 * localStorage. Checkout already recomputes totals server-side, so this exists
 * purely so the customer never *sees* a stale price. Read-only, no PII, and
 * capped so it cannot be used to fan out WooCommerce requests.
 */
export const repriceCartLines = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        lines: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              variationId: z.number().int().positive().optional(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    // Only used for the enumeration budget inside `repriceLines` — never
    // stored, never returned.
    const client =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-real-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      "";
    const { repriceLines } = await import("./reprice.server");
    return { lines: await repriceLines(data.lines, client) };
  });



export type WooCategory = {
  id: number;
  name: string;
  slug: string;
  count: number;
  parent?: number;
  image: { src: string; alt: string } | null;
};

export const listCategories = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { wooFetch, HIDDEN_CATEGORY_SLUGS } = await import("./woo.server");
      const cats = await wooFetch<WooCategory[]>({
        path: "/products/categories",
        query: { per_page: 50, hide_empty: true, orderby: "count", order: "desc", _fields: CATEGORY_FIELDS },
      });
      return {
        categories: asArray<WooCategory>(cats).filter(
          (c) => c?.slug && c.slug !== "uncategorized" && !HIDDEN_CATEGORY_SLUGS.has(c.slug),
        ),
        error: null as string | null,
      };

    } catch (e) {
      console.error("listCategories failed", e);
      return { categories: [] as WooCategory[], error: "Categories are temporarily unavailable." };
    }
  });

// Fetch top-level (parent=0) categories that actually have subcategories.
// Parents with no children are hidden so the category browser never lands on an empty pane.
export const listPrimaryCategories = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { cachedDerived, categoryIndex } = await import("./woo.server");

      // Derived from the shared taxonomy snapshot: memoized per isolate (5 min)
      // and single-flighted, so a burst of visitors triggers one pagination pass
      // instead of one per request.
      const categories = await cachedDerived<WooCategory[]>("categories:primary", 300_000, async () => {
        const all = await categoryIndex();
        const parents = all.filter((c) => c.parent === 0 && c.slug !== "uncategorized");
        const withChildren = new Set(all.filter((c) => c.parent > 0).map((c) => c.parent));
        const nested = parents.filter((p) => withChildren.has(p.id));
        // Hide childless parents only while at least one parent has children.
        // A flat taxonomy (no subcategories anywhere) must still render a
        // usable browser instead of a permanently empty page.
        const visible = nested.length > 0 ? nested : parents;
        // Only fields the browser actually renders leave the server.
        return visible.map((p) => ({ id: p.id, name: p.name, slug: p.slug, count: 0, image: p.image }));
      });

      return { categories, error: null as string | null };
    } catch (e) {
      console.error("listPrimaryCategories failed", e);
      return { categories: [] as WooCategory[], error: "Categories are temporarily unavailable." };
    }
  });


// Fetch a single category by slug plus its immediate child categories.
export const getCategoryWithSubs = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z.object({ slug: z.string().min(1).max(96).regex(/^[a-z0-9-]+$/) }).parse(raw),
  )
  .handler(async ({ data }) => {
    type SubsResult = {
      parent: WooCategory | null;
      subs: WooCategory[];
      /** Same-level categories, used as a navigation strip when `subs` is empty. */
      siblings: WooCategory[];
      error: string | null;
    };
    const slim = (c: WooCategory) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: c.count,
      image: c.image,
    });
    try {
      const { wooFetch, cachedDerived, trimCategories, categoryIndex } = await import("./woo.server");
      return await cachedDerived<SubsResult>(`categories:subs:${data.slug}`, 300_000, async () => {
        // Fast path: resolve the parent AND its children out of the shared
        // taxonomy snapshot — zero upstream calls once it is warm.
        const all = await categoryIndex();
        const indexed = all.find((c) => c.slug === data.slug) ?? null;
        // A leaf category has no children, which used to leave the page with no
        // browse strip at all. Fall back to its siblings so shoppers can hop
        // sideways instead of hitting a dead end.
        const siblingsOf = (cat: WooCategory | null) =>
          cat
            ? all
                .filter((c) => c.parent === cat.parent && c.id !== cat.id && c.slug !== "uncategorized")
                .map(slim)
            : [];
        if (indexed) {
          const subs = all.filter((c) => c.parent === indexed.id).map(slim);
          if (subs.length > 0) {
            return { parent: indexed, subs, siblings: [], error: null };
          }
        }

        // Slow path only for slugs beyond the snapshot's page window (or a
        // parent whose children were truncated): resolve directly.
        const parents = indexed
          ? [indexed]
          : trimCategories(
              await wooFetch<WooCategory[]>({
                path: "/products/categories",
                query: { slug: data.slug, per_page: 1, _fields: CATEGORY_FIELDS },
                timeoutMs: 8000,
              }),
            );
        const parent = parents[0] ?? null;
        if (!parent) return { parent: null, subs: [], siblings: [], error: null };
        const subs = await wooFetch<WooCategory[]>({
          path: "/products/categories",
          query: { parent: parent.id, per_page: 50, hide_empty: false, orderby: "name", order: "asc", _fields: CATEGORY_FIELDS },
          timeoutMs: 8000,
        }).catch(() => [] as WooCategory[]);
        const trimmed = trimCategories(subs).map(slim);
        return {
          parent,
          // Only the fields the UI renders leave the server.
          subs: trimmed,
          siblings: trimmed.length === 0 ? siblingsOf(parent) : [],
          error: null,
        };
      });

    } catch (e) {
      console.error("getCategoryWithSubs failed", e);
      return {
        parent: null,
        subs: [] as WooCategory[],
        siblings: [] as WooCategory[],
        error: "Category is temporarily unavailable.",
      };
    }
  });




// Fetch products by category slug (e.g. "mega-sale"). Resolves slug -> ID
// server-side to avoid two client round-trips and to keep filtering safe.
export const listProductsByCategorySlug = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(96).regex(/^[a-z0-9-]+$/),
        perPage: z.number().int().min(1).max(50).default(16),
        orderby: z.enum(["date", "price", "popularity", "rating", "title"]).default("popularity"),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      const { wooFetch, trimProducts, PRODUCT_FIELDS, enrichVariableRegular } = await import("./woo.server");
      const cats = await wooFetch<{ id: number }[]>({
        path: "/products/categories",
        query: { slug: data.slug, per_page: 1, _fields: "id" },
        timeoutMs: 8000,
      });
      const catId = asArray<{ id: number }>(cats)[0]?.id;
      if (!catId) return { products: [] as WooProduct[], error: null as string | null };
      const products = await wooFetch<WooProduct[]>({
        path: "/products",
        query: {
          category: catId,
          per_page: data.perPage,
          orderby: data.orderby,
          order: "desc",
          status: "publish",
          _fields: PRODUCT_FIELDS,
        },
        timeoutMs: 8000,
      });
      return {
        products: await enrichVariableRegular(trimProducts(products)),
        error: null as string | null,
      };

    } catch (e) {
      console.error("listProductsByCategorySlug failed", e);
      return { products: [] as WooProduct[], error: "Products are temporarily unavailable." };
    }
  });



/**
 * Real "related products": items sharing a category with the product being
 * viewed, ordered by popularity, with the current product excluded upstream so
 * the grid never has to render-and-filter it.
 */
export const listRelatedProducts = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        productId: z.number().int().positive(),
        categoryIds: z.array(z.number().int().positive()).min(1).max(5),
        perPage: z.number().int().min(1).max(24).default(12),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      const { wooFetch, trimProducts, enrichVariableRegular } = await import("./woo.server");
      const products = await wooFetch<WooProduct[]>({
        path: "/products",
        query: {
          // Woo ORs multiple category IDs, which is what "related" should mean.
          category: data.categoryIds.join(","),
          exclude: String(data.productId),
          per_page: data.perPage,
          orderby: "popularity",
          order: "desc",
          status: "publish",
          _fields: CARD_PRODUCT_FIELDS,
        },
        timeoutMs: 8000,
      });
      return {
        products: await enrichVariableRegular(trimProducts(products)),
        error: null as string | null,
      };
    } catch (e) {
      console.error("listRelatedProducts failed", e);
      return { products: [] as WooProduct[], error: "Products are temporarily unavailable." };
    }
  });


// -------------------- Checkout (public) --------------------

const createOrderSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity: z.number().int().positive().max(99),
  })).min(1).max(50),
  billing: z.object({
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(3).max(30),
    address_1: z.string().trim().min(1).max(200),
    address_2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().max(80).optional().default(""),
    postcode: z.string().trim().min(1).max(20),
    country: z.string().trim().length(2),
  }),
  payment_method: z.enum(["cod", "bacs"]).default("cod"),
  customer_note: z.string().max(500).optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => createOrderSchema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const order = await (await import("./woo.server")).wooFetch<WooOrder>({
        path: "/orders",
        method: "POST",
        body: {
          payment_method: data.payment_method,
          payment_method_title: data.payment_method === "cod" ? "Cash on Delivery" : "Direct Bank Transfer",
          set_paid: false,
          status: "pending",
          billing: data.billing,
          shipping: {
            first_name: data.billing.first_name,
            last_name: data.billing.last_name,
            address_1: data.billing.address_1,
            address_2: data.billing.address_2,
            city: data.billing.city,
            state: data.billing.state,
            postcode: data.billing.postcode,
            country: data.billing.country,
          },
          line_items: data.items,
          customer_note: data.customer_note ?? "",
        },
        timeoutMs: 12000,
      });
      return { ok: true as const, id: order.id, number: order.number, total: order.total, currency: order.currency };
    } catch (e) {
      console.error("createOrder failed", e);
      return { ok: false as const, error: "Could not place your order. Please try again." };
    }
  });

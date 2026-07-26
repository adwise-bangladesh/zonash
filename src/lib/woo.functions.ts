import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
      const cats = await (await import("./woo.server")).wooFetch<WooCategory[]>({
        path: "/products/categories",
        query: { per_page: 50, hide_empty: true, orderby: "count", order: "desc", _fields: CATEGORY_FIELDS },
      });
      return {
        categories: asArray<WooCategory>(cats).filter((c) => c?.slug && c.slug !== "uncategorized"),
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

// -------------------- Orders (staff/admin only) --------------------

async function assertStaff(ctx: {
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => { in: (col: string, arr: string[]) => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
  userId: string;
}) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .in("role", ["admin", "staff", "viewer"]);
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Forbidden: staff role required");
  }
}

/** Best-effort lookup of the signed-in staff member's display name. */
async function getStaffName(ctx: {
  supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { full_name: string | null; email: string | null } | null; error: unknown }> } } } };
  userId: string;
  claims?: { email?: string } | null;
}): Promise<string> {
  try {
    const { data } = await ctx.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", ctx.userId)
      .maybeSingle();
    const name = data?.full_name?.trim();
    if (name) return name;
    const email = data?.email?.trim() || ctx.claims?.email?.trim();
    if (email) return email.split("@")[0];
  } catch {
    /* ignore */
  }
  return "Staff";
}

export const getWooOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.number().int().positive() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    return (await import("./woo.server")).wooFetch<WooOrder>({ path: `/orders/${data.id}` });
  });

const listWooOrdersSchema = z.object({
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(100).default(25),
  status: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
});

export const listWooOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listWooOrdersSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const { wooFetch } = await import("./woo.server");
      const orders = await wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          page: data.page,
          per_page: data.perPage,
          status: data.status && data.status !== "any" ? data.status : "any",
          search: data.search || undefined,
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 12000,
      });
      return { orders, error: null as string | null };
    } catch (e) {
      console.error("listWooOrders failed", e);
      return { orders: [] as WooOrder[], error: "Could not load orders from WooCommerce." };
    }
  });

// All orders for one customer (by email) — used by the customer history drawer.
export const listCustomerOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ email: z.string().email().max(254) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const { wooFetch } = await import("./woo.server");
      const orders = await wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          search: data.email,
          per_page: 100,
          status: "any",
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 15000,
      });
      // WooCommerce `search` matches many fields; keep only exact billing-email matches.
      const filtered = orders.filter(
        (o) => o.billing?.email?.toLowerCase().trim() === data.email.toLowerCase().trim(),
      );
      return { orders: filtered, error: null as string | null };
    } catch (e) {
      console.error("listCustomerOrders failed", e);
      return { orders: [] as WooOrder[], error: "Could not load customer history." };
    }
  });


// -------------------- Order notes (WooCommerce private/customer notes) --------------------

export type WooOrderNote = {
  id: number;
  author: string;
  date_created: string;
  note: string;
  customer_note: boolean;
};

export const listOrderNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const notes = await (await import("./woo.server")).wooFetch<WooOrderNote[]>({
        path: `/orders/${data.id}/notes`,
        query: { type: "any", per_page: 50 },
        timeoutMs: 10000,
      });
      return { notes, error: null as string | null };
    } catch (e) {
      console.error("listOrderNotes failed", e);
      return { notes: [] as WooOrderNote[], error: "Could not load order notes." };
    }
  });

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        note: z.string().trim().min(1).max(4000),
        customer_note: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const staffName = await getStaffName(context as never);
    const stamped = `[${staffName}] ${data.note}`;
    const created = await (await import("./woo.server")).wooFetch<WooOrderNote>({
      path: `/orders/${data.id}/notes`,
      method: "POST",
      body: { note: stamped, customer_note: data.customer_note },
      timeoutMs: 10000,
    });
    return created;
  });

/**
 * Send an SMS to the order's customer via BDBulkSMS AND log a customer-visible
 * note on the WooCommerce order so the message is preserved in order history.
 */
export const sendCustomerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        message: z.string().trim().min(1).max(1000),
        // Optional override phone; otherwise pulled from the order's billing.phone
        phone: z.string().trim().max(40).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { wooFetch } = await import("./woo.server");

    // 1) Resolve customer phone from the order if not supplied.
    let phone = data.phone?.trim();
    if (!phone) {
      const order = await wooFetch<WooOrder>({
        path: `/orders/${data.id}`,
        timeoutMs: 10000,
      });
      phone = order.billing?.phone?.trim() || "";
    }

    // 2) Send SMS
    const { sendSms } = await import("./sms.server");
    const sms = await sendSms({ phone: phone || "", message: data.message });

    // 3) Log to Woo as a customer-visible note (prefixed) so the trail is preserved.
    const staffName = await getStaffName(context as never);
    const notePrefix = sms.ok ? "📱 SMS sent" : "⚠️ SMS FAILED";
    const noteBody = `[${staffName}] ${notePrefix}${phone ? ` → ${phone}` : ""}\n\n${data.message}${
      sms.ok ? "" : `\n\n(${sms.message})`
    }`;
    try {
      await wooFetch<WooOrderNote>({
        path: `/orders/${data.id}/notes`,
        method: "POST",
        body: { note: noteBody, customer_note: sms.ok },
        timeoutMs: 10000,
      });
    } catch (e) {
      console.error("sendCustomerMessage: note upsert failed", e);
    }

    return {
      ok: sms.ok,
      phone,
      providerMessage: sms.message,
      responseCode: sms.responseCode,
    };
  });






export const getOrderStatusCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    try {
      const totals = await (await import("./woo.server")).wooFetch<
        { slug: string; name: string; total: number }[]
      >({ path: "/reports/orders/totals", timeoutMs: 10000 });
      const counts: Record<string, number> = {};
      let all = 0;
      for (const t of totals) {
        counts[t.slug] = t.total;
        all += t.total;
      }
      counts.any = all;
      return { counts, error: null as string | null };
    } catch (e) {
      console.error("getOrderStatusCounts failed", e);
      return { counts: {} as Record<string, number>, error: "Could not load order counts." };
    }
  });


const updateStatusSchema = z.object({
  id: z.number().int().positive(),
  // Accept any WooCommerce status slug (built-in or custom, e.g. "shipped",
  // "out-for-delivery"). WooCommerce validates the slug on its end.
  status: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Invalid status slug"),
});

// Returns the full list of order statuses registered in WooCommerce
// (built-in + custom), each with its live count. Powers the dynamic tab bar.
export const listOrderStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    try {
      const totals = await (await import("./woo.server")).wooFetch<
        { slug: string; name: string; total: number }[]
      >({ path: "/reports/orders/totals", timeoutMs: 10000 });
      const statuses = totals.map((t) => ({
        // WC prefixes report slugs with "wc-" for some custom statuses; the
        // REST API expects/returns them without the prefix.
        slug: t.slug.replace(/^wc-/, ""),
        name: t.name,
        count: t.total,
      }));
      const all = statuses.reduce((s, x) => s + x.count, 0);
      return { statuses, all, error: null as string | null };
    } catch (e) {
      console.error("listOrderStatuses failed", e);
      return {
        statuses: [] as { slug: string; name: string; count: number }[],
        all: 0,
        error: "Could not load statuses.",
      };
    }
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => updateStatusSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      supabase: {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              in: (col: string, arr: string[]) => Promise<{ data: unknown; error: unknown }>;
              maybeSingle: () => Promise<{ data: { wc_order_id: number; status: string } | null; error: unknown }>;
            };
          };
          insert: (row: unknown) => Promise<{ error: unknown }>;
          update: (row: unknown) => { eq: (col: string, v: number) => Promise<{ error: unknown }> };
        };
      };
      userId: string;
      claims: { email?: string };
    };
    await assertStaff(ctx as never);

    const before = await ctx.supabase
      .from("orders_cache")
      .select("wc_order_id, status")
      .eq("wc_order_id", String(data.id))
      .maybeSingle?.();

    const updated = await (await import("./woo.server")).wooFetch<WooOrder>({
      path: `/orders/${data.id}`,
      method: "PUT",
      body: { status: data.status },
    });

    await ctx.supabase
      .from("orders_cache")
      .update({ status: updated.status, date_modified: updated.date_modified, synced_at: new Date().toISOString() })
      .eq("wc_order_id", data.id);

    await ctx.supabase.from("order_audit_log").insert({
      wc_order_id: data.id,
      actor_user_id: ctx.userId,
      actor_email: ctx.claims?.email ?? null,
      action: "status_change",
      before: { status: before?.data?.status ?? null },
      after: { status: updated.status },
    });

    return { id: updated.id, status: updated.status };
  });

// -------------------- Full order update (staff/admin) --------------------

const addressSchema = z.object({
  first_name: z.string().trim().max(60).optional(),
  last_name: z.string().trim().max(60).optional(),
  company: z.string().trim().max(120).optional(),
  address_1: z.string().trim().max(200).optional(),
  address_2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postcode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(2).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(30).optional(),
});

const lineItemInputSchema = z.object({
  id: z.number().int().positive().optional(),        // existing line item id (update/remove)
  product_id: z.number().int().nonnegative().optional(), // new item
  variation_id: z.number().int().nonnegative().optional(),
  quantity: z.number().int().min(0).max(999),        // 0 removes existing
  subtotal: z.string().max(20).optional(),           // override price (per subtotal)
  total: z.string().max(20).optional(),
});

const feeLineSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().max(120).optional(),
  total: z.string().max(20).optional(),              // negative for discount
});

const shippingLineSchema = z.object({
  id: z.number().int().positive().optional(),
  method_title: z.string().max(120).optional(),
  method_id: z.string().max(60).optional(),
  total: z.string().max(20).optional(),
});

const updateOrderSchema = z.object({
  id: z.number().int().positive(),
  billing: addressSchema.optional(),
  shipping: addressSchema.optional(),
  line_items: z.array(lineItemInputSchema).max(100).optional(),
  fee_lines: z.array(feeLineSchema).max(20).optional(),
  shipping_lines: z.array(shippingLineSchema).max(10).optional(),
  customer_note: z.string().max(2000).optional(),
});

export const updateWooOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => updateOrderSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { id, ...rest } = data;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      body[k] = v;
    }
    const updated = await (await import("./woo.server")).wooFetch<WooOrder>({
      path: `/orders/${id}`,
      method: "PUT",
      body,
      timeoutMs: 15000,
    });
    return updated;
  });

// -------------------- Product variations (staff) --------------------

export const listProductVariations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ productId: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const variations = await (await import("./woo.server")).wooFetch<WooVariation[]>({
        path: `/products/${data.productId}/variations`,
        query: { per_page: 100 },
        timeoutMs: 10000,
      });
      return { variations, error: null as string | null };
    } catch (e) {
      console.error("listProductVariations failed", e);
      return { variations: [] as WooVariation[], error: "Could not load variations." };
    }
  });

// -------------------- Shipping methods (staff) --------------------

export type ShippingMethodOption = {
  method_id: string;
  method_title: string;
  cost: string;
  zone_id: number;
  zone_name: string;
  instance_id: number;
};

export const listShippingMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    try {
      const { wooFetch } = await import("./woo.server");
      const zones = await wooFetch<{ id: number; name: string }[]>({
        path: "/shipping/zones",
        timeoutMs: 10000,
      });
      const allZones = zones.some((z) => z.id === 0)
        ? zones
        : [...zones, { id: 0, name: "Rest of the World" }];

      const methods: ShippingMethodOption[] = [];
      await Promise.all(
        allZones.map(async (z) => {
          try {
            const list = await wooFetch<
              {
                id: number;
                instance_id: number;
                title: string;
                method_id: string;
                method_title: string;
                enabled: boolean;
                settings?: Record<string, { id: string; value: string }>;
              }[]
            >({ path: `/shipping/zones/${z.id}/methods`, timeoutMs: 8000 });
            for (const m of list) {
              if (!m.enabled) continue;
              // Cost can live in a few places depending on the method type
              // (flat_rate uses settings.cost, some plugins use min_amount,
              // others expose a top-level cost). Values may look like "80",
              // "80.00", or "৳80" — strip to a plain number-as-string.
              const anyM = m as unknown as Record<string, unknown>;
              const raw =
                (m.settings?.cost?.value as string | undefined) ??
                (m.settings?.min_amount?.value as string | undefined) ??
                (typeof anyM.cost === "string" ? (anyM.cost as string) : undefined) ??
                "0";
              const numeric = String(raw).replace(/[^\d.]/g, "");
              methods.push({
                method_id: m.method_id,
                method_title: m.title || m.method_title,
                cost: numeric || "0",
                zone_id: z.id,
                zone_name: z.name,
                instance_id: m.instance_id,
              });
            }
          } catch (err) {
            console.error(`shipping zone ${z.id} methods failed`, err);
          }
        }),
      );
      return { methods, error: null as string | null };
    } catch (e) {
      console.error("listShippingMethods failed", e);
      return { methods: [] as ShippingMethodOption[], error: "Could not load shipping methods." };
    }
  });

// -------------------- Global search (top-bar) --------------------
// Fans out to multiple WC endpoints and de-dupes.
export const searchOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ q: z.string().trim().min(1).max(120) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const q = data.q.replace(/^#/, "").trim();
    if (!q) return { orders: [] as WooOrder[] };

    const { wooFetch } = await import("./woo.server");
    const isEmail = q.includes("@");
    const digits = q.replace(/\D+/g, "");
    const isMostlyDigits = digits.length >= 4 && digits.length / q.length > 0.6;

    const tasks: Promise<WooOrder[]>[] = [];

    // Direct order ID lookup for numeric queries.
    if (/^\d{1,10}$/.test(q)) {
      tasks.push(
        wooFetch<WooOrder>({ path: `/orders/${q}`, timeoutMs: 6000 })
          .then((o) => (o ? [o] : []))
          .catch(() => []),
      );
    }

    // Broad WC search (covers billing name/email/phone/address).
    tasks.push(
      wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          search: q,
          per_page: 10,
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 8000,
      }).catch(() => [] as WooOrder[]),
    );

    // For phone-like input, also try billing phone via meta search.
    if (isMostlyDigits && digits.length >= 6) {
      tasks.push(
        wooFetch<WooOrder[]>({
          path: "/orders",
          query: { search: digits, per_page: 10, orderby: "date", order: "desc" },
          timeoutMs: 8000,
        }).catch(() => [] as WooOrder[]),
      );
    }

    // Consignment ID lookup — check order_ops table.
    if (!isEmail) {
      tasks.push(
        (async (): Promise<WooOrder[]> => {
          try {
            const { data: rows } = await (context as { supabase: import("@supabase/supabase-js").SupabaseClient })
              .supabase
              .from("order_ops")
              .select("wc_order_id")
              .or(`tracking_number.ilike.%${q}%,consignment_id.ilike.%${q}%`)
              .limit(5);
            const ids = (rows ?? []).map((r: { wc_order_id: number }) => r.wc_order_id);
            const orders = await Promise.all(
              ids.map((id) =>
                wooFetch<WooOrder>({ path: `/orders/${id}`, timeoutMs: 6000 }).catch(() => null),
              ),
            );
            return orders.filter(Boolean) as WooOrder[];
          } catch {
            return [];
          }
        })(),
      );
    }

    const results = (await Promise.all(tasks)).flat();
    const seen = new Set<number>();
    const merged: WooOrder[] = [];
    for (const o of results) {
      if (!o || seen.has(o.id)) continue;
      seen.add(o.id);
      merged.push(o);
      if (merged.length >= 10) break;
    }
    merged.sort(
      (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
    );
    return { orders: merged };
  });




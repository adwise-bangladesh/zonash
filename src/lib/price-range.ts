// Utilities for deriving displayable prices for variable WooCommerce products.
// Woo's list endpoint doesn't return per-variation prices, but it does return a
// `price_html` string. For variable products it typically looks like:
//   "<del>৳500 – ৳900</del> <ins>৳400 – ৳750</ins>"  (on sale)
//   "৳500 – ৳900"                                     (not on sale)
// We extract the minimum numeric value from each segment.

/**
 * Strip markup and character entities before digit extraction.
 *
 * WooCommerce renders the BDT sign as the numeric entity `&#2547;`, so a naive
 * digit scan treats "2547" as a candidate price and reports it as the minimum
 * for any product priced above ৳2,547. Tags are dropped too, since class names
 * and attributes can carry digits.
 */
function sanitizeSegment(segment: string): string {
  return segment
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x[0-9a-f]+;?/gi, " ")
    .replace(/&#\d+;?/g, " ")
    .replace(/&[a-z][a-z0-9]*;/gi, " ");
}

function extractMin(segment: string): number | null {
  // Match numbers (allow decimals + thousands separators/commas).
  const matches = sanitizeSegment(segment).match(/[\d][\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches
    .map((m) => parseFloat(m.replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}


function pickSegment(html: string, tag: "del" | "ins"): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

export type MinPrices = {
  /** Minimum currently-selling price (sale if on sale, otherwise regular). */
  sale: number | null;
  /** Minimum regular (pre-sale) price, if a strikethrough is meaningful. */
  regular: number | null;
};

export function parsePriceHtmlMin(priceHtml: string | undefined): MinPrices {
  if (!priceHtml) return { sale: null, regular: null };
  const del = pickSegment(priceHtml, "del");
  const ins = pickSegment(priceHtml, "ins");
  if (del && ins) {
    return { sale: extractMin(ins), regular: extractMin(del) };
  }
  // No sale — one plain range/value.
  return { sale: extractMin(priceHtml), regular: null };
}

/**
 * Resolve the price pair shown on a product card.
 *
 * Simple products use price/sale_price directly; variable products have no
 * per-variation prices in the list payload, so the minimum sell/regular price
 * is parsed out of `price_html`.
 */
export function resolveCardPrices(p: {
  type?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  price_html?: string;
  on_sale?: boolean;
}): { sell: number | string | undefined; regular: number | string | undefined } {
  if (p.type === "variable") {
    const parsed = parsePriceHtmlMin(p.price_html);
    return { sell: parsed.sale ?? p.price, regular: parsed.regular ?? undefined };
  }
  return {
    sell: p.on_sale && p.sale_price ? p.sale_price : p.price,
    regular: p.on_sale && p.regular_price ? p.regular_price : undefined,
  };
}

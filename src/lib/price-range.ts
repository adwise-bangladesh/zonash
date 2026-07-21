// Utilities for deriving displayable prices for variable WooCommerce products.
// Woo's list endpoint doesn't return per-variation prices, but it does return a
// `price_html` string. For variable products it typically looks like:
//   "<del>৳500 – ৳900</del> <ins>৳400 – ৳750</ins>"  (on sale)
//   "৳500 – ৳900"                                     (not on sale)
// We extract the minimum numeric value from each segment.

function extractMin(segment: string): number | null {
  // Match numbers (allow decimals + thousands separators/commas).
  const matches = segment.match(/[\d][\d,]*(?:\.\d+)?/g);
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

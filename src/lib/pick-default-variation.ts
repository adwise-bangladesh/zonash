import type { WooProduct, WooVariation } from "@/lib/woo.server";

/**
 * Select the WooCommerce "default" variation for display.
 *
 * Waterfall:
 *   1. Score every variation against non-empty `default_attributes`
 *      (empty option strings mean "Any" and are skipped).
 *   2. Ties broken by quality (purchasable → in-stock → has price → has image).
 *   3. If no defaults matched: quality-ranked, then cheapest.
 */
export function pickDefaultVariation(
  p: WooProduct,
  variations: WooVariation[],
): WooVariation | undefined {
  if (variations.length === 0) return undefined;

  const norm = (s: string) => s.toLowerCase().trim();
  const priceOf = (v: WooVariation) => {
    const sale = parseFloat(v.sale_price || "0");
    const base = parseFloat(v.price || "0");
    return sale > 0 ? sale : base;
  };
  const isPurchasable = (v: WooVariation) =>
    (v as { purchasable?: boolean }).purchasable !== false;
  const isInStock = (v: WooVariation) =>
    v.stock_status === "instock" ||
    (v as { backorders_allowed?: boolean }).backorders_allowed === true;
  const hasImage = (v: WooVariation) => !!v.image?.src;
  const hasPrice = (v: WooVariation) => priceOf(v) > 0;

  const quality = (v: WooVariation) =>
    (isPurchasable(v) ? 8 : 0) +
    (isInStock(v) ? 4 : 0) +
    (hasPrice(v) ? 2 : 0) +
    (hasImage(v) ? 1 : 0);

  const defaults = (p.default_attributes ?? []).filter(
    (d) => d.option && d.option.trim() !== "",
  );

  if (defaults.length > 0) {
    let best: WooVariation | undefined;
    let bestScore = -1;
    let bestQuality = -1;

    for (const v of variations) {
      let matched = 0;
      for (const d of defaults) {
        const hit = v.attributes.some(
          (a) => norm(a.name) === norm(d.name) && norm(a.option) === norm(d.option),
        );
        if (hit) matched++;
      }
      const q = quality(v);
      if (matched > bestScore || (matched === bestScore && q > bestQuality)) {
        best = v;
        bestScore = matched;
        bestQuality = q;
      }
    }

    if (best && bestScore > 0) return best;
  }

  const ranked = [...variations].sort((a, b) => {
    const qd = quality(b) - quality(a);
    if (qd !== 0) return qd;
    return (priceOf(a) || Infinity) - (priceOf(b) || Infinity);
  });

  return ranked[0] ?? variations[0];
}

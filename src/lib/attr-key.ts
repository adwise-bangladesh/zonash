/**
 * WooCommerce attribute-option normalization.
 *
 * The same option arrives in three different shapes across the REST API:
 *   - `product.attributes[].options`  → the human LABEL   ("২ পিস – ১০৮০ টাকা", "1 Pcs")
 *   - `variation.attributes[].option` → the term SLUG     ("২-পিস-১০৮০-টাকা", "1-pcs")
 *   - `product.default_attributes[].option` → the PERCENT-ENCODED slug
 *        ("%e0%a7%a8-%e0%a6%aa%e0%a6%bf%e0%a6%b8-…")
 *
 * Comparing these with a naive lowercase + strip-[\s_-] key still failed for
 * real data, because the label keeps punctuation the slug drops (en dash,
 * question mark, comma) and the default is URL-encoded. The result was a
 * variation that never matched: parent price range shown, no SKU, and the line
 * added to the bag without a `variation_id`.
 *
 * `attrKey` therefore decodes, lowercases and keeps ONLY letters and digits
 * (Unicode-aware, so Bangla labels survive). All three shapes collapse to the
 * same key.
 */
const KEY_CACHE = new Map<string, string>();

export function attrKey(input: string | null | undefined): string {
  if (!input) return "";
  const hit = KEY_CACHE.get(input);
  if (hit !== undefined) return hit;
  let s = input;
  if (s.includes("%")) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* malformed escape — fall through with the raw string */
    }
  }
  const out = s
    .toLowerCase()
    .normalize("NFC")
    // Drop everything that is not a letter or a number: spaces, dashes,
    // en/em dashes, punctuation, the `pa_` taxonomy prefix separator, etc.
    .replace(/[^\p{L}\p{N}]+/gu, "");
  if (KEY_CACHE.size > 1000) KEY_CACHE.clear();
  KEY_CACHE.set(input, out);
  return out;
}

/** Attribute-name key, ignoring Woo's `pa_` taxonomy prefix. */
export function attrNameKey(input: string | null | undefined): string {
  if (!input) return "";
  const raw = input.startsWith("pa_") ? input.slice(3) : input;
  return attrKey(raw);
}

type LabelSource = {
  attributes?: { name: string; options?: string[] }[] | null;
};

/**
 * Resolve the customer-facing label for a raw variation option value.
 *
 * Variation rows carry slugs, so rendering them directly showed
 * "২-পিস-১০৮০-টাকা" instead of "২ পিস – ১০৮০ টাকা". This maps back through the
 * parent's `attributes[].options` (which are labels) and falls back to a
 * de-slugified string when the parent no longer lists the option.
 */
export function optionLabel(
  product: LabelSource | null | undefined,
  attrName: string,
  option: string,
): string {
  if (!option) return "";
  const nameK = attrNameKey(attrName);
  const optK = attrKey(option);
  for (const a of product?.attributes ?? []) {
    if (attrNameKey(a.name) !== nameK) continue;
    for (const o of a.options ?? []) {
      if (attrKey(o) === optK) return o;
    }
  }
  let s = option;
  if (s.includes("%")) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep raw */
    }
  }
  return s.replace(/[-_]+/g, " ").trim();
}

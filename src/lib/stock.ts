/**
 * Storefront inventory rules — single source of truth.
 *
 * WooCommerce is the ONLY stock system. We read `stock_status` (and, where
 * available, `backorders` / `stock_quantity`) straight off the REST payload and
 * translate it into customer-facing language. No local stock ledger exists.
 *
 *   instock       -> "Ready Stock"        · Delivery: 1-3 Days   · buyable
 *   onbackorder   -> "Available to Order" · Delivery: 7-10 Days  · buyable
 *   outofstock    -> "Out of Stock"       · no delivery promise  · NOT buyable
 *
 * The words "backorder" / "available on backorder" are never shown to a
 * customer: supplier stock is presented as a longer delivery window instead.
 */

export type StockKind = "ready" | "supplier" | "out";

export type Availability = {
  kind: StockKind;
  /** Customer-facing stock label. */
  label: string;
  /** Delivery promise, or null when the item cannot be bought. */
  delivery: string | null;
  /** Whether Buy Now / Add to Cart may be enabled. */
  buyable: boolean;
  /** schema.org availability URL for JSON-LD. */
  schema: string;
};

const READY: Availability = {
  kind: "ready",
  label: "Ready Stock",
  delivery: "1–3 Days",
  buyable: true,
  schema: "https://schema.org/InStock",
};

const SUPPLIER: Availability = {
  kind: "supplier",
  label: "Available to Order",
  delivery: "7–10 Days",
  buyable: true,
  schema: "https://schema.org/BackOrder",
};

const OUT: Availability = {
  kind: "out",
  label: "Out of Stock",
  delivery: null,
  buyable: false,
  schema: "https://schema.org/OutOfStock",
};

/** Anything with a stock status: a product or a variation. */
export type StockSource = {
  stock_status?: string | null;
  backorders?: string | null;
  stock_quantity?: number | null;
  backorders_allowed?: boolean | null;
} | null | undefined;

/**
 * Resolve the customer-facing availability for a product or variation.
 *
 * Unknown/missing statuses fall back to supplier stock rather than blocking a
 * sale outright — WooCommerce omits `stock_status` on some reduced field sets,
 * and the checkout re-prices server-side anyway.
 */
export function availabilityOf(source: StockSource): Availability {
  const status = String(source?.stock_status ?? "").toLowerCase();

  if (status === "outofstock") return OUT;
  if (status === "onbackorder") return SUPPLIER;
  if (status === "instock") {
    // A managed item that hit zero with backorders enabled is supplier stock,
    // even when Woo's cached status still says "instock".
    const qty = typeof source?.stock_quantity === "number" ? source.stock_quantity : null;
    const backordersOn =
      source?.backorders === "yes" ||
      source?.backorders === "notify" ||
      source?.backorders_allowed === true;
    if (qty !== null && qty <= 0) return backordersOn ? SUPPLIER : OUT;
    return READY;
  }

  return SUPPLIER;
}

/** Convenience: can this product/variation be added to the cart? */
export function isBuyable(source: StockSource): boolean {
  return availabilityOf(source).buyable;
}

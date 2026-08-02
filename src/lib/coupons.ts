/**
 * Coupon catalogue — SINGLE source of truth for code, label, type and value.
 *
 * The checkout UI needs the label and the discount maths so it can preview the
 * saving; the server needs the same maths to price the order authoritatively.
 * Keeping both in this one client-safe module removes the old hand-maintained
 * duplicate between `src/routes/checkout.tsx` and `src/lib/otp.functions.ts`,
 * which could silently drift and show a discount the server refused.
 *
 * Usage caps (`max_uses`, `max_per_phone`) deliberately live server-side in
 * `coupons.server.ts` — they are enforcement policy, not UI copy.
 */
export type CouponType = "percent" | "flat";

export type Coupon = {
  /** Short human label shown in the checkout UI, e.g. "10% off". */
  label: string;
  type: CouponType;
  value: number;
};

export const COUPONS: Record<string, Coupon> = {
  ZONASH10: { label: "10% off", type: "percent", value: 10 },
  SAVE50: { label: "50 Tk off", type: "flat", value: 50 },
};

/** Uppercase/trim a user-typed code into a catalogue key. */
export function normalizeCouponCode(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function findCoupon(raw: string): { key: string; coupon: Coupon } | null {
  const key = normalizeCouponCode(raw);
  const coupon = COUPONS[key];
  return coupon ? { key, coupon } : null;
}

/**
 * Discount in whole BDT for a subtotal, clamped to the subtotal so a flat
 * coupon can never push an order negative.
 */
export function couponDiscount(coupon: Coupon, subtotal: number): number {
  if (!(subtotal > 0)) return 0;
  const raw =
    coupon.type === "percent" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  return Math.max(0, Math.min(raw, subtotal));
}

/** Customer-facing message for a server-side coupon rejection reason. */
export function couponRejectionMessage(reason: string): string {
  switch (reason) {
    case "max_uses_reached":
      return "That coupon has reached its usage limit and was not applied.";
    case "max_per_phone_reached":
      return "You have already used that coupon the maximum number of times.";
    case "invalid":
      return "That coupon code is not valid and was not applied.";
    default:
      return "We couldn't apply that coupon, so your order was placed at full price.";
  }
}

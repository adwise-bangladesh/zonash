/**
 * Coupon usage caps (server-only).
 *
 * Kept out of `coupons.ts` on purpose: caps are enforcement policy, so they
 * never need to reach the browser bundle. `max_uses` is the global limit and
 * `max_per_phone` the per-customer limit; omit either (or set it to null) to
 * skip that check.
 */
export type CouponCaps = {
  max_uses?: number | null;
  max_per_phone?: number | null;
};

export const COUPON_CAPS: Record<string, CouponCaps> = {
  ZONASH10: { max_uses: 1000, max_per_phone: 3 },
  SAVE50: { max_uses: 500, max_per_phone: 1 },
};

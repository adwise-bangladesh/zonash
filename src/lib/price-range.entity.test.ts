import { describe, it, expect } from "vitest";
import { parsePriceHtmlMin } from "@/lib/price-range";
const html = `<del aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#2547;&nbsp;</span>3,500.00</bdi></span></del> <ins aria-hidden="true"><span class="amount"><bdi><span>&#2547;&nbsp;</span>2,900.00</bdi></span></ins>`;
describe("price html", () => {
  it("ignores the ৳ numeric entity", () => {
    expect(parsePriceHtmlMin(html)).toEqual({ sale: 2900, regular: 3500 });
  });
});

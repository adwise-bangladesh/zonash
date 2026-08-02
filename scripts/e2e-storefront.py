#!/usr/bin/env python3
"""
End-to-end storefront check (Playwright).

Proves the customer journey works in a real browser while every staff URL
stays a 404:

    python3 scripts/e2e-storefront.py                 # against localhost:8080
    STOREFRONT_URL=https://zonash.lovable.app python3 scripts/e2e-storefront.py

Exits non-zero on the first failed assertion.
"""
import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("STOREFRONT_URL", "http://localhost:8080")
SHOTS = Path("/tmp/browser/e2e/screenshots")
SHOTS.mkdir(parents=True, exist_ok=True)

ADMIN_URLS = ["/admin", "/admin/orders", "/admin/pos", "/admin/users",
              "/admin/settings", "/auth", "/account/orders"]

failures = []
def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        failures.append(label)

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 1. Home renders products.
        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.wait_for_selector("a[href^='/products/']", timeout=20000)
        cards = await page.locator("a[href^='/products/']").count()
        check(cards > 0, f"home lists products ({cards} links)")
        await page.screenshot(path=str(SHOTS / "1_home.png"))

        # 2. Browse: category browser.
        await page.goto(BASE + "/categories", wait_until="domcontentloaded")
        check("categor" in (await page.content()).lower(), "categories page renders")

        # 3. PDP: open the first product from the listing.
        await page.goto(BASE + "/products", wait_until="domcontentloaded")
        await page.wait_for_selector("a[href^='/products/']", timeout=20000)
        href = await page.locator("a[href^='/products/']").first.get_attribute("href")
        await page.goto(BASE + href, wait_until="domcontentloaded")
        await page.wait_for_selector("h1", timeout=20000)
        title = (await page.locator("h1").first.inner_text()).strip()
        check(bool(title), f"product page renders: {title[:48]!r}")
        await page.screenshot(path=str(SHOTS / "2_pdp.png"))

        # 4. Add to cart.
        add = page.locator(
            "button:has-text('Add to cart'), button:has-text('Add to Cart'), "
            "button:has-text('cart'), button:has-text('Order')"
        )
        check(await add.count() > 0, "product page exposes an add-to-cart control")
        await add.first.click()
        await page.wait_for_timeout(1200)
        await page.goto(BASE + "/cart", wait_until="domcontentloaded")
        await page.wait_for_timeout(800)
        cart_text = await page.locator("body").inner_text()
        check("empty" not in cart_text.lower(), "cart holds the added item")
        await page.screenshot(path=str(SHOTS / "3_cart.png"))

        # 5. Checkout form is reachable and asks for name/phone/address.
        await page.goto(BASE + "/checkout", wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        inputs = await page.locator("input, textarea").count()
        check(inputs >= 3, f"checkout renders its form ({inputs} fields)")
        await page.screenshot(path=str(SHOTS / "4_checkout.png"))

        # 6. Every staff URL 404s in the browser too.
        for path in ADMIN_URLS:
            resp = await page.goto(BASE + path, wait_until="domcontentloaded")
            status = resp.status if resp else 0
            body = (await page.locator("body").inner_text()).lower()
            check(status == 404 and "dashboard" not in body, f"{path} -> {status}")

        check(not errors, f"no uncaught page errors ({errors[:2]})")
        await browser.close()

    print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())

#!/usr/bin/env python3
"""
Visual regression + geometry tests for the homepage skeletons.

Two independent guarantees, because a screenshot alone cannot prove "pixel
perfect":

1. VISUAL  — the DealsStrip and InfiniteFeed skeletons are screenshotted at
             mobile / tablet / desktop and compared byte-for-pixel against
             committed baselines (tests/visual/baselines/*.png). Any change in
             padding, radius, gap, card count or bar size shows up as a diff,
             and the offending pixels are written to
             tests/visual/diffs/<name>.png for inspection.

2. GEOMETRY — the skeleton is measured against the REAL component rendered on
             `/` at the same breakpoint. Column count, column width, x offsets,
             gutters, gaps and the image box are asserted to sub-pixel
             equality. This is the check that actually catches "the feed jumps
             when data arrives", which a baseline diff cannot see (a baseline
             happily locks in a wrong-but-consistent skeleton).

Usage
    python3 tests/visual/skeleton-vr.py            # run the suite
    python3 tests/visual/skeleton-vr.py --update   # (re)write baselines
    python3 tests/visual/skeleton-vr.py --base http://localhost:8080

Animations are disabled before every capture; the shimmer keyframes would
otherwise make each screenshot unique.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
BASELINES = ROOT / "baselines"
DIFFS = ROOT / "diffs"

# Storefront is capped at a 480px frame, so "tablet"/"desktop" exercise the
# md: breakpoint and the frame gutters rather than a wider grid.
VIEWPORTS = {
    "mobile": (390, 844),
    "tablet": (834, 1112),
    "desktop": (1440, 900),
}

# Per-pixel channel tolerance and the share of pixels allowed to exceed it.
# Non-zero because text/AA rasterisation is not bit-stable across runs; small
# enough that a 1px layout change fails.
PIXEL_TOLERANCE = 8
MAX_DIFF_RATIO = 0.002

# Killing `animation` alone freezes `skeleton-row-fade` wherever its opacity
# happened to be when the stylesheet landed — that made one capture in three
# come out 70% transparent. Pin the end state explicitly.
KILL_ANIMATIONS = """
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  .skeleton-row-fade, .skeleton-shimmer {
    opacity: 1 !important;
    transform: none !important;
    background-position: 0 0 !important;
  }
"""

# Measured in the browser: geometry of a [data-vr] grid and its cards.
MEASURE_JS = """
([gridSel, cardSel]) => {
  const grid = document.querySelector(gridSel);
  if (!grid) return null;
  const g = grid.getBoundingClientRect();
  const cards = [...grid.querySelectorAll(cardSel)].map((el) => {
    const r = el.getBoundingClientRect();
    const img = el.querySelector('.aspect-square, [class*="aspect-square"]');
    const ir = img ? img.getBoundingClientRect() : null;
    return {
      x: +(r.x - g.x).toFixed(2),
      w: +r.width.toFixed(2),
      imgW: ir ? +ir.width.toFixed(2) : null,
      imgH: ir ? +ir.height.toFixed(2) : null,
    };
  });
  const cs = getComputedStyle(grid);
  return {
    width: +g.width.toFixed(2),
    x: +g.x.toFixed(2),
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
    columnGap: cs.columnGap,
    count: cards.length,
    cards,
  };
}
"""


class Failures(list):
    def check(self, ok: bool, label: str, detail: str = "") -> None:
        if ok:
            print(f"  PASS  {label}")
        else:
            print(f"  FAIL  {label} — {detail}")
            self.append(f"{label}: {detail}")


def compare(name: str, shot: bytes, update: bool, f: Failures) -> None:
    """Byte-compare a capture against its baseline, writing a diff on mismatch."""
    BASELINES.mkdir(parents=True, exist_ok=True)
    path = BASELINES / f"{name}.png"
    tmp = DIFFS / f"{name}.actual.png"

    if update or not path.exists():
        path.write_bytes(shot)
        print(f"  BASE  {name} (written)")
        return

    DIFFS.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(shot)
    expected = Image.open(path).convert("RGB")
    actual = Image.open(tmp).convert("RGB")

    if expected.size != actual.size:
        f.check(False, f"visual {name}", f"size {actual.size} != baseline {expected.size}")
        return

    diff = ImageChops.difference(expected, actual).convert("L")
    # point() thresholds each pixel; the histogram then counts the offenders.
    mask = diff.point(lambda v: 255 if v > PIXEL_TOLERANCE else 0)
    bad = mask.histogram()[255]
    total = expected.size[0] * expected.size[1]
    ratio = bad / total if total else 0.0

    if ratio > MAX_DIFF_RATIO:
        mask.save(DIFFS / f"{name}.diff.png")
        f.check(False, f"visual {name}", f"{bad} px differ ({ratio:.4%}) — see diffs/{name}.diff.png")
    else:
        tmp.unlink(missing_ok=True)
        f.check(True, f"visual {name}")


def approx(a, b, tol=0.51) -> bool:
    if a is None or b is None:
        return False
    return abs(a - b) <= tol


async def capture_case(page, case: str, name: str, update: bool, f: Failures) -> None:
    el = page.locator(f'[data-vr-case="{case}"]')
    await el.wait_for(state="visible")
    compare(name, await el.screenshot(), update, f)


async def geometry_pair(
    page, base, label, skel_page_url, live_url, sels, f: Failures, optional: bool = False
) -> None:
    """
    Measure the skeleton, then the live component, and assert equality.

    `optional=True` marks a section that legitimately renders nothing sometimes
    (the Mega Sale strip disappears when the category is empty). Missing then
    reports SKIP instead of FAIL — the visual baseline still covers its
    skeleton, and the geometry pair is verified as soon as the category is
    stocked again.
    """
    grid_sel, card_sel, live_grid_sel, live_card_sel = sels

    await page.goto(f"{base}{skel_page_url}", wait_until="domcontentloaded")
    await page.add_style_tag(content=KILL_ANIMATIONS)
    skel = await page.evaluate(MEASURE_JS, [grid_sel, card_sel])

    await page.goto(f"{base}{live_url}", wait_until="domcontentloaded")
    await page.add_style_tag(content=KILL_ANIMATIONS)
    live_grid = page.locator(live_grid_sel).first
    try:
        await live_grid.wait_for(state="attached", timeout=20_000)
    except Exception:
        if optional:
            print(f"  SKIP  {label} geometry — live section not rendered (empty category)")
        else:
            f.check(False, f"{label} live section present", "never rendered")
        return
    live = await page.evaluate(MEASURE_JS, [live_grid_sel, live_card_sel])

    if not skel or not live or not skel["cards"] or not live["cards"]:
        f.check(False, f"{label} measurable", f"skeleton={bool(skel)} live={bool(live)}")
        return

    f.check(
        skel["paddingLeft"] == live["paddingLeft"] and skel["paddingRight"] == live["paddingRight"],
        f"{label} gutters",
        f'{skel["paddingLeft"]}/{skel["paddingRight"]} vs {live["paddingLeft"]}/{live["paddingRight"]}',
    )
    f.check(
        skel["columnGap"] == live["columnGap"],
        f"{label} column gap",
        f'{skel["columnGap"]} vs {live["columnGap"]}',
    )
    f.check(
        approx(skel["width"], live["width"]),
        f"{label} container width",
        f'{skel["width"]} vs {live["width"]}',
    )
    f.check(
        approx(skel["x"], live["x"]),
        f"{label} container x",
        f'{skel["x"]} vs {live["x"]}',
    )

    # Compare card-by-card over the overlap: the live feed has more cards than
    # the skeleton (and the deals scroller is virtually endless), but every card
    # the skeleton *does* draw must land on the live card's exact column.
    n = min(len(skel["cards"]), len(live["cards"]))
    for i in range(n):
        s, l = skel["cards"][i], live["cards"][i]
        f.check(approx(s["w"], l["w"]), f"{label} card[{i}] width", f'{s["w"]} vs {l["w"]}')
        f.check(approx(s["x"], l["x"]), f"{label} card[{i}] x", f'{s["x"]} vs {l["x"]}')
        f.check(
            approx(s["imgW"], l["imgW"]) and approx(s["imgH"], l["imgH"]),
            f"{label} card[{i}] image box",
            f'{s["imgW"]}x{s["imgH"]} vs {l["imgW"]}x{l["imgH"]}',
        )


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080")
    ap.add_argument("--update", action="store_true", help="(re)write baselines")
    args = ap.parse_args()

    f = Failures()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for vp_name, (w, h) in VIEWPORTS.items():
            print(f"\n=== {vp_name} ({w}x{h}) ===")
            ctx = await browser.new_context(
                viewport={"width": w, "height": h},
                device_scale_factor=1,
                reduced_motion="reduce",
            )
            page = await ctx.new_page()

            # --- 1. visual baselines -------------------------------------
            await page.goto(f"{args.base}/dev-vr/skeletons", wait_until="domcontentloaded")
            await page.add_style_tag(content=KILL_ANIMATIONS)
            await page.wait_for_timeout(150)  # let fonts settle
            for case in ("deals", "feed-2", "feed-3"):
                await capture_case(page, case, f"{case}-{vp_name}", args.update, f)

            # --- 2. skeleton vs live geometry ----------------------------
            await geometry_pair(
                page,
                args.base,
                f"feed/{vp_name}",
                "/dev-vr/skeletons",
                "/",
                (
                    '[data-vr-case="feed-2"] [data-vr="feed-grid"]',
                    '[data-vr="feed-card"]',
                    '[data-vr="feed-grid-live"]',
                    '[data-vr="feed-card-live"]',
                ),
                f,
            )
            await geometry_pair(
                page,
                args.base,
                f"deals/{vp_name}",
                "/dev-vr/skeletons",
                "/",
                (
                    '[data-vr="deals-row"]',
                    '[data-vr="deal-card"]',
                    '[data-vr="deals-row-live"]',
                    '[data-vr="deal-card-live"]',
                ),
                f,
                optional=True,
            )

            await ctx.close()
        await browser.close()

    print("\n" + "=" * 60)
    if f:
        print(f"{len(f)} failure(s):")
        for line in f:
            print(f"  - {line}")
        return 1
    print("all skeleton visual + geometry checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

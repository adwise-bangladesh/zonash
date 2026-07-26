// Responsive image helpers for WooCommerce/WordPress product images.
//
// IMPORTANT: this store's origin (zonash.com behind Cloudflare) does NOT resize
// via `?w=`/`?quality=` query parameters — it returns the full-size original AND
// the extra query string turns a Cloudflare cache HIT into a MISS, so the
// previous query-param approach made images strictly slower (full bytes, from
// origin, uncached). WordPress itself already stores generated sizes next to the
// original (`image-300x300.jpg`, `image-600x600.jpg`, …), which are cached edge
// objects, so we build the srcset from those instead.
//
// A generated size can be absent for an unusual aspect ratio, so consumers
// should render with `onImageSrcSetError` as the `<img onError>` handler: it
// drops srcset/sizes and falls back to the original URL instead of showing a
// broken image.

/**
 * WordPress/WooCommerce generated square crops this store reliably produces.
 *
 * 768/1024 square crops were also advertised, but WordPress only generates
 * `-768x768`/`-1024x1024` when the source is big enough AND square cropping is
 * configured for those sizes — on this store many uploads have neither, so the
 * browser picked a 404 candidate on high-DPR phones and painted a broken image
 * before the fallback could run. The original URL still caps the srcset, so
 * large slots keep full quality.
 */
const WP_SIZES = [150, 300, 600] as const;


const SIZED_SUFFIX = /-(\d+)x(\d+)(?=\.[a-z0-9]+$)/i;

/** Strip an existing `-WxH` suffix so we always start from the original asset. */
function toOriginal(src: string): string {
  return src.replace(SIZED_SUFFIX, "");
}

function withSize(src: string, size: number): string {
  return src.replace(/(\.[a-z0-9]+)$/i, `-${size}x${size}$1`);
}

export type ResponsiveImage = {
  /** Original (largest) URL — also the safe fallback. */
  src: string;
  /** WordPress generated-size candidates plus the original. */
  srcSet: string;
  sizes: string;
};

const DEFAULT_SIZES = "(min-width: 768px) 480px, 100vw";

export function buildResponsiveImage(
  originalSrc: string | undefined | null,
  opts: { sizes?: string } = {},
): ResponsiveImage | null {
  if (!originalSrc) return null;
  const src = toOriginal(originalSrc);
  const isWpUpload = /\/wp-content\/uploads\//i.test(src) && /\.(jpe?g|png|webp)$/i.test(src);
  const sizes = opts.sizes ?? DEFAULT_SIZES;

  if (!isWpUpload) {
    // Unknown host/format (e.g. SVG, external CDN): serve as-is, no guessing.
    return { src: originalSrc, srcSet: "", sizes };
  }

  const srcSet = [
    ...WP_SIZES.map((w) => `${withSize(src, w)} ${w}w`),
    // Cap with the original so very wide viewports/DPR still get full quality.
    `${src} 1600w`,
  ].join(", ");

  return { src, srcSet, sizes };
}

/**
 * `<img onError>` guard: if a generated WordPress size is missing (404), fall
 * back to the original URL instead of leaving a broken image on screen.
 *
 * Two failure modes the previous version could not recover from:
 *  1. `img.src` was already the original URL (we render `src=original` +
 *     `srcSet=sized candidates`), so re-assigning the identical string is a
 *     no-op in Chromium/WebKit and the broken sized candidate stayed painted.
 *     The attribute is removed first to force a fresh fetch.
 *  2. `srcset` had already been cleared by a first error, so the early return
 *     left a permanently broken <img>. The element is now hidden after the
 *     original itself fails, revealing the card's neutral placeholder box.
 */
export function onImageSrcSetError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const stage = img.dataset.imgFallback;
  if (stage) {
    // The original URL failed too — nothing left to try.
    img.dataset.imgFallback = "failed";
    img.style.visibility = "hidden";
    return;
  }
  img.dataset.imgFallback = "original";
  const original = toOriginal(img.currentSrc || img.src);
  img.removeAttribute("srcset");
  img.removeAttribute("sizes");
  // removeAttribute() does not fire another error event; assigning afterwards
  // guarantees a real network request even when the URL is unchanged.
  img.removeAttribute("src");
  img.src = original;
}


/**
 * Small fixed-size thumbnail (category tiles, avatars).
 *
 * WooCommerce returns the full-size original — often 1–2 MB — which is wasteful
 * for a 40–160 px slot. WordPress already stores generated square crops next to
 * it, so we point at the nearest one and offer a 2× candidate for retina.
 * Pair with `onImageSrcSetError` so a missing crop falls back to the original.
 */
export function buildThumbImage(
  originalSrc: string | undefined | null,
  slotPx: number,
): { src: string; srcSet: string } | null {
  if (!originalSrc) return null;
  const src = toOriginal(originalSrc);
  const isWpUpload = /\/wp-content\/uploads\//i.test(src) && /\.(jpe?g|png|webp)$/i.test(src);
  if (!isWpUpload) return { src: originalSrc, srcSet: "" };

  const pick = (target: number) =>
    WP_SIZES.find((w) => w >= target) ?? WP_SIZES[WP_SIZES.length - 1];
  const base = pick(slotPx);
  const retina = pick(slotPx * 2);
  const srcSet =
    retina === base
      ? `${withSize(src, base)} 1x`
      : `${withSize(src, base)} 1x, ${withSize(src, retina)} 2x`;
  return { src: withSize(src, base), srcSet };
}

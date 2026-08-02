// Responsive image helpers for WooCommerce/WordPress product images.
//
// IMPORTANT: this store's origin (zonash.com behind Cloudflare) does NOT resize
// via `?w=`/`?quality=` query parameters — it returns the full-size original AND
// the extra query string turns a Cloudflare cache HIT into a MISS. WordPress
// itself already stores generated sizes next to the original
// (`image-600x750.jpg`, …), which are cached edge objects, so we build the
// srcset from those instead.
//
// We NEVER guess which generated sizes exist. Square crops (`-600x600`) only
// exist for square-ish uploads; portrait uploads get `-240x300`, `-820x1024`,
// `-768x960`, `-600x750`, … Guessing produced 404 candidates that the browser
// sometimes picked (DPR/viewport dependent), which is why an image looked broken
// on one render and fine on the next. The server now ships the real generated
// sizes for each image (`image.w`, e.g. "240x300 600x750"), and when that list
// is missing we simply serve the original — correct, never broken.

/** WordPress `-WxH` filename suffix. */
const SIZED_SUFFIX = /-(\d+)x(\d+)(?=\.[a-z0-9]+$)/i;

/** Strip an existing `-WxH` suffix so we always start from the original asset. */
function toOriginal(src: string): string {
  return src.replace(SIZED_SUFFIX, "");
}

function withSuffix(src: string, wxh: string): string {
  return src.replace(/(\.[a-z0-9]+)$/i, `-${wxh}$1`);
}

/** An image as the server projects it, or a bare URL. */
export type ImageLike =
  | string
  | { src?: string | null; w?: string | null; srcset?: string | null }
  | null
  | undefined;

type Candidate = { wxh: string; w: number };

function normalizeInput(input: ImageLike): { src: string; candidates: Candidate[] } | null {
  if (!input) return null;
  const raw = typeof input === "string" ? input : input.src;
  if (!raw) return null;
  const src = toOriginal(raw);
  const isWpUpload =
    /\/wp-content\/uploads\//i.test(src) && /\.(jpe?g|png|webp)$/i.test(src);
  if (!isWpUpload) return { src: raw, candidates: [] };

  const list: Candidate[] = [];
  const seen = new Set<string>();
  const push = (wxh: string) => {
    const w = parseInt(wxh, 10);
    if (!Number.isFinite(w) || w <= 0 || seen.has(wxh)) return;
    seen.add(wxh);
    list.push({ wxh, w });
  };

  if (typeof input !== "string") {
    if (input.w) for (const token of input.w.split(/\s+/)) if (/^\d+x\d+$/.test(token)) push(token);
    if (!list.length && input.srcset) {
      for (const m of input.srcset.matchAll(/-(\d{2,5})x(\d{2,5})\.[a-z0-9]+/gi)) {
        push(`${m[1]}x${m[2]}`);
      }
    }
  }

  list.sort((a, b) => a.w - b.w);
  return { src, candidates: list };
}

export type ResponsiveImage = {
  /** Original (largest) URL — also the safe fallback. */
  src: string;
  /** Generated-size candidates plus the original. Empty when unknown. */
  srcSet: string;
  sizes: string;
};

const DEFAULT_SIZES = "(min-width: 768px) 480px, 100vw";

export function buildResponsiveImage(
  image: ImageLike,
  opts: { sizes?: string } = {},
): ResponsiveImage | null {
  const norm = normalizeInput(image);
  if (!norm) return null;
  const sizes = opts.sizes ?? DEFAULT_SIZES;
  const { src, candidates } = norm;

  if (!candidates.length) {
    // Unknown host/format, or no generated sizes reported: serve the original.
    return { src, srcSet: "", sizes };
  }

  const srcSet = [
    ...candidates.map((c) => `${withSuffix(src, c.wxh)} ${c.w}w`),
    // Cap with the original so very wide viewports/DPR still get full quality.
    `${src} ${Math.max(1600, candidates[candidates.length - 1].w + 1)}w`,
  ].join(", ");

  return { src, srcSet, sizes };
}

/**
 * `<img onError>` guard: if a generated WordPress size is unexpectedly missing
 * (404, purged, migrated), fall back to the original URL instead of leaving a
 * broken image on screen; if the original fails too, hide the <img> and reveal
 * the card's neutral placeholder box.
 */
export function onImageSrcSetError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const stage = img.dataset.imgFallback;
  if (stage) {
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
 * Picks the smallest real generated size that still covers the slot (and a 2×
 * candidate for retina). When the generated sizes are unknown we serve the
 * original rather than guessing a URL that may not exist.
 */
export function buildThumbImage(
  image: ImageLike,
  slotPx: number,
): { src: string; srcSet: string } | null {
  const norm = normalizeInput(image);
  if (!norm) return null;
  const { src, candidates } = norm;
  if (!candidates.length) return { src, srcSet: "" };

  const pick = (target: number) =>
    candidates.find((c) => c.w >= target) ?? candidates[candidates.length - 1];
  const base = pick(slotPx);
  const retina = pick(slotPx * 2);
  const baseUrl = withSuffix(src, base.wxh);
  const srcSet =
    retina.wxh === base.wxh
      ? `${baseUrl} 1x`
      : `${baseUrl} 1x, ${withSuffix(src, retina.wxh)} 2x`;
  return { src: baseUrl, srcSet };
}

// Responsive image helpers for WooCommerce/WordPress product images.
//
// WordPress and its common CDN layers (Jetpack Photon on i*.wp.com, WP Engine,
// Kinsta, Cloudflare Image Resizing on proxied origins) honour `?w=<width>`
// and `?quality=<n>` query parameters to serve resized JPEGs. Photon /
// Jetpack (and Automattic Image CDN) additionally honour `?format=webp`
// (auto-negotiated when the client sends `Accept: image/webp`). Unknown
// origins simply ignore the params and return the original image, so this
// helper is safe to use everywhere.
//
// The result: the browser picks the smallest image that satisfies the
// current viewport × DPR against the `sizes` hint, which is the single
// biggest LCP win for external product images we don't control.

const WIDTHS = [240, 320, 480, 640, 960, 1280] as const;

function withParams(src: string, params: Record<string, string | number>): string {
  try {
    const u = new URL(src, "https://placeholder.local");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    // Preserve original protocol/host when absolute; drop the placeholder base otherwise.
    if (src.startsWith("http")) return u.toString();
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return src;
  }
}

export type ResponsiveImage = {
  src: string; // primary (largest sensible default)
  srcSet: string; // widths srcset
  srcSetWebp: string; // widths srcset with format=webp
  sizes: string;
};

const DEFAULT_SIZES = "(min-width: 768px) 480px, 100vw";

export function buildResponsiveImage(
  originalSrc: string | undefined | null,
  opts: { sizes?: string; quality?: number } = {},
): ResponsiveImage | null {
  if (!originalSrc) return null;
  const q = opts.quality ?? 80;
  const sizes = opts.sizes ?? DEFAULT_SIZES;

  const srcSet = WIDTHS.map((w) => `${withParams(originalSrc, { w, quality: q })} ${w}w`).join(", ");
  const srcSetWebp = WIDTHS.map(
    (w) => `${withParams(originalSrc, { w, quality: q, format: "webp" })} ${w}w`,
  ).join(", ");
  // Prefer 960w as the default `src` — matches DPR 2 on 480px column.
  const src = withParams(originalSrc, { w: 960, quality: q });
  return { src, srcSet, srcSetWebp, sizes };
}

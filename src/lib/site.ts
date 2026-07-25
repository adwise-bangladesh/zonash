/**
 * Canonical origin for the storefront.
 *
 * The same app answers on the preview host, the published host and the stable
 * `project--<id>` host. Search engines treat those as duplicate storefronts
 * unless every page points at one canonical origin, so the value is hardcoded
 * to production rather than read from the request.
 */
export const SITE_URL = "https://zonash.lovable.app";

/** Absolute canonical URL for a path (path must start with "/"). */
export function canonicalUrl(path = "/"): string {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

/** Public-facing returns policy label — single source of truth for all copy. */
export const RETURNS_LABEL = "Instant Return";

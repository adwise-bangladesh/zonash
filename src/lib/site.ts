/**
 * Canonical origin for the storefront.
 *
 * The same app answers on the preview host, the published host and the stable
 * `project--<id>` host. Search engines treat those as duplicate storefronts
 * unless every page points at one canonical origin, so the value is fixed at
 * build time rather than read from the request.
 *
 * Self-hosted deploys set `VITE_SITE_URL` (see `.env.example`); without it we
 * fall back to the Lovable production host. Trailing slashes are stripped so
 * `canonicalUrl()` never emits a double slash.
 */
const CONFIGURED_SITE_URL =
  typeof import.meta.env?.VITE_SITE_URL === "string"
    ? import.meta.env.VITE_SITE_URL.trim().replace(/\/+$/, "")
    : "";

export const SITE_URL = /^https?:\/\/.+/.test(CONFIGURED_SITE_URL)
  ? CONFIGURED_SITE_URL
  : "https://zonash.lovable.app";

/** Absolute canonical URL for a path (path must start with "/"). */
export function canonicalUrl(path = "/"): string {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}


/** Public-facing returns policy label — single source of truth for all copy. */
export const RETURNS_LABEL = "Instant Return";

/**
 * Support contact — single source of truth.
 *
 * The product page shipped a placeholder WhatsApp number (8809610000000) that
 * routed customer "order via WhatsApp" taps to a non-existent account.
 */
export const SUPPORT_WA_NUMBER = "8801926644575";
export const SUPPORT_TEL = `+${SUPPORT_WA_NUMBER}`;

/** WhatsApp deep link with an optional prefilled message. */
export function waLink(message?: string): string {
  return `https://wa.me/${SUPPORT_WA_NUMBER}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

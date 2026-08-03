// Shared (client-safe) types + query options for WordPress site identity
// (title, tagline, logo, site icon).

import { queryOptions } from "@tanstack/react-query";
import { getSiteIdentity } from "./site-identity.functions";

export type SiteImage = {
  /** Absolute image URL, or null when WordPress has none set. */
  url: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
};

/** Back-compat alias: the header logo is just a site image. */
export type SiteLogo = SiteImage;

export type SiteIdentity = {
  /** WordPress "Site Title", or null when unavailable. */
  title: string | null;
  /** WordPress "Tagline", or null when unavailable. */
  tagline: string | null;
  logo: SiteImage;
  /** WordPress "Site Icon" (favicon source). */
  icon: SiteImage;
};

export const EMPTY_SITE_IMAGE: SiteImage = { url: null, width: null, height: null, alt: null };

export const EMPTY_SITE_IDENTITY: SiteIdentity = {
  title: null,
  tagline: null,
  logo: EMPTY_SITE_IMAGE,
  icon: EMPTY_SITE_IMAGE,
};

/** Built-in defaults used whenever WordPress has nothing configured. */
export const FALLBACK_SITE_TITLE = "Zonash";
export const FALLBACK_SITE_TAGLINE = "Fine Jewelry, Timeless Design";

export const siteIdentityQueryOptions = () =>
  queryOptions({
    queryKey: ["site-identity"] as const,
    queryFn: () => getSiteIdentity(),
    // Branding changes maybe once a year; the server layer already caches it in
    // Postgres + memory, so keep the client from ever refetching per page.
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 0,
  });

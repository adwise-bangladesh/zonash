// Shared (client-safe) types + query options for the WordPress site logo.

import { queryOptions } from "@tanstack/react-query";
import { getSiteLogo } from "./site-logo.functions";

export type SiteLogo = {
  /** Absolute image URL, or null when WordPress has no logo set. */
  url: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
};

export const EMPTY_SITE_LOGO: SiteLogo = { url: null, width: null, height: null, alt: null };

export const siteLogoQueryOptions = () =>
  queryOptions({
    queryKey: ["site-logo"] as const,
    queryFn: () => getSiteLogo(),
    // The logo changes maybe once a year; the server layer already caches it
    // in Postgres + memory, so keep the client from ever refetching per page.
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 0,
  });

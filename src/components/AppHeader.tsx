import { SiteHeader } from "@/components/layout/SiteHeader";

/**
 * AppHeader — thin wrapper around the site header. The top announcement bar
 * was intentionally removed to keep the storefront chrome minimal.
 */
export function AppHeader() {
  return <SiteHeader />;
}

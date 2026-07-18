import { TopAnnouncementBar } from "@/components/layout/TopAnnouncementBar";
import { SiteHeader } from "@/components/layout/SiteHeader";

/**
 * AppHeader — thin wrapper composing the announcement bar and the site header.
 * Kept as a named export so existing route imports (`@/components/AppHeader`)
 * continue to work.
 */
export function AppHeader() {
  return (
    <>
      <TopAnnouncementBar />
      <SiteHeader />
    </>
  );
}

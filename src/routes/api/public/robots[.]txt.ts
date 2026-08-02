/**
 * robots.txt — served from a server route so the sitemap URL stays in sync with
 * the canonical origin in src/lib/site.ts.
 *
 * Staff surfaces (/admin, /auth) and every transactional checkout screen are
 * disallowed: they are per-session, carry no crawlable value, and indexing them
 * would leak order-state URLs into search results.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/site";

const BODY = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /api/
Disallow: /cart
Disallow: /checkout
Disallow: /verify-otp
Disallow: /orders
Disallow: /order-confirmed
Disallow: /order-pending
Disallow: /order-review
Disallow: /order-blocked
Disallow: /order-callback-choice

Sitemap: ${SITE_URL}/sitemap.xml
`;

export const Route = createFileRoute("/api/public/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(BODY, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});

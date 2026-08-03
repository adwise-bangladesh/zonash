// Server-only resolution of the WordPress site logo.
//
// Cost model: WordPress is slow and the logo effectively never changes, so the
// resolved URL is stored in Postgres (`site_assets`) and additionally memoised
// in module memory. A warm isolate answers with zero I/O; a cold isolate does
// one Postgres read. WordPress itself is hit at most once per TTL window.

import { wooFetch } from "./woo.server";
import { EMPTY_SITE_LOGO, type SiteLogo } from "./site-logo";

const CACHE_KEY = "wp_site_logo";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h
/** Negative results are retried sooner so a fixed WP logo shows up quickly. */
const NEGATIVE_TTL_MS = 30 * 60 * 1000; // 30m

type Cached = { logo: SiteLogo; at: number };

let memo: Cached | null = null;
/** Single-flight guard: a burst of SSR renders triggers one WordPress fetch. */
let inflight: Promise<SiteLogo> | null = null;

function fresh(entry: Cached | null): boolean {
  if (!entry) return false;
  const ttl = entry.logo.url ? TTL_MS : NEGATIVE_TTL_MS;
  return Date.now() - entry.at < ttl;
}

async function readDb(): Promise<Cached | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_assets")
      .select("value, updated_at")
      .eq("key", CACHE_KEY)
      .maybeSingle();
    if (!data) return null;
    return {
      logo: { ...EMPTY_SITE_LOGO, ...(data.value as Partial<SiteLogo>) },
      at: new Date(data.updated_at).getTime(),
    };
  } catch {
    return null;
  }
}

async function writeDb(logo: SiteLogo): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("site_assets")
      .upsert({ key: CACHE_KEY, value: logo, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    // Cache writes are best-effort — never fail a page render over them.
  }
}

/**
 * The storefront may talk to Woo through the connector gateway, in which case
 * the store origin isn't in env. Product permalinks always carry it.
 */
async function resolveOrigin(): Promise<string | null> {
  const fromEnv = process.env.WC_STORE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const rows = await wooFetch<{ permalink?: string }[]>({
      path: "/products",
      query: { per_page: 1, status: "publish", _fields: "permalink" },
      timeoutMs: 5000,
    });
    const permalink = Array.isArray(rows) ? rows[0]?.permalink : undefined;
    return permalink ? new URL(permalink).origin : null;
  } catch {
    return null;
  }
}

async function json<T>(url: string, timeoutMs = 5000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromWordPress(): Promise<SiteLogo> {
  const origin = await resolveOrigin();
  if (!origin) return EMPTY_SITE_LOGO;

  // The unauthenticated REST index exposes the custom-logo attachment id and
  // the site icon, so no application password is needed for branding.
  const index = await json<{ site_logo?: number; site_icon_url?: string }>(`${origin}/wp-json/`);

  const logoId = typeof index?.site_logo === "number" ? index.site_logo : null;
  if (logoId) {
    const media = await json<{
      source_url?: string;
      alt_text?: string;
      media_details?: { width?: number; height?: number };
    }>(`${origin}/wp-json/wp/v2/media/${logoId}?_fields=source_url,alt_text,media_details`);
    if (media?.source_url) {
      return {
        url: media.source_url,
        width: media.media_details?.width ?? null,
        height: media.media_details?.height ?? null,
        alt: media.alt_text?.trim() || null,
      };
    }
  }

  if (index?.site_icon_url) {
    return { url: index.site_icon_url, width: null, height: null, alt: null };
  }
  return EMPTY_SITE_LOGO;
}

/** Resolve the site logo, hitting WordPress at most once per TTL window. */
export async function resolveSiteLogo(): Promise<SiteLogo> {
  if (fresh(memo)) return memo!.logo;

  const fromDb = await readDb();
  if (fresh(fromDb)) {
    memo = fromDb;
    return fromDb!.logo;
  }

  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const logo = await fetchFromWordPress();
      memo = { logo, at: Date.now() };
      await writeDb(logo);
      return logo;
    } catch {
      // Serve the stale value rather than nothing.
      return fromDb?.logo ?? memo?.logo ?? EMPTY_SITE_LOGO;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

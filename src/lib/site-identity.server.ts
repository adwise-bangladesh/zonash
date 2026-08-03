// Server-only resolution of WordPress site identity: title, tagline, logo and
// site icon.
//
// Cost model: WordPress is slow and branding effectively never changes, so the
// resolved values are stored in Postgres (`site_assets`) and additionally
// memoised in module memory. A warm isolate answers with zero I/O; a cold
// isolate does one Postgres read. WordPress is hit at most once per TTL window.

import { wooFetch } from "./woo.server";
import { EMPTY_SITE_IDENTITY, EMPTY_SITE_IMAGE, type SiteIdentity, type SiteImage } from "./site-identity";

const CACHE_KEY = "wp_site_identity";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h
/** Negative results are retried sooner so fixed WP branding shows up quickly. */
const NEGATIVE_TTL_MS = 30 * 60 * 1000; // 30m

type Cached = { identity: SiteIdentity; at: number };

let memo: Cached | null = null;
/** Single-flight guard: a burst of SSR renders triggers one WordPress fetch. */
let inflight: Promise<SiteIdentity> | null = null;

function complete(identity: SiteIdentity): boolean {
  return Boolean(identity.title && identity.logo.url && identity.icon.url);
}

function fresh(entry: Cached | null): boolean {
  if (!entry) return false;
  const ttl = complete(entry.identity) ? TTL_MS : NEGATIVE_TTL_MS;
  return Date.now() - entry.at < ttl;
}

function normalize(value: unknown): SiteIdentity {
  const raw = (value ?? {}) as Partial<SiteIdentity>;
  return {
    title: raw.title ?? null,
    tagline: raw.tagline ?? null,
    logo: { ...EMPTY_SITE_IMAGE, ...(raw.logo ?? {}) },
    icon: { ...EMPTY_SITE_IMAGE, ...(raw.icon ?? {}) },
  };
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
    return { identity: normalize(data.value), at: new Date(data.updated_at).getTime() };
  } catch {
    return null;
  }
}

async function writeDb(identity: SiteIdentity): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("site_assets")
      .upsert({ key: CACHE_KEY, value: identity, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    // Cache writes are best-effort — never fail a page render over them.
  }
}

/**
 * The storefront may talk to Woo through the connector gateway, in which case
 * the store origin isn't in env. Product permalinks always carry it.
 */
async function resolveOrigin(): Promise<string | null> {
  const fromEnv = process.env.WC_STORE_URL || process.env.WP_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const rows = await wooFetch<{ permalink?: string }[]>({
      path: "/products",
      query: { per_page: 1, status: "publish", _fields: "permalink" },
      timeoutMs: 5000,
    });
    const permalink = Array.isArray(rows) ? rows[0]?.permalink : undefined;
    if (permalink) return new URL(permalink).origin;
  } catch (err) {
    console.warn("[site-identity] origin lookup via Woo failed", err);
  }
  // Last resort: the production WordPress store host. Override with WP_SITE_URL.
  return "https://shop.zonash.com";
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

async function media(origin: string, id: number): Promise<SiteImage> {
  if (!id) return EMPTY_SITE_IMAGE;
  const m = await json<{
    source_url?: string;
    alt_text?: string;
    media_details?: { width?: number; height?: number };
  }>(`${origin}/wp-json/wp/v2/media/${id}?_fields=source_url,alt_text,media_details`);
  if (!m?.source_url) return EMPTY_SITE_IMAGE;
  return {
    url: m.source_url,
    width: m.media_details?.width ?? null,
    height: m.media_details?.height ?? null,
    alt: m.alt_text?.trim() || null,
  };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#039;|&#39;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function clean(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const out = decodeEntities(text).trim();
  return out.length ? out : null;
}

async function fetchFromWordPress(): Promise<SiteIdentity> {
  const origin = await resolveOrigin();
  if (!origin) return EMPTY_SITE_IDENTITY;

  // The unauthenticated REST index exposes site name/description plus the
  // custom-logo and site-icon attachment ids — no application password needed.
  const index = await json<{
    name?: string;
    description?: string;
    site_logo?: number;
    site_icon?: number;
    site_icon_url?: string;
  }>(`${origin}/wp-json/`);
  if (!index) return EMPTY_SITE_IDENTITY;

  const logoId = typeof index.site_logo === "number" && index.site_logo > 0 ? index.site_logo : 0;
  const iconId = typeof index.site_icon === "number" && index.site_icon > 0 ? index.site_icon : 0;

  const [logoFromId, iconFromId] = await Promise.all([media(origin, logoId), media(origin, iconId)]);

  const iconFromUrl: SiteImage = index.site_icon_url
    ? { url: index.site_icon_url, width: null, height: null, alt: null }
    : EMPTY_SITE_IMAGE;

  const icon = iconFromId.url ? iconFromId : iconFromUrl;
  // Themes often leave the custom logo unset; the site icon is a fine stand-in.
  const logo = logoFromId.url ? logoFromId : icon;

  return {
    title: clean(index.name),
    tagline: clean(index.description),
    logo,
    icon,
  };
}

/** Resolve site identity, hitting WordPress at most once per TTL window. */
export async function resolveSiteIdentity(): Promise<SiteIdentity> {
  if (fresh(memo)) return memo!.identity;

  const fromDb = await readDb();
  if (fresh(fromDb)) {
    memo = fromDb;
    return fromDb!.identity;
  }

  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const identity = await fetchFromWordPress();
      memo = { identity, at: Date.now() };
      await writeDb(identity);
      return identity;
    } catch {
      // Serve the stale value rather than nothing.
      return fromDb?.identity ?? memo?.identity ?? EMPTY_SITE_IDENTITY;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

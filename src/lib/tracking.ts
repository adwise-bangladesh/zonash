/**
 * Client-side tracking snapshot for pending orders.
 *
 * Best-effort — every field is optional and any failure is swallowed. Never
 * blocks the checkout. GPS is only captured when the user has already
 * granted geolocation permission; we never trigger a prompt from checkout.
 */

export type GpsFix =
  | { lat: number; lng: number; accuracy: number; ts: string }
  | { error: string };

export type ClientTracking = {
  session_id: string;
  timestamp: string;
  page_url: string;
  referrer: string | null;
  user_agent: string;
  language: string;
  languages: readonly string[];
  timezone: string;
  timezone_offset: number;
  screen: { w: number; h: number; dpr: number; color_depth: number };
  viewport: { w: number; h: number };
  platform?: string;
  hardware_concurrency?: number;
  device_memory?: number;
  connection?: {
    effective_type?: string;
    downlink?: number;
    rtt?: number;
    save_data?: boolean;
  };
  cookies_enabled: boolean;
  do_not_track: string | null;
  touch: boolean;
  utm: Record<string, string>;
  gps?: GpsFix;
  fingerprint: string;
  contact?: { name?: string; email?: string; phone?: string };
};

const SID_KEY = "zonash:sid";
const UTM_KEY = "zonash:utm";

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function captureUtm(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const u = new URL(window.location.href);
    for (const [k, v] of u.searchParams) {
      const kl = k.toLowerCase();
      if (kl.startsWith("utm_") || ["fbclid", "gclid", "msclkid", "ttclid"].includes(kl)) {
        out[k] = v;
      }
    }
    const stored = sessionStorage.getItem(UTM_KEY);
    if (stored) {
      try {
        Object.assign(out, JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    if (Object.keys(out).length) {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(out));
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function fingerprint(): Promise<string> {
  const nav = navigator as unknown as {
    platform?: string;
    hardwareConcurrency?: number;
    deviceMemory?: number;
  };
  const raw = [
    navigator.userAgent,
    navigator.language,
    navigator.languages?.join(","),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    `${window.devicePixelRatio}`,
    nav.platform ?? "",
    String(nav.hardwareConcurrency ?? ""),
    String(nav.deviceMemory ?? ""),
  ].join("|");

  try {
    const buf = new TextEncoder().encode(raw);
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
    return Math.abs(h).toString(16);
  }
}

async function tryGeo(timeoutMs = 2500): Promise<GpsFix | undefined> {
  // Prefer the session-cached fix collected by <GpsGate/> on first page load.
  try {
    const cached = sessionStorage.getItem("zonash:gps");
    if (cached) {
      const parsed = JSON.parse(cached) as GpsFix;
      return parsed;
    }
  } catch {
    /* ignore */
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return undefined;
  try {
    if ("permissions" in navigator) {
      const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (p.state !== "granted") return undefined;
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return new Promise<GpsFix>((resolve) => {
    const t = setTimeout(() => resolve({ error: "timeout" }), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: new Date().toISOString(),
        });
      },
      (err) => {
        clearTimeout(t);
        resolve({ error: err.message });
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export async function collectTracking(
  contact: { name?: string; email?: string; phone?: string } = {},
): Promise<ClientTracking> {
  const nav = navigator as unknown as {
    platform?: string;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    mozConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    webkitConnection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
    userAgentData?: { platform?: string };
  };
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  const [fp, gps] = await Promise.all([fingerprint(), tryGeo()]);

  return {
    session_id: getSessionId(),
    timestamp: new Date().toISOString(),
    page_url: window.location.href,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages ?? [navigator.language],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone_offset: new Date().getTimezoneOffset(),
    screen: {
      w: screen.width,
      h: screen.height,
      dpr: window.devicePixelRatio,
      color_depth: screen.colorDepth,
    },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    platform: nav.userAgentData?.platform ?? nav.platform,
    hardware_concurrency: nav.hardwareConcurrency,
    device_memory: nav.deviceMemory,
    connection: conn
      ? {
          effective_type: conn.effectiveType,
          downlink: conn.downlink,
          rtt: conn.rtt,
          save_data: conn.saveData,
        }
      : undefined,
    cookies_enabled: navigator.cookieEnabled,
    do_not_track: navigator.doNotTrack ?? null,
    touch: "ontouchstart" in window,
    utm: captureUtm(),
    gps,
    fingerprint: fp,
    contact,
  };
}

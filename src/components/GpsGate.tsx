/**
 * GpsGate — requests geolocation once per browser session and caches the fix
 * in sessionStorage under `zonash:gps`. Silent (no UI). The browser's own
 * permission prompt is the ask. Any decision (grant / deny / dismiss) is
 * recorded so we don't re-prompt in the same session.
 */
import { useEffect } from "react";

const KEY = "zonash:gps";
const ASKED_KEY = "zonash:gps:asked";

export function GpsGate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;
    try {
      if (sessionStorage.getItem(ASKED_KEY)) return;
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      return;
    }

    const askAndCache = () => {
      try {
        sessionStorage.setItem(ASKED_KEY, "1");
      } catch {
        /* ignore */
      }
      const id = window.setTimeout(() => {
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ error: "timeout" }));
        } catch {
          /* ignore */
        }
      }, 15_000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.clearTimeout(id);
          try {
            sessionStorage.setItem(
              KEY,
              JSON.stringify({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                ts: new Date().toISOString(),
              }),
            );
          } catch {
            /* ignore */
          }
        },
        (err) => {
          window.clearTimeout(id);
          try {
            sessionStorage.setItem(KEY, JSON.stringify({ error: err.message }));
          } catch {
            /* ignore */
          }
        },
        { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
      );
    };

    // Prefer permissions API to short-circuit denied state.
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((p) => {
          if (p.state === "denied") {
            try {
              sessionStorage.setItem(KEY, JSON.stringify({ error: "denied" }));
              sessionStorage.setItem(ASKED_KEY, "1");
            } catch {
              /* ignore */
            }
            return;
          }
          askAndCache();
        })
        .catch(() => askAndCache());
    } else {
      askAndCache();
    }
  }, []);

  return null;
}

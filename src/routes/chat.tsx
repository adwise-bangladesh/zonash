import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Phone, RefreshCw } from "lucide-react";

import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { loadChatwoot } from "@/lib/chatwoot";
import { SUPPORT_TEL, canonicalUrl, waLink } from "@/lib/site";

const CANONICAL = canonicalUrl("/chat");

type ChatSearch = { topic?: string; from?: string };

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    topic: typeof search.topic === "string" ? search.topic.slice(0, 120) : undefined,
    from: typeof search.from === "string" ? search.from.slice(0, 120) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live chat with Zonash support" },
      {
        name: "description",
        content:
          "Chat live with the Zonash team about products, delivery, returns or an existing order — daily 10:00 AM to 10:00 PM.",
      },
      { property: "og:title", content: "Live chat with Zonash support" },
      {
        property: "og:description",
        content: "Talk to a real Zonash agent about your order, delivery or a product.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
      // A live-chat session has no indexable content.
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: ChatPage,
});

/**
 * Docks the Chatwoot panel into this screen (instead of a floating bubble),
 * and hides host-side branding/bubble chrome.
 */
const DOCK_CSS = `
.woot-widget-bubble,
.woot-widget-bubble.woot-elements--right,
.woot--bubble-holder,
.woot-widget-holder__branding,
.woot--branding { display: none !important; }
.woot-widget-holder {
  position: fixed !important;
  top: var(--cw-top, 96px) !important;
  bottom: var(--cw-bottom, 12px) !important;
  left: 50% !important;
  right: auto !important;
  transform: translateX(-50%) !important;
  width: min(100% - 24px, 456px) !important;
  height: auto !important;
  max-height: none !important;
  min-height: 0 !important;
  border-radius: 16px !important;
  box-shadow: none !important;
  border: 1px solid hsl(var(--border)) !important;
  overflow: hidden !important;
  z-index: 30 !important;
}
.woot-widget-holder iframe { height: 100% !important; }
`;

function ChatPage() {
  const { topic } = Route.useSearch();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);
  const slotRef = useRef<HTMLDivElement | null>(null);

  // Keep the docked panel aligned with our own layout box.
  useEffect(() => {
    const sync = () => {
      const el = slotRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      document.documentElement.style.setProperty("--cw-top", `${Math.max(r.top, 0)}px`);
      document.documentElement.style.setProperty(
        "--cw-bottom",
        `${Math.max(window.innerHeight - r.bottom, 0)}px`,
      );
    };
    sync();
    window.addEventListener("resize", sync);
    const t = setInterval(sync, 500);
    return () => {
      window.removeEventListener("resize", sync);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    const deadline = setTimeout(() => {
      if (!cancelled) setState((s) => (s === "loading" ? "error" : s));
    }, 15_000);

    loadChatwoot()
      .then((cw) => {
        if (cancelled) return;
        try {
          if (topic) cw.setCustomAttributes?.({ topic });
        } catch {
          /* attributes are best-effort */
        }
        // Open straight into the conversation view — no welcome screen.
        cw.toggle("open");
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      clearTimeout(deadline);
    };
  }, [nonce, topic]);

  // Close the panel when leaving the chat screen.
  useEffect(
    () => () => {
      try {
        window.$chatwoot?.toggle("close");
      } catch {
        /* ignore */
      }
      document.documentElement.style.removeProperty("--cw-top");
      document.documentElement.style.removeProperty("--cw-bottom");
    },
    [],
  );

  const waHref = waLink(`Hi Zonash, I need help.${topic ? `\n${topic}` : ""}`);

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <style>{DOCK_CSS}</style>
      <CheckoutHeader title="Live chat" backTo="/support" />

      <h1 className="sr-only">Live chat with Zonash support</h1>

      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Zonash support
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {topic ? topic : "Daily 10:00 AM – 10:00 PM · replies in minutes"}
            </p>
          </div>
          <a
            href={`tel:${SUPPORT_TEL}`}
            aria-label="Call Zonash support"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {/* Layout slot the Chatwoot panel is docked into. */}
        <div
          ref={slotRef}
          className="relative mt-2 flex-1 overflow-hidden rounded-2xl border border-border bg-card"
        >
          {state === "loading" && (
            <div className="absolute inset-0 grid place-items-center gap-2 bg-card">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="text-[12px]">Connecting you to an agent…</span>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[13px] font-semibold">Live chat isn’t loading</p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Your network may be blocking it. Try again, or reach us on WhatsApp — same team,
                same speed.
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setNonce((n) => n + 1)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Try again
                </button>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    const w = window.open(waHref, "_blank", "noopener,noreferrer");
                    if (!w) {
                      try {
                        window.top!.location.href = waHref;
                      } catch {
                        window.location.href = waHref;
                      }
                    }
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-[12px] font-semibold text-white"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

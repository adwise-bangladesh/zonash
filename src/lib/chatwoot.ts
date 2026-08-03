/**
 * Chatwoot live-chat configuration.
 *
 * We do NOT inject the Chatwoot SDK globally: the floating bubble would sit on
 * top of the sticky add-to-cart bars on every page and ship ~120KB of JS to
 * every visitor. Instead the SDK is loaded lazily, only on our own `/chat`
 * screen, where we dock the widget panel into the page and open it straight
 * into the conversation view.
 *
 * Both values below are public (the website token is designed to ship in
 * client-side script tags), so they belong in code, not in secrets.
 */
export const CHATWOOT_BASE_URL = "https://chatwoot.zonash.com";
export const CHATWOOT_WEBSITE_TOKEN = "zN8PKVQ1WEn415BvDEGcZs8N";

export type ChatContext = {
  /** Short reason the customer opened chat, e.g. "Order #24705". */
  topic?: string;
  /** Where they came from — used for the back button + agent context. */
  from?: string;
};

type ChatwootApi = {
  toggle: (state?: "open" | "close") => void;
  setCustomAttributes?: (attrs: Record<string, string>) => void;
};

declare global {
  interface Window {
    chatwootSettings?: Record<string, unknown>;
    chatwootSDK?: { run: (opts: { websiteToken: string; baseUrl: string }) => void };
    $chatwoot?: ChatwootApi;
  }
}

const SCRIPT_ID = "chatwoot-sdk";

/**
 * Loads the Chatwoot SDK once per page-load and resolves when `$chatwoot` is
 * available. Safe to call repeatedly — subsequent calls reuse the same script.
 */
export function loadChatwoot(): Promise<ChatwootApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.$chatwoot) return Promise.resolve(window.$chatwoot);

  return new Promise((resolve, reject) => {
    const onReady = () => {
      if (window.$chatwoot) resolve(window.$chatwoot);
      else reject(new Error("chatwoot-missing"));
    };
    window.addEventListener("chatwoot:ready", onReady, { once: true });

    if (document.getElementById(SCRIPT_ID)) return;

    // The bubble is hidden: our page provides its own entry point/back button.
    window.chatwootSettings = {
      hideMessageBubble: true,
      position: "right",
      type: "standard",
      showPopoutButton: false,
      darkMode: "auto",
    };

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = `${CHATWOOT_BASE_URL}/packs/js/sdk.js`;
    s.async = true;
    s.onload = () => {
      try {
        window.chatwootSDK?.run({
          websiteToken: CHATWOOT_WEBSITE_TOKEN,
          baseUrl: CHATWOOT_BASE_URL,
        });
      } catch {
        reject(new Error("chatwoot-run-failed"));
      }
    };
    s.onerror = () => reject(new Error("chatwoot-script-failed"));
    document.head.appendChild(s);
  });
}

/** Build the in-app chat link, carrying optional context for the agent. */
export function chatSearch(ctx: ChatContext = {}): ChatContext {
  const out: ChatContext = {};
  if (ctx.topic) out.topic = ctx.topic.slice(0, 120);
  if (ctx.from) out.from = ctx.from.slice(0, 120);
  return out;
}

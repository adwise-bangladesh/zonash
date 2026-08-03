/**
 * Chatwoot live-chat configuration.
 *
 * We do NOT inject the Chatwoot SDK globally: the floating bubble would sit on
 * top of the sticky add-to-cart bars on every page and ship ~120KB of JS to
 * every visitor. Instead the widget is embedded once, inside our own `/chat`
 * screen, through Chatwoot's standalone widget URL. That keeps the storefront
 * bundle untouched and lets the chat screen match the app design.
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

/**
 * Standalone widget URL. Chatwoot persists the contact/conversation in its own
 * origin storage, so returning visitors resume the same thread automatically.
 */
export function chatwootWidgetUrl(locale = "en"): string {
  const u = new URL("/widget", CHATWOOT_BASE_URL);
  u.searchParams.set("website_token", CHATWOOT_WEBSITE_TOKEN);
  u.searchParams.set("locale", locale);
  return u.toString();
}

/** Build the in-app chat link, carrying optional context for the agent. */
export function chatSearch(ctx: ChatContext = {}): ChatContext {
  const out: ChatContext = {};
  if (ctx.topic) out.topic = ctx.topic.slice(0, 120);
  if (ctx.from) out.from = ctx.from.slice(0, 120);
  return out;
}

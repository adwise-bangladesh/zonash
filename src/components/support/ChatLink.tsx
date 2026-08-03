import { Link } from "@tanstack/react-router";
import { MessageCircle, ChevronRight } from "lucide-react";

import { chatSearch, type ChatContext } from "@/lib/chatwoot";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Entry points into the in-app live chat (`/chat`).
 *
 * `row`  — full-width card, used on the support page.
 * `pill` — compact inline control, used next to product/order actions.
 */
export function ChatLink({
  variant = "pill",
  label = "Live chat",
  hint,
  context,
  className = "",
}: {
  variant?: "row" | "pill";
  label?: string;
  hint?: string;
  context?: ChatContext;
  className?: string;
}) {
  const search = chatSearch(context ?? {});

  if (variant === "row") {
    return (
      <Link
        to="/chat"
        search={search}
        preload="intent"
        aria-label="Open live chat with Zonash support"
        className={`flex items-center gap-3 rounded-2xl bg-primary/[0.07] px-4 py-4 ring-1 ring-primary/20 transition-transform active:scale-[0.99] ${focusRing} ${className}`}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-primary">{label}</span>
          <span className="block text-[12px] text-primary/75">
            {hint ?? "Chat with an agent right here · 10 AM – 10 PM"}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Link
      to="/chat"
      search={search}
      preload="intent"
      aria-label="Open live chat with Zonash support"
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-[12px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary ${focusRing} ${className}`}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      {label}
    </Link>
  );
}

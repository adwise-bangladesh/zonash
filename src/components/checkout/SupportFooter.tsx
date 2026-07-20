const SUPPORT_TEL = "+8801926644575";
const SUPPORT_WA_NUMBER = "8801926644575";

/**
 * Slim support strip used on checkout / verification flow pages.
 * Uses matched circular icons (solid phone + official WhatsApp glyph)
 * and clearly named actions.
 */
export function SupportFooter({
  label = "Need help?",
  waMessage,
}: {
  label?: string;
  waMessage?: string;
}) {
  const waHref = `https://wa.me/${SUPPORT_WA_NUMBER}${
    waMessage ? `?text=${encodeURIComponent(waMessage)}` : ""
  }`;
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[11px] text-muted-foreground">
        {label} <span className="text-foreground/70">Daily 10am – 10pm</span>
      </span>
      <div className="flex items-center gap-2">
        <a
          href={`tel:${SUPPORT_TEL}`}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-[12px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary"
          aria-label="Call us"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
            <PhoneGlyph />
          </span>
          Call us
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-[12px] font-medium text-foreground/85 transition-colors hover:border-[#25D366]/60 hover:text-[#128C7E]"
          aria-label="Chat on WhatsApp"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#25D366]/12 text-[#128C7E]">
            <WhatsAppGlyph />
          </span>
          WhatsApp
        </a>
      </div>
    </div>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M20.5 3.5A11 11 0 0 0 3.1 17L2 22l5.2-1.1A11 11 0 1 0 20.5 3.5zM12 20a8.9 8.9 0 0 1-4.6-1.3l-.3-.2-3.1.7.7-3-.2-.3A9 9 0 1 1 12 20zm5-6.6c-.3-.15-1.7-.85-2-.95-.25-.1-.45-.15-.65.15s-.75.95-.9 1.15-.35.2-.6.05a7.4 7.4 0 0 1-2.15-1.35 8.3 8.3 0 0 1-1.5-1.85c-.15-.3 0-.45.15-.6.15-.15.3-.35.45-.5.15-.15.2-.3.3-.5s.05-.35 0-.5c-.05-.15-.65-1.55-.9-2.15-.25-.55-.5-.5-.65-.5h-.55c-.2 0-.5.05-.75.35s-1 1-1 2.4 1.05 2.8 1.2 3 2.05 3.15 5 4.4c.7.3 1.25.5 1.7.65.7.2 1.35.2 1.85.1.55-.1 1.7-.7 1.95-1.35.25-.65.25-1.25.2-1.35-.1-.15-.3-.2-.6-.35z" />
    </svg>
  );
}

/**
 * Helper to build a rich WhatsApp prefill message with all order context.
 */
export function buildSupportMessage(ctx: {
  page: string;
  orderNumber?: string | number;
  phone?: string;
  extra?: string;
}): string {
  const lines = [
    `Hi Zonash, I need help with my order.`,
    ctx.orderNumber ? `Order: #${ctx.orderNumber}` : undefined,
    ctx.phone ? `Phone: ${ctx.phone}` : undefined,
    `Page: ${ctx.page}`,
    ctx.extra,
  ].filter(Boolean);
  return lines.join("\n");
}

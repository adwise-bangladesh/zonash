import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";

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
            <WhatsAppIcon className="h-3.5 w-3.5" />
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

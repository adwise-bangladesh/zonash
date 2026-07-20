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
  // Official WhatsApp brand glyph (Simple Icons, CC0). Uses fillRule="evenodd"
  // to prevent the inner path bleeding into the outer bubble shape.
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
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

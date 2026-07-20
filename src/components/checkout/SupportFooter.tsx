import { Phone, MessageCircle } from "lucide-react";

const SUPPORT_TEL = "+8801926644575";
const SUPPORT_WA_NUMBER = "8801926644575";

/**
 * Slim, low-attention support strip used on the checkout flow pages.
 * Pass `waMessage` to prefill the WhatsApp thread with order context
 * (order number, phone, page, etc.).
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
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
      <span>
        {label} <span className="text-foreground/70">10am – 10pm</span>
      </span>
      <span aria-hidden className="text-border">
        ·
      </span>
      <a
        href={`tel:${SUPPORT_TEL}`}
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-foreground/80 transition-colors hover:text-primary"
        aria-label="Call support"
      >
        <Phone className="h-3.5 w-3.5" strokeWidth={2} />
        Call
      </a>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-foreground/80 transition-colors hover:text-[#25D366]"
        aria-label="WhatsApp"
      >
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
        WhatsApp
      </a>
    </div>
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

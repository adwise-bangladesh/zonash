import { Phone, MessageCircle } from "lucide-react";

const SUPPORT_PHONE_LOCAL = "01926644575";
const SUPPORT_PHONE_TEL = "+8801926644575";
const SUPPORT_WA = "https://wa.me/8801926644575";

export function SupportFooter({ label = "Need help?" }: { label?: string }) {
  return (
    <div className="w-full">
      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`tel:${SUPPORT_PHONE_TEL}`}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background/80 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <Phone className="h-4 w-4 text-primary" />
          Call
        </a>
        <a
          href={SUPPORT_WA}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{SUPPORT_PHONE_LOCAL}</span> · 9am – 10pm
      </p>
    </div>
  );
}

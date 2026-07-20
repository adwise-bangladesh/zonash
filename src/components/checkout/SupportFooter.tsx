const SUPPORT_PHONE_LOCAL = "01926644575";
const SUPPORT_PHONE_TEL = "+8801926644575";
const SUPPORT_WA = "https://wa.me/8801926644575";

// Identical solid glyph icons, same viewBox / weight / fill treatment.
function PhoneGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1l-2.23 2.2Z" />
    </svg>
  );
}

function WhatsAppGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.06L2 22l5.06-1.51A9.93 9.93 0 1 0 12.04 2Zm5.8 14.06c-.24.68-1.4 1.29-1.95 1.34-.5.05-1.13.07-1.82-.11a16.6 16.6 0 0 1-1.66-.62c-2.92-1.26-4.82-4.2-4.97-4.4-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.26-.29.57-.36.76-.36h.55c.18 0 .42-.07.66.5.24.6.82 2.06.9 2.21.07.15.12.32.02.51-.09.2-.14.32-.28.5-.14.17-.3.38-.43.5-.14.15-.29.31-.13.6.16.29.72 1.19 1.55 1.93 1.06.94 1.96 1.24 2.25 1.38.29.14.46.12.63-.07.17-.2.72-.84.91-1.13.19-.29.38-.24.64-.14.26.09 1.66.78 1.94.92.29.14.48.22.55.34.07.13.07.72-.17 1.4Z" />
    </svg>
  );
}

export function SupportFooter({ label = "Need help?" }: { label?: string }) {
  return (
    <div className="w-full">
      <p className="mb-1.5 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="flex items-stretch gap-2">
        <a
          href={`tel:${SUPPORT_PHONE_TEL}`}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background/80 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <PhoneGlyph className="h-4 w-4 text-primary" />
          Call
        </a>
        <a
          href={SUPPORT_WA}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <WhatsAppGlyph className="h-4 w-4 text-white" />
          WhatsApp
        </a>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{SUPPORT_PHONE_LOCAL}</span> · 9am – 10pm
      </p>
    </div>
  );
}

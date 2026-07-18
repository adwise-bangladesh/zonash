/**
 * "New Order" dropdown — opens the POS page with a preselected channel.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Phone,
  MessageCircle,
  Instagram,
  Store,
  MoreHorizontal,
} from "lucide-react";

type Channel = {
  key: "phone" | "whatsapp" | "messenger" | "instagram" | "instore" | "other";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
};

const CHANNELS: Channel[] = [
  { key: "phone", label: "Phone call", icon: Phone, hint: "Voice order" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, hint: "Chat order" },
  { key: "messenger", label: "Messenger", icon: MessageCircle, hint: "Facebook DM" },
  { key: "instagram", label: "Instagram", icon: Instagram, hint: "DM order" },
  { key: "instore", label: "In-store", icon: Store, hint: "Walk-in" },
  { key: "other", label: "Other", icon: MoreHorizontal, hint: "Manual entry" },
];

export function NewOrderMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="New order"
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden md:inline">New order</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Take order via
          </div>
          <ul className="pb-1">
            {CHANNELS.map(({ key, label, icon: Icon, hint }) => (
              <li key={key}>
                <Link
                  to="/admin/pos"
                  search={{ channel: key } as never}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 text-[12.5px] hover:bg-muted"
                >
                  <span
                    className="grid h-7 w-7 place-items-center rounded-md"
                    style={{
                      background: "color-mix(in oklab, var(--primary) 12%, transparent)",
                      color: "var(--primary)",
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate font-medium text-foreground">{label}</div>
                    {hint && (
                      <div className="truncate text-[10.5px] text-muted-foreground">
                        {hint}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

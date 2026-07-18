import { Truck, Phone } from "lucide-react";

export function TopAnnouncementBar() {
  return (
    <div className="hidden border-b border-border bg-surface-muted text-xs text-muted-foreground md:block">
      <div className="container-page flex h-9 items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Free shipping on orders over 1,500 Tk across Bangladesh</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="/track" className="hover:text-primary">Track order</a>
          <a href="/help" className="hover:text-primary">Help center</a>
          <a href="tel:+8809610000000" className="flex items-center gap-1.5 hover:text-primary">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            +880 9610 000 000
          </a>
        </div>
      </div>
    </div>
  );
}

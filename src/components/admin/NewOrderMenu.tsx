/**
 * "New order" — simple button linking to the POS page.
 */
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

export function NewOrderMenu() {
  return (
    <Link
      to="/admin/pos"
      title="New order"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="hidden md:inline">New order</span>
    </Link>
  );
}

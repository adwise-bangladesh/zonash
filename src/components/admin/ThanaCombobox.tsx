/**
 * Shared Thana combobox — Steadfast police-station list with search & recent chips.
 * Used by POS and the Order edit drawer.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, X, Check } from "lucide-react";

export function ThanaCombobox({
  value,
  onChange,
  options,
  grouped,
  loading,
  recent = [],
  className = "",
  buttonClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  grouped?: Record<string, string[]>;
  loading: boolean;
  recent?: string[];
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-thana-root]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const hasGroups = !!grouped && Object.keys(grouped).length > 0;

  const filteredFlat = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const src = options ?? [];
    if (!needle) return src.slice(0, 200);
    return src.filter((s) => s.toLowerCase().includes(needle)).slice(0, 200);
  }, [q, options]);

  const filteredGroups = useMemo(() => {
    if (!hasGroups) return [] as Array<[string, string[]]>;
    const needle = q.trim().toLowerCase();
    const entries = Object.entries(grouped!).sort(([a], [b]) => a.localeCompare(b));
    if (!needle) return entries;
    return entries
      .map(([d, list]) => [d, list.filter((s) => s.toLowerCase().includes(needle))] as [string, string[]])
      .filter(([, list]) => list.length > 0);
  }, [q, grouped, hasGroups]);

  // Show current value in the list even if the fetched options haven't loaded yet.
  const showValueMissing = value && !(options ?? []).includes(value);

  const placeholder = loading ? "Loading thanas…" : "Select thana";


  const btnCls =
    buttonClassName ??
    "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left text-[12px] outline-none focus:border-primary/40";

  return (
    <div className={`relative ${className}`} data-thana-root>
      <button type="button" onClick={() => setOpen((s) => !s)} className={btnCls}>
        <span className={value ? "truncate text-foreground" : "text-muted-foreground"}>
          {value || placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="grid h-4 w-4 place-items-center rounded text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search thana…"
                className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-[12px] outline-none focus:border-primary/40"
              />
            </div>
          </div>
          {recent.length > 0 && !q && (
            <div className="border-b border-border px-2 py-1.5">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </div>
              <div className="flex flex-wrap gap-1">
                {recent.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10.5px] hover:bg-primary/10 hover:text-primary"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto pb-1">
            {showValueMissing && !q && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(value);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between bg-primary/5 px-3 py-1.5 text-left text-[12px] text-primary"
                >
                  <span>{value} (current)</span>
                  <Check className="h-3 w-3" />
                </button>
              </li>
            )}
            {hasGroups ? (
              filteredGroups.length === 0 && !showValueMissing ? (
                <li className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                  {loading ? "Loading…" : "No matches"}
                </li>
              ) : (
                filteredGroups.map(([district, list]) => (
                  <li key={district}>
                    <div className="sticky top-0 z-10 border-b border-border bg-popover px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {district}
                    </div>
                    <ul>
                      {list.map((t) => (
                        <li key={`${district}::${t}`}>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(t);
                              setOpen(false);
                              setQ("");
                            }}
                            className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-muted ${
                              t === value ? "bg-primary/5 text-primary" : ""
                            }`}
                          >
                            <span>{t}</span>
                            {t === value && <Check className="h-3 w-3" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))
              )
            ) : filteredFlat.length === 0 && !showValueMissing ? (
              <li className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                {loading ? "Loading…" : "No matches"}
              </li>
            ) : (
              filteredFlat.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                      setQ("");
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-muted ${
                      t === value ? "bg-primary/5 text-primary" : ""
                    }`}
                  >
                    <span>{t}</span>
                    {t === value && <Check className="h-3 w-3" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

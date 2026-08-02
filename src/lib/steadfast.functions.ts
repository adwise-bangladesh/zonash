/**
 * Storefront server functions for the Steadfast Courier integration.
 *
 * The staff dashboard lives in a separate project, so this file keeps only the
 * public thana (police-station) lookup that checkout needs.
 */
import { createServerFn } from "@tanstack/react-start";

// -----------------------------------------------------------------------------
// Police stations (thana list) — persisted in `public.police_stations`.
// The list never changes, so we read from Postgres. On the very first request
// (empty table) we seed from the Steadfast API once and store forever.
// -----------------------------------------------------------------------------

type PoliceCache = { items: string[]; dhakaCity: string[]; grouped: Record<string, string[]> };
// Tiny per-worker memo so a single request doesn't re-read the same rows.
let _policeMemo: PoliceCache | null = null;

function nameOf(p: unknown): string {
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    const v = o.name ?? o.police_station ?? o.policestation ?? o.thana;
    return typeof v === "string" ? v.trim() : "";
  }
  return "";
}

type PSRow = { district_id: number; district_name: string; name: string; is_dhaka_city: boolean };

async function seedPoliceStationsFromApi(): Promise<PSRow[]> {
  const { sfGetPoliceStations, steadfastConfigured } = await import("./steadfast.server");
  if (!steadfastConfigured()) return [];
  const res = await sfGetPoliceStations();
  const raw: unknown =
    (res as { data?: unknown }).data ??
    (res as { police_stations?: unknown }).police_stations ??
    res;

  const rows: PSRow[] = [];
  const seen = new Set<string>();
  const push = (district_id: number, district_name: string, name: string) => {
    const n = name.trim();
    const d = district_name.trim() || "Other";
    if (!n) return;
    const key = `${district_id}::${n.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ district_id, district_name: d, name: n, is_dhaka_city: district_id === 1 });
  };

  if (Array.isArray(raw)) {
    for (const row of raw as Array<Record<string, unknown>>) {
      const did = typeof row?.id === "number" ? row.id : 0;
      const dname = typeof row?.name === "string" ? row.name : did === 1 ? "Dhaka City" : "";
      const list = (row?.policestations ?? row?.police_stations) as unknown;
      if (Array.isArray(list)) {
        for (const p of list) {
          const n = nameOf(p);
          if (n) push(did, dname, n);
        }
      }
    }
  }

  if (rows.length === 0) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // ignoreDuplicates so concurrent seeds don't fail
  const { error } = await supabaseAdmin
    .from("police_stations" as never)
    .upsert(rows as never, { onConflict: "district_id,name", ignoreDuplicates: true });
  if (error) console.error("police_stations seed error", error.message);
  return rows;
}

async function loadPoliceStations(): Promise<PoliceCache> {
  if (_policeMemo) return _policeMemo;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let { data, error } = await supabaseAdmin
    .from("police_stations" as never)
    .select("district_id, district_name, name, is_dhaka_city")
    .order("name");
  if (error) console.error("police_stations read error", error.message);

  let rows = (data as PSRow[] | null) ?? [];
  if (rows.length === 0) {
    rows = await seedPoliceStationsFromApi();
  }

  const items = new Set<string>();
  const dhakaCity = new Set<string>();
  const grouped: Record<string, Set<string>> = {};
  for (const r of rows) {
    items.add(r.name);
    (grouped[r.district_name] ??= new Set()).add(r.name);
    if (r.is_dhaka_city) dhakaCity.add(r.name);
  }

  const value: PoliceCache = {
    items: Array.from(items).sort((a, b) => a.localeCompare(b)),
    dhakaCity: Array.from(dhakaCity).sort((a, b) => a.localeCompare(b)),
    grouped: Object.fromEntries(
      Object.entries(grouped).map(([k, v]) => [k, Array.from(v).sort((a, b) => a.localeCompare(b))]),
    ),
  };
  if (value.items.length > 0) _policeMemo = value;
  return value;
}
// Public (no-auth) variant for storefront checkout.
export const getPublicPoliceStations = createServerFn({ method: "GET" })
  .handler(
    async (): Promise<{
      items: string[];
      dhakaCity: string[];
      grouped: Record<string, string[]>;
    }> => {
      try {
        const { items, dhakaCity, grouped } = await loadPoliceStations();
        return { items, dhakaCity, grouped };
      } catch (e) {
        console.error("getPublicPoliceStations failed", e);
        return { items: [], dhakaCity: [], grouped: {} };
      }
    },
  );

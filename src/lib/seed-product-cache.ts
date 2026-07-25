import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getProductVariations } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";

/**
 * Shared "instant open" cache seeding used by every product card.
 *
 * Seeds the product detail query with data we already have in the list
 * payload, and warms variations for variable products. Centralised here so the
 * home grid, deals strip and PLP card cannot drift apart.
 */
export function useSeedProductCache() {
  const queryClient = useQueryClient();

  return (p: WooProduct) => {
    if (!p?.slug) return;
    queryClient.setQueryData(["product", p.slug], { product: p, error: null as string | null });
    if (p.type === "variable" && (p.variations?.length ?? 0) > 0) {
      void queryClient
        .prefetchQuery({
          queryKey: ["product-variations", p.id],
          queryFn: () => getProductVariations({ data: { productId: p.id } }),
          staleTime: 5 * 60 * 1000,
        })
        .catch(() => {});
    }
  };
}

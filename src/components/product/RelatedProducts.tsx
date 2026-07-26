import { useQuery } from "@tanstack/react-query";
import { listRelatedProducts } from "@/lib/woo.functions";
import { BigProductGrid } from "@/components/home/BigProductGrid";
import { FeedGridSkeleton } from "@/components/home/InfiniteFeed";

/**
 * Genuine related products: same-category items from WooCommerce, current
 * product excluded server-side. Rendered headless (no section title) directly
 * under the product detail blocks.
 */
export function RelatedProducts({
  productId,
  categoryIds,
}: {
  productId: number;
  categoryIds: number[];
}) {
  const enabled = categoryIds.length > 0;
  const { data, isPending } = useQuery({
    queryKey: ["related-products", productId, categoryIds.join(",")],
    queryFn: () =>
      listRelatedProducts({ data: { productId, categoryIds: categoryIds.slice(0, 5), perPage: 12 } }),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (!enabled) return null;
  if (isPending) return <FeedGridSkeleton columns={3} />;

  const products = data?.products ?? [];
  if (products.length === 0) return null;

  return <BigProductGrid products={products} columns={3} />;
}

export default RelatedProducts;

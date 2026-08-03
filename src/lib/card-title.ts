/**
 * Display title for a product card.
 *
 * A variable product's card shows the price/image of its default variation, so
 * the title has to name that variation too — otherwise two cards of the same
 * parent (or the card vs. the product page after selecting the same option)
 * read as the same product at different prices.
 *
 * Formatting matches the product page's selected-variation suffix: `Name — Option`.
 */
export function cardTitle(p: {
  name: string;
  type?: string;
  default_variation?: { label?: string } | null;
}): string {
  const label = p.type === "variable" ? p.default_variation?.label?.trim() : "";
  return label ? `${p.name} — ${label}` : p.name;
}

/**
 * Owner colors, indexed by draft slot so they stay stable across every page.
 * Validated for the dark surface (#09090b) with the dataviz palette checker:
 * lightness band, chroma, CVD separation, normal-vision floor, contrast — all pass.
 */
export const OWNER_BG = ["bg-sky-600", "bg-amber-600", "bg-violet-500", "bg-rose-600", "bg-teal-600", "bg-fuchsia-600"];
export const OWNER_TEXT = ["text-sky-400", "text-amber-400", "text-violet-400", "text-rose-400", "text-teal-400", "text-fuchsia-400"];
export const OWNER_BORDER = ["border-sky-600", "border-amber-600", "border-violet-500", "border-rose-600", "border-teal-600", "border-fuchsia-600"];
/** Hex values for inline SVG. */
export const OWNER_HEX = ["#0284c7", "#d97706", "#8b5cf6", "#e11d48", "#0d9488", "#c026d3"];
export const LEFTOVER_HEX = "#52525b";

export function ownerIndex(order: string[] | null, userId: string | null | undefined, members: { id: string }[]): number {
  if (!userId) return -1;
  const i = order?.indexOf(userId) ?? -1;
  if (i >= 0) return i;
  const j = members.findIndex((m) => m.id === userId);
  return j >= 0 ? j : 0;
}

import type { Couple } from "@/lib/types";

const ORD = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function placementLabel(p: number | null): string | null {
  if (p == null) return null;
  if (p === 1) return "Mirrorball 🏆";
  if (p === 2) return "Runner-up";
  return `${ORD(p)} place`;
}

/** Compact status pill for a couple. */
export function StatusChip({ couple }: { couple: Couple }) {
  const c = couple;
  if (c.status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153)]" />
        Dancing
      </span>
    );
  }
  if (c.status === "finalist") {
    return (
      <span className="rounded-full border border-gold-400/50 bg-gold-400/15 px-2 py-0.5 text-[11px] font-medium text-gold-200">
        {placementLabel(c.placement) ?? "Finalist"}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-silver-500/25 bg-plum-950/60 px-2 py-0.5 text-[11px] text-silver-500">
      {c.status === "withdrew" ? "Withdrew" : "Eliminated"}
      {c.elimination_week != null && ` · wk ${c.elimination_week}`}
      {c.placement != null && ` · ${ORD(c.placement)}`}
    </span>
  );
}

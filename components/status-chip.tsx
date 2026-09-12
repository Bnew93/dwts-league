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
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Active</span>;
  }
  if (c.status === "finalist") {
    return (
      <span className="rounded-full bg-mirror/20 px-2 py-0.5 text-xs text-mirror">
        {placementLabel(c.placement) ?? "Finalist"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-300">
      {c.status === "withdrew" ? "Withdrew" : "Out"}
      {c.elimination_week != null && ` · wk ${c.elimination_week}`}
      {c.placement != null && ` · ${ORD(c.placement)}`}
    </span>
  );
}

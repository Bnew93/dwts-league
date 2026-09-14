import type { LeagueStatus } from "@/lib/league";

const LABEL: Record<LeagueStatus, string> = { setup: "Setting up", drafting: "Drafting", active: "In season", complete: "Season over" };
const CLS: Record<LeagueStatus, string> = {
  setup: "border-silver-500/30 text-silver-300",
  drafting: "border-gold-400/50 bg-gold-400/10 text-gold-200",
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  complete: "border-silver-500/25 text-silver-500",
};

export function LeagueStatusChip({ status }: { status: LeagueStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CLS[status]}`}>{LABEL[status]}</span>;
}

export const leagueStatusLabel = (s: LeagueStatus) => LABEL[s];

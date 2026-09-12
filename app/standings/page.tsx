import Link from "next/link";
import { ChevronDown, Crown } from "lucide-react";
import { getCtx } from "@/lib/league";
import { Shell, PageTitle } from "@/components/shell";
import { CoupleCard } from "@/components/couple-card";
import { CoupleAvatar } from "@/components/couple-avatar";
import { loadSeason, currentOwners, weekInfo, scoreTotals } from "@/lib/queries";
import { OWNER_BG, ownerIndex } from "@/lib/colors";
import type { Couple } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const ctx = await getCtx();
  const { league, members } = ctx;
  const { couples, events, episodes, standings, scores } = await loadSeason(league.id, league.season);
  const owners = currentOwners(events);
  const totals = scoreTotals(scores);
  const { current, aired } = weekInfo(episodes);
  const champion = couples.find((c) => c.placement === 1);
  const championOwner = champion ? owners.get(champion.id) ?? events.find((e) => e.couple_id === champion.id)?.user_id : null;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";
  const colorOf = (id: string) => OWNER_BG[ownerIndex(league.draft_order, id, members) % OWNER_BG.length];

  const rosterOf = (userId: string) => {
    const ids = new Set<string>();
    for (const e of events) if (e.user_id === userId && (e.event === "drafted" || e.event === "replacement")) ids.add(e.couple_id);
    const list = couples.filter((c) => ids.has(c.id));
    const active = list.filter((c) => owners.get(c.id) === userId && c.status !== "eliminated" && c.status !== "withdrew");
    const out = list.filter((c) => !active.includes(c));
    return { active, out };
  };
  const bestRemaining = (active: Couple[]) =>
    [...active].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.cast_order - b.cast_order)[0];

  return (
    <Shell ctx={ctx}>
      <PageTitle eyebrow={`Season ${league.season}`} title="Standings" meta={aired.size ? `Through week ${Math.max(...aired)}` : "Pre-season"} />

      {champion && championOwner && (
        <div className="glass fade-up relative mt-5 overflow-hidden p-6 text-center" style={{ animationDelay: "80ms" }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(233_194_80/0.28),transparent_70%)]" />
          <Crown className="mx-auto text-gold-300 drop-shadow-[0_0_18px_rgb(233_194_80/0.8)]" size={40} />
          <div className="eyebrow mt-2">Grand Champion</div>
          <div className="display mt-1 text-3xl font-semibold">
            <span className="gold-text">{nameOf(championOwner)}</span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <CoupleAvatar couple={champion} size="md" />
            <div className="text-left text-sm text-silver-300">
              <div className="font-medium text-silver-100">{champion.celebrity}</div>
              <div>&amp; {champion.professional} · Mirrorball</div>
            </div>
          </div>
        </div>
      )}

      {league.draft_status !== "complete" ? (
        <div className="glass fade-up mt-6 p-8 text-center text-silver-300" style={{ animationDelay: "120ms" }}>
          <div className="text-4xl">🪩</div>
          <p className="mt-3">Standings light up once the draft is complete.</p>
          <Link href="/draft" className="btn-gold mt-5">
            Go to the draft room
          </Link>
        </div>
      ) : (
        <ol className="stagger mt-5 space-y-2.5">
          {standings.map((row) => {
            const { active, out } = rosterOf(row.user_id);
            const best = bestRemaining(active);
            const isMe = row.user_id === ctx.user.id;
            const podium = row.podium_rank <= 3;
            return (
              <li key={row.user_id}>
                <details className={`glass glass-hover group ${isMe ? "border-gold-400/40" : ""}`}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
                    <div
                      className={`display flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${
                        podium
                          ? "bg-gradient-to-b from-gold-300 to-gold-600 text-plum-950 shadow-[0_0_18px_-4px_rgb(233_194_80/0.9)]"
                          : "border hairline bg-plum-950/60 text-silver-300"
                      }`}
                    >
                      {row.podium_rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold text-silver-100">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorOf(row.user_id)}`} />
                        <span className="truncate">{row.display_name}</span>
                        {isMe && <span className="rounded-full bg-gold-400/15 px-1.5 text-[10px] text-gold-300">you</span>}
                        {row.is_grand_champion && <Crown size={14} className="text-gold-300" />}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-silver-500">
                        <span className="flex -space-x-2">
                          {active.slice(0, 4).map((c) => (
                            <CoupleAvatar key={c.id} couple={c} size="sm" className="ring-plum-950" />
                          ))}
                        </span>
                        <span>
                          {row.active_couples} dancing{best && <> · best: {best.celebrity}</>}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="display text-2xl font-semibold tabular-nums text-silver-100">{row.survival_points}</div>
                      <div className="eyebrow text-[9px]">pts</div>
                    </div>
                    <ChevronDown size={18} className="chev text-silver-500" />
                  </summary>
                  <div className="border-t hairline px-3 pb-3 pt-3">
                    <ul className="space-y-2">
                      {[...active, ...out].map((c) => (
                        <li key={c.id}>
                          <CoupleCard couple={c} compact />
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-8 text-center text-xs text-silver-500">
        1 point per week a couple survives on your roster. Tiebreaks: couples still dancing, best placement, earlier draft slot.
        Week {current} is next.
      </p>
    </Shell>
  );
}

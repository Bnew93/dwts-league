import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, Crown } from "lucide-react";
import { getCtx } from "@/lib/league";
import { Shell, PageTitle } from "@/components/shell";
import { CoupleRow, CoupleFace, CoupleTicket } from "@/components/couple";
import { loadSeason, currentOwners, weekInfo, scoreTotals } from "@/lib/queries";
import { OWNER_BG, ownerIndex } from "@/lib/colors";
import type { Couple } from "@/lib/types";

export const dynamic = "force-dynamic";

/** League home: standings once the draft is in; the draft room before that. */
export default async function StandingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string; joined?: string }> }) {
  const { slug } = await params;
  const { welcome, joined } = await searchParams;
  const ctx = await getCtx(slug);
  const { league, members } = ctx;
  if (league.status === "setup" || league.status === "drafting") redirect(`/l/${slug}/draft`);
  const { couples, events, episodes, standings, scores } = await loadSeason(league);
  const owners = currentOwners(events);
  const totals = scoreTotals(scores);
  const { current, aired } = weekInfo(episodes);
  const champion = couples.find((c) => c.placement === 1);
  const championOwner = champion ? owners.get(champion.id) ?? events.find((e) => e.couple_id === champion.id)?.user_id : null;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";
  const slot = (id: string) => ownerIndex(league.draft_order, id, members);

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
      {(welcome || joined) && (
        <div className="welcome mb-4 flex items-center gap-3 rounded-xl border border-gold-400/40 bg-gold-400/10 px-4 py-2.5 text-sm text-gold-100">
          <span className="text-lg">🪩</span>
          <span>{welcome ? "The draft is in the books. Rosters lock in here; first show is Tuesday at 8/7c." : `Welcome to ${league.name}. You're in.`}</span>
        </div>
      )}
      <PageTitle eyebrow={`Season ${league.season}`} title="Standings" meta={aired.size ? `Through week ${Math.max(...aired)}` : "Pre-season"} />

      {champion && championOwner && (
        <div className="fade-up mt-5" style={{ animationDelay: "80ms" }}>
          <div className="mb-2 flex items-center gap-2">
            <Crown className="text-gold-300 drop-shadow-[0_0_14px_rgb(233_194_80/.8)]" size={22} />
            <span className="eyebrow">Grand Champion</span>
            <span className="display text-xl font-semibold">
              <span className="gold-text">{nameOf(championOwner)}</span>
            </span>
          </div>
          <CoupleTicket couple={champion} eyebrow="Mirrorball winner" className="border-gold-400/50 shadow-glow-sm" />
        </div>
      )}

      <ol className="stagger mt-5 space-y-2.5">
        {standings.map((row) => {
          const { active, out } = rosterOf(row.user_id);
          const best = bestRemaining(active);
          const isMe = row.user_id === ctx.user.id;
          const podium = row.podium_rank <= 3;
          const s = slot(row.user_id);
          return (
            <li key={row.user_id}>
              <details className={`glass glass-hover group ${isMe ? "border-gold-400/40" : ""}`}>
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
                  <div
                    className={`display flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${
                      podium ? "bg-gradient-to-b from-gold-300 to-gold-600 text-plum-950 shadow-[0_0_18px_-4px_rgb(233_194_80/.9)]" : "border hairline bg-plum-950/60 text-silver-300"
                    }`}
                  >
                    {row.podium_rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold text-silver-100">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${OWNER_BG[s % OWNER_BG.length]}`} />
                      <span className="truncate">{row.display_name}</span>
                      {isMe && <span className="rounded-full bg-gold-400/15 px-1.5 text-[10px] text-gold-300">you</span>}
                      {row.is_grand_champion && <Crown size={14} className="text-gold-300" />}
                    </div>
                    <div className="mt-1 flex items-center gap-2 truncate text-xs text-silver-500">
                      <span className="flex -space-x-2">
                        {active.slice(0, 4).map((c) => (
                          <CoupleFace key={c.id} couple={c} size={26} />
                        ))}
                      </span>
                      <span className="truncate">
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
                        <CoupleRow couple={c} owner={s} slug={slug} note={null} />
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
        {standings.length === 0 && (
          <li className="glass p-6 text-center text-sm text-silver-500">
            No one is drafting a team here yet.{" "}
            <Link href={`/l/${slug}/bracket`} className="text-gold-300 underline decoration-gold-400/50">
              See the bracket
            </Link>
          </li>
        )}
      </ol>

      <p className="mt-8 text-center text-xs text-silver-500">
        1 point per week a couple survives on your roster. Tiebreaks: couples still dancing, best placement, earlier draft slot. Week {current} is next.
      </p>
    </Shell>
  );
}

import Link from "next/link";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { StatusChip } from "@/components/status-chip";
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

  // couples ever on each user's roster (current + eliminated while owned)
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
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Standings</h1>
        <span className="text-sm text-zinc-400">
          Season {league.season} · {aired.size ? `through week ${Math.max(...aired)}` : "pre-season"}
        </span>
      </div>

      {champion && championOwner && (
        <div className="mt-4 rounded-xl border border-mirror/50 bg-gradient-to-br from-mirror/25 to-zinc-900 p-5 text-center">
          <div className="text-4xl">🏆</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-mirror">Grand Champion</div>
          <div className="mt-1 text-2xl font-bold">{nameOf(championOwner)}</div>
          <div className="text-sm text-zinc-300">
            {champion.celebrity} &amp; {champion.professional} won the Mirrorball
          </div>
        </div>
      )}

      {league.draft_status !== "complete" ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-400">
          Standings appear once the draft is complete.
          <div className="mt-3">
            <Link href="/draft" className="text-mirror underline">
              Go to the draft room
            </Link>
          </div>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {standings.map((row) => {
            const { active, out } = rosterOf(row.user_id);
            const best = bestRemaining(active);
            const isMe = row.user_id === ctx.user.id;
            return (
              <li key={row.user_id}>
                <details className={`group rounded-xl border bg-zinc-900/60 ${isMe ? "border-zinc-600" : "border-zinc-800"}`}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${
                        row.podium_rank <= 3 ? "bg-mirror text-zinc-900" : "bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {row.podium_rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorOf(row.user_id)}`} />
                        <span className="truncate">{row.display_name}</span>
                        {row.is_grand_champion && <span title="Grand Champion">🏆</span>}
                      </div>
                      <div className="truncate text-xs text-zinc-400">
                        {row.active_couples} active
                        {best && <> · best: {best.celebrity}</>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold tabular-nums">{row.survival_points}</div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">pts</div>
                    </div>
                  </summary>
                  <div className="border-t border-zinc-800 px-3 py-3">
                    <ul className="space-y-1.5">
                      {[...active, ...out].map((c) => {
                        const isOut = out.includes(c);
                        return (
                          <li key={c.id} className={`flex items-center justify-between gap-2 text-sm ${isOut ? "text-zinc-500" : ""}`}>
                            <Link href={`/couples/${c.id}`} className="min-w-0 truncate hover:underline">
                              {c.celebrity} <span className="text-zinc-500">&amp; {c.professional}</span>
                            </Link>
                            <StatusChip couple={c} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-6 text-center text-xs text-zinc-500">
        Survival points: 1 per week a couple survives on your roster. Tiebreaks: active couples, best
        placement, earlier draft slot. Week {current} is next.
      </p>
    </Shell>
  );
}

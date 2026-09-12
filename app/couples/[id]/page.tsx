import Link from "next/link";
import { notFound } from "next/navigation";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { StatusChip, placementLabel } from "@/components/status-chip";
import { loadSeason, ownershipHistory, weekInfo } from "@/lib/queries";
import { OWNER_BG, ownerIndex } from "@/lib/colors";
import { ScoreChart } from "@/components/score-chart";

export const dynamic = "force-dynamic";

export default async function CouplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const { league, members } = ctx;
  const { couples, events, episodes, scores } = await loadSeason(league.id, league.season);
  const couple = couples.find((c) => c.id === id);
  if (!couple) notFound();

  const { weeks, aired } = weekInfo(episodes);
  const history = ownershipHistory(events, couple.id);
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.display_name ?? "—";
  const colorOf = (uid: string) => OWNER_BG[ownerIndex(league.draft_order, uid, members) % OWNER_BG.length];
  const myScores = scores
    .filter((s) => s.couple_id === couple.id && s.total != null)
    .map((s) => ({ week: s.week, total: Number(s.total) }))
    .sort((a, b) => a.week - b.week);
  const lastAired = aired.size ? Math.max(...aired) : 0;
  const chartWeeks = weeks.filter((w) => w <= Math.max(lastAired, couple.elimination_week ?? 0, myScores.at(-1)?.week ?? 0));

  return (
    <Shell ctx={ctx}>
      <Link href="/bracket" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Bracket
      </Link>
      <div className="mt-2 flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-2xl">{couple.celebrity.slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{couple.celebrity}</h1>
          <div className="text-zinc-300">with {couple.professional}</div>
          <div className="text-sm text-zinc-500">{couple.notability}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip couple={couple} />
            <span className="text-xs text-zinc-500">cast #{couple.cast_order}</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Season</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">Status</dt>
            <dd className="capitalize">{couple.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Eliminated</dt>
            <dd>{couple.elimination_week != null ? `Week ${couple.elimination_week}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Placement</dt>
            <dd>{placementLabel(couple.placement) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Judges&apos; total</dt>
            <dd>{myScores.length ? myScores.reduce((a, s) => a + s.total, 0) : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Scores */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Weekly judges&apos; scores</h2>
        {myScores.length ? (
          <ScoreChart weeks={chartWeeks.length ? chartWeeks : weeks} scores={myScores} />
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No scores yet. They appear after each Tuesday&apos;s show.</p>
        )}
      </section>

      {/* Owner history */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Ownership</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            {league.draft_status === "complete" ? "Undrafted · Leftovers pool" : "Not drafted yet"}
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorOf(h.user_id)}`} />
                <span className="font-medium">{nameOf(h.user_id)}</span>
                <span className="text-zinc-500">
                  {h.source === "draft" ? "drafted" : "replacement pick"} · from week {h.joined_week}
                  {h.left_week != null && ` to week ${h.left_week} (${h.left_event})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

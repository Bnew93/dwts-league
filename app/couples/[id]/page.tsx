import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCtx } from "@/lib/league";
import { Shell, SectionTitle } from "@/components/shell";
import { StatusChip, placementLabel } from "@/components/status-chip";
import { CoupleAvatar } from "@/components/couple-avatar";
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
  const out = couple.status === "eliminated" || couple.status === "withdrew";

  return (
    <Shell ctx={ctx}>
      <Link href="/bracket" className="inline-flex items-center gap-1 text-xs text-silver-500 transition-colors hover:text-gold-300">
        <ArrowLeft size={14} /> Bracket
      </Link>

      <div className="glass fade-up relative mt-3 overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_20%_0%,rgb(233_194_80/0.22),transparent_70%)]" />
        <div className="relative flex items-start gap-4">
          <CoupleAvatar couple={couple} size="xl" dim={out} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Cast #{couple.cast_order}</div>
            <h1 className="display mt-0.5 text-3xl font-semibold leading-tight text-silver-100">{couple.celebrity}</h1>
            <div className="text-silver-300">with {couple.professional}</div>
            <div className="mt-1 text-sm text-silver-500">{couple.notability}</div>
            <div className="mt-3">
              <StatusChip couple={couple} />
            </div>
          </div>
        </div>
      </div>

      <section className="glass fade-up mt-4 p-4" style={{ animationDelay: "60ms" }}>
        <SectionTitle>Season</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-silver-500">Status</dt>
            <dd className="capitalize text-silver-100">{couple.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-silver-500">Eliminated</dt>
            <dd className="text-silver-100">{couple.elimination_week != null ? `Week ${couple.elimination_week}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-silver-500">Placement</dt>
            <dd className="text-silver-100">{placementLabel(couple.placement) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-silver-500">Judges&apos; total</dt>
            <dd className="text-silver-100">{myScores.length ? myScores.reduce((a, s) => a + s.total, 0) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="glass fade-up mt-4 p-4" style={{ animationDelay: "120ms" }}>
        <SectionTitle>Weekly judges&apos; scores</SectionTitle>
        {myScores.length ? (
          <ScoreChart weeks={chartWeeks.length ? chartWeeks : weeks} scores={myScores} />
        ) : (
          <p className="text-sm text-silver-500">No scores yet. They appear after each Tuesday&apos;s show.</p>
        )}
      </section>

      <section className="glass fade-up mt-4 p-4" style={{ animationDelay: "180ms" }}>
        <SectionTitle>Ownership</SectionTitle>
        {history.length === 0 ? (
          <p className="text-sm text-silver-500">{league.draft_status === "complete" ? "Undrafted · Leftovers pool" : "Not drafted yet"}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorOf(h.user_id)}`} />
                <span className="font-medium text-silver-100">{nameOf(h.user_id)}</span>
                <span className="text-silver-500">
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

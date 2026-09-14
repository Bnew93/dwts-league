import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCtx } from "@/lib/league";
import { Shell, SectionTitle } from "@/components/shell";
import { StatusChip, placementLabel } from "@/components/status-chip";
import { CoupleTicket } from "@/components/couple";
import { loadSeason, ownershipHistory, weekInfo, currentOwners } from "@/lib/queries";
import { OWNER_BG, ownerIndex } from "@/lib/colors";
import { ScoreChart } from "@/components/score-chart";

export const dynamic = "force-dynamic";

export default async function CouplePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getCtx(slug);
  const { league, members } = ctx;
  const { couples, events, episodes, scores } = await loadSeason(league);
  const couple = couples.find((c) => c.id === id);
  if (!couple) notFound();
  const drafted = league.status === "active" || league.status === "complete";

  const { weeks, aired } = weekInfo(episodes);
  const history = ownershipHistory(events, couple.id);
  const owner = currentOwners(events).get(couple.id);
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.display_name ?? "—";
  const colorOf = (uid: string) => OWNER_BG[ownerIndex(league.draft_order, uid, members) % OWNER_BG.length];
  const myScores = scores
    .filter((s) => s.couple_id === couple.id && s.total != null)
    .map((s) => ({ week: s.week, total: Number(s.total) }))
    .sort((a, b) => a.week - b.week);
  const lastAired = aired.size ? Math.max(...aired) : 0;
  const chartWeeks = weeks.filter((w) => w <= Math.max(lastAired, couple.elimination_week ?? 0, myScores.at(-1)?.week ?? 0));
  const leftLabel = (e: string | null) => (e === "departed" ? "owner left the league" : e);

  return (
    <Shell ctx={ctx}>
      <Link href={`/l/${slug}/bracket`} className="inline-flex items-center gap-1 text-xs text-silver-500 transition-colors hover:text-gold-300">
        <ArrowLeft size={14} /> Bracket
      </Link>

      <div className="fade-up mt-3">
        <CoupleTicket
          couple={couple}
          eyebrow={
            <>
              Cast #{couple.cast_order}
              {owner && (
                <>
                  {" · "}
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${colorOf(owner)}`} />
                  {nameOf(owner)}
                </>
              )}
            </>
          }
          foot={
            <>
              <StatusChip couple={couple} />
              {myScores.length > 0 && <span className="text-xs text-silver-500 tabular-nums">{myScores.reduce((a, s) => a + s.total, 0)} judges&apos; pts</span>}
            </>
          }
        />
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
        <SectionTitle>Ownership in {league.name}</SectionTitle>
        {history.length === 0 ? (
          <p className="text-sm text-silver-500">{drafted ? "Undrafted · Leftovers pool" : "Not drafted yet"}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorOf(h.user_id)}`} />
                <span className="font-medium text-silver-100">{nameOf(h.user_id)}</span>
                <span className="text-silver-500">
                  {h.source === "draft" ? "drafted" : "replacement pick"} · from week {h.joined_week}
                  {h.left_week != null && ` to week ${h.left_week} (${leftLabel(h.left_event)})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

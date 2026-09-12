import Link from "next/link";
import { Clock } from "lucide-react";
import { getCtx } from "@/lib/league";
import { Shell, PageTitle, SectionTitle } from "@/components/shell";
import { CoupleRow } from "@/components/couple";
import { StatusChip } from "@/components/status-chip";
import { loadSeason, currentOwners, weekInfo, scoreTotals } from "@/lib/queries";
import { ownerIndex } from "@/lib/colors";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await getCtx();
  const { league, members } = ctx;
  const me = ctx.user.id;
  const { couples, events, episodes, claims, standings, scores } = await loadSeason(league.id, league.season);
  const owners = currentOwners(events);
  const totals = scoreTotals(scores);
  const { current } = weekInfo(episodes);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";
  const mySlot = ownerIndex(league.draft_order, me, members);

  const everMine = new Set(events.filter((e) => e.user_id === me && (e.event === "drafted" || e.event === "replacement")).map((e) => e.couple_id));
  const mine = couples.filter((c) => everMine.has(c.id));
  const active = mine.filter((c) => owners.get(c.id) === me && (c.status === "active" || c.status === "finalist"));
  const out = mine.filter((c) => !active.includes(c));
  const myRow = standings.find((s) => s.user_id === me);

  const pendingClaims = claims.filter((c) => c.status === "pending");
  const head = pendingClaims[0];
  const myClaims = claims.filter((c) => c.user_id === me && c.status !== "fulfilled");
  const leftovers = couples.filter((c) => c.status === "active" && !owners.has(c.id));

  if (!ctx.isPlayer) {
    return (
      <Shell ctx={ctx}>
        <PageTitle eyebrow={ctx.profile.display_name} title="My Team" />
        <div className="glass fade-up mt-5 p-6 text-center text-silver-300">
          You run the league but aren&apos;t drafting a team this season.{" "}
          <Link href="/standings" className="text-gold-300 underline decoration-gold-400/50">
            See the standings
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx}>
      <PageTitle
        eyebrow={ctx.profile.display_name}
        title="My Team"
        meta={
          myRow && (
            <span>
              <span className="display text-2xl text-silver-100">#{myRow.podium_rank}</span> · {myRow.survival_points} pts
            </span>
          )
        }
      />

      {league.draft_status !== "complete" && (
        <div className="glass fade-up mt-5 p-5 text-center text-sm text-silver-300">
          Your team fills in as the draft happens.{" "}
          <Link href="/draft" className="text-gold-300 underline decoration-gold-400/50">
            Draft room
          </Link>
        </div>
      )}

      {myClaims.map((claim) => {
        const lost = couples.find((c) => c.id === claim.lost_couple_id);
        const isHead = head?.id === claim.id;
        return (
          <div key={claim.id} className="glass fade-up mt-5 border-gold-400/40 p-4">
            <div className="eyebrow flex items-center gap-1.5">
              <Clock size={12} /> Replacement pick
            </div>
            <div className="mt-1.5 text-sm text-silver-100">
              You lost {lost?.celebrity} &amp; {lost?.professional}
              {lost?.elimination_week != null && ` in week ${lost.elimination_week}`}.
            </div>
            {claim.status === "void" && <p className="mt-2 text-sm text-silver-500">No leftovers remain, so this slot stays empty.</p>}
            {claim.status === "expired" && (
              <p className="mt-2 text-sm text-silver-500">Deadline passed. Auto-picked {couples.find((c) => c.id === claim.picked_couple_id)?.celebrity}.</p>
            )}
            {claim.status === "pending" && !isHead && head && <p className="mt-2 text-sm text-silver-500">Waiting on {nameOf(head.user_id)} to pick first.</p>}
            {claim.status === "pending" && isHead && (
              <div className="mt-2 text-sm">
                <p className="text-silver-300">
                  Pick from {leftovers.length} leftover{leftovers.length === 1 ? "" : "s"}
                  {claim.deadline && (
                    <> by {new Date(claim.deadline).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })} ET</>
                  )}
                  .
                </p>
                <p className="mt-1 text-xs text-silver-500">The pick button arrives in Phase 4.</p>
              </div>
            )}
          </div>
        );
      })}

      <section className="mt-6">
        <SectionTitle right={`${active.length} of ${league.roster_size}`}>Still dancing</SectionTitle>
        <ul className="stagger space-y-2">
          {active.map((c) => (
            <li key={c.id}>
              <CoupleRow
                couple={c}
                owner={mySlot}
                right={
                  <>
                    <StatusChip couple={c} />
                    {(totals.get(c.id) ?? 0) > 0 && <span>{totals.get(c.id)} judges&apos; pts</span>}
                  </>
                }
              />
            </li>
          ))}
          {active.length === 0 && league.draft_status === "complete" && (
            <li className="rounded-2xl border border-dashed hairline p-6 text-center text-sm text-silver-500">No couples left dancing.</li>
          )}
        </ul>
      </section>

      {out.length > 0 && (
        <section className="mt-7">
          <SectionTitle right={`${out.length}`}>Eliminated</SectionTitle>
          <ul className="stagger space-y-2">
            {out.map((c) => (
              <li key={c.id}>
                <CoupleRow couple={c} owner={mySlot} note={null} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-silver-500">Next show: week {current}.</p>
    </Shell>
  );
}

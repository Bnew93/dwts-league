import Link from "next/link";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { StatusChip } from "@/components/status-chip";
import { loadSeason, currentOwners, weekInfo, scoreTotals } from "@/lib/queries";

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

  const everMine = new Set(events.filter((e) => e.user_id === me && (e.event === "drafted" || e.event === "replacement")).map((e) => e.couple_id));
  const mine = couples.filter((c) => everMine.has(c.id));
  const active = mine.filter((c) => owners.get(c.id) === me && (c.status === "active" || c.status === "finalist"));
  const out = mine.filter((c) => !active.includes(c));
  const myRow = standings.find((s) => s.user_id === me);

  const pendingClaims = claims.filter((c) => c.status === "pending");
  const head = pendingClaims[0];
  const myClaims = claims.filter((c) => c.user_id === me && c.status !== "fulfilled");
  const leftovers = couples.filter((c) => c.status === "active" && !owners.has(c.id));

  return (
    <Shell ctx={ctx}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">My Team</h1>
        {myRow && (
          <span className="text-sm text-zinc-400">
            #{myRow.podium_rank} · {myRow.survival_points} pts
          </span>
        )}
      </div>

      {league.draft_status !== "complete" && (
        <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Your team fills in as the draft happens.{" "}
          <Link href="/draft" className="text-mirror underline">
            Draft room
          </Link>
        </p>
      )}

      {/* Replacement claim card (fulfilment wired in Phase 4) */}
      {myClaims.map((claim) => {
        const lost = couples.find((c) => c.id === claim.lost_couple_id);
        const isHead = head?.id === claim.id;
        return (
          <div key={claim.id} className="mt-4 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-amber-300">Replacement pick</div>
            <div className="mt-1 text-sm text-zinc-200">
              You lost {lost?.celebrity} &amp; {lost?.professional}
              {lost?.elimination_week != null && ` in week ${lost.elimination_week}`}.
            </div>
            {claim.status === "void" && <p className="mt-2 text-sm text-zinc-400">No leftovers remain, so this slot stays empty.</p>}
            {claim.status === "expired" && (
              <p className="mt-2 text-sm text-zinc-400">
                Deadline passed. Auto-picked {couples.find((c) => c.id === claim.picked_couple_id)?.celebrity}.
              </p>
            )}
            {claim.status === "pending" && !isHead && head && (
              <p className="mt-2 text-sm text-zinc-400">Waiting on {nameOf(head.user_id)} to pick first.</p>
            )}
            {claim.status === "pending" && isHead && (
              <div className="mt-2 text-sm">
                <p className="text-zinc-300">
                  Pick from {leftovers.length} leftover{leftovers.length === 1 ? "" : "s"}
                  {claim.deadline && <> by {new Date(claim.deadline).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })} ET</>}.
                </p>
                <p className="mt-1 text-xs text-zinc-500">The pick button arrives in Phase 4.</p>
              </div>
            )}
          </div>
        );
      })}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Active · {active.length}</h2>
        <ul className="mt-2 space-y-2">
          {active.map((c) => (
            <li key={c.id}>
              <Link href={`/couples/${c.id}`} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 hover:border-zinc-600">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-lg">{c.celebrity.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.celebrity}</div>
                  <div className="truncate text-xs text-zinc-400">with {c.professional}</div>
                </div>
                <div className="text-right">
                  <StatusChip couple={c} />
                  {totals.get(c.id) != null && totals.get(c.id)! > 0 && (
                    <div className="mt-1 text-xs text-zinc-500">{totals.get(c.id)} judges&apos; pts</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {active.length === 0 && league.draft_status === "complete" && (
            <li className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-sm text-zinc-500">No active couples left.</li>
          )}
        </ul>
      </section>

      {out.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Eliminated · {out.length}</h2>
          <ul className="mt-2 space-y-2">
            {out.map((c) => (
              <li key={c.id}>
                <Link href={`/couples/${c.id}`} className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-3 text-zinc-400 hover:border-zinc-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800/60 text-lg opacity-60">{c.celebrity.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium line-through decoration-zinc-600">{c.celebrity}</div>
                    <div className="truncate text-xs">with {c.professional}</div>
                  </div>
                  <StatusChip couple={c} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-center text-xs text-zinc-500">Next: week {current}.</p>
    </Shell>
  );
}

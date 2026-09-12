import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { StatusChip } from "@/components/status-chip";
import { loadSeason, currentOwners, weekInfo } from "@/lib/queries";
import { markOut, setPlacement, undoResult } from "./actions";

export const dynamic = "force-dynamic";

const sel = "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm";
const btn = "rounded-md bg-mirror px-3 py-1.5 text-sm font-medium text-zinc-900";

export default async function AdminResultsPage() {
  const ctx = await getCtx();
  if (!ctx.isCommissioner) redirect("/standings");
  const { league, members } = ctx;
  const { couples, events, episodes, claims } = await loadSeason(league.id, league.season);
  const owners = currentOwners(events);
  const { weeks, aired, current } = weekInfo(episodes);
  const defaultWeek = aired.size ? Math.max(...aired) : current;
  const finaleWeek = weeks[weeks.length - 1];
  const nameOf = (id?: string) => (id ? members.find((m) => m.id === id)?.display_name ?? "—" : "Leftovers");

  const alive = couples.filter((c) => c.status === "active" || c.status === "finalist");
  const out = couples.filter((c) => c.status === "eliminated" || c.status === "withdrew");

  return (
    <Shell ctx={ctx}>
      <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Admin
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Results override</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Manual results. Every action goes through <code className="text-xs">fn_apply_results</code>, the same path
        as automated ingestion, so rosters and replacement claims update identically.
      </p>

      {league.draft_status !== "complete" && (
        <p className="mt-4 rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          The draft isn&apos;t complete. Eliminations now would affect no rosters.
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Remaining · {alive.length}
        </h2>
        <ul className="mt-2 space-y-2">
          {alive.map((c) => (
            <li key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {c.celebrity} <span className="text-zinc-500">&amp; {c.professional}</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    owner: {nameOf(owners.get(c.id))}
                    {c.placement != null && ` · placed ${c.placement}`}
                  </div>
                </div>
                <StatusChip couple={c} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <form action={markOut} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="couple_id" value={c.id} />
                  <select name="status" className={sel} defaultValue="eliminated">
                    <option value="eliminated">Eliminated</option>
                    <option value="withdrew">Withdrew</option>
                  </select>
                  <select name="week" className={sel} defaultValue={defaultWeek}>
                    {weeks.map((w) => (
                      <option key={w} value={w}>
                        wk {w}
                      </option>
                    ))}
                  </select>
                  <input name="placement" type="number" min={1} placeholder="place" className={`${sel} w-20`} />
                  <button className={btn}>Apply</button>
                </form>
                <form action={setPlacement} className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <input type="hidden" name="couple_id" value={c.id} />
                  <input type="hidden" name="week" value={finaleWeek} />
                  <span className="text-xs text-zinc-500">Finale:</span>
                  <input name="placement" type="number" min={1} required placeholder="1 = 🏆" className={`${sel} w-24`} />
                  <button className="rounded-md border border-mirror/60 px-3 py-1.5 text-sm text-mirror">Place</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {out.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Out · {out.length}</h2>
          <ul className="mt-2 space-y-2">
            {out.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3">
                <div className="min-w-0">
                  <div className="truncate text-zinc-300">
                    {c.celebrity} <span className="text-zinc-600">&amp; {c.professional}</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    was owned by {nameOf(events.filter((e) => e.couple_id === c.id && (e.event === "eliminated" || e.event === "withdrew")).at(-1)?.user_id)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip couple={c} />
                  <form action={undoResult}>
                    <input type="hidden" name="couple_id" value={c.id} />
                    <button className="rounded-md border border-red-800 px-2 py-1 text-xs text-red-300">Undo</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {claims.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Replacement claims</h2>
          <ul className="mt-2 divide-y divide-zinc-800 text-sm">
            {claims.map((cl) => (
              <li key={cl.id} className="flex items-center justify-between py-2">
                <span>
                  #{cl.queue_pos} {nameOf(cl.user_id)} lost {couples.find((c) => c.id === cl.lost_couple_id)?.celebrity}
                </span>
                <span className="text-xs text-zinc-400">
                  {cl.status}
                  {cl.picked_couple_id && ` → ${couples.find((c) => c.id === cl.picked_couple_id)?.celebrity}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

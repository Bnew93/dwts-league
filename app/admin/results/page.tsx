import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCtx } from "@/lib/league";
import { Shell, PageTitle, SectionTitle } from "@/components/shell";
import { StatusChip } from "@/components/status-chip";
import { CoupleAvatar } from "@/components/couple-avatar";
import { loadSeason, currentOwners, weekInfo } from "@/lib/queries";
import { markOut, setPlacement, undoResult } from "./actions";

export const dynamic = "force-dynamic";

const sel = "input-dark w-auto px-2 py-1.5 text-sm";

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
      <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-silver-500 transition-colors hover:text-gold-300">
        <ArrowLeft size={14} /> Admin
      </Link>
      <PageTitle eyebrow="Commissioner" title="Results override">
        <p className="mt-1 max-w-prose text-sm text-silver-500">
          Every action goes through the same database function as automated ingestion, so rosters and replacement claims update identically.
        </p>
      </PageTitle>

      {league.draft_status !== "complete" && (
        <p className="mt-4 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm text-gold-200">
          The draft isn&apos;t complete. Eliminations now would affect no rosters.
        </p>
      )}

      <section className="mt-6">
        <SectionTitle right={`${alive.length}`}>Remaining</SectionTitle>
        <ul className="stagger space-y-2">
          {alive.map((c) => (
            <li key={c.id} className="glass p-3">
              <div className="flex items-center gap-3">
                <CoupleAvatar couple={c} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-silver-100">
                    {c.celebrity} <span className="font-normal text-silver-500">&amp; {c.professional}</span>
                  </div>
                  <div className="text-xs text-silver-500">
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
                  <button className="btn-gold px-3 py-1.5 text-sm">Apply</button>
                </form>
                <form action={setPlacement} className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <input type="hidden" name="couple_id" value={c.id} />
                  <input type="hidden" name="week" value={finaleWeek} />
                  <span className="text-xs text-silver-500">Finale:</span>
                  <input name="placement" type="number" min={1} required placeholder="1 = 🏆" className={`${sel} w-24`} />
                  <button className="btn-ghost border-gold-400/50 px-3 py-1.5 text-sm text-gold-200">Place</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {out.length > 0 && (
        <section className="mt-7">
          <SectionTitle right={`${out.length}`}>Out</SectionTitle>
          <ul className="stagger space-y-2">
            {out.map((c) => (
              <li key={c.id} className="glass flex items-center gap-3 p-3 opacity-90">
                <CoupleAvatar couple={c} size="sm" dim />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-silver-300">
                    {c.celebrity} <span className="text-silver-500">&amp; {c.professional}</span>
                  </div>
                  <div className="text-xs text-silver-500">
                    was owned by {nameOf(events.filter((e) => e.couple_id === c.id && (e.event === "eliminated" || e.event === "withdrew")).at(-1)?.user_id)}
                  </div>
                </div>
                <StatusChip couple={c} />
                <form action={undoResult}>
                  <input type="hidden" name="couple_id" value={c.id} />
                  <button className="btn-danger px-2.5 py-1 text-xs">Undo</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {claims.length > 0 && (
        <section className="glass mt-7 p-4">
          <SectionTitle>Replacement claims</SectionTitle>
          <ul className="divide-y divide-gold-400/10 text-sm">
            {claims.map((cl) => (
              <li key={cl.id} className="flex items-center justify-between py-2">
                <span className="text-silver-300">
                  #{cl.queue_pos} {nameOf(cl.user_id)} lost {couples.find((c) => c.id === cl.lost_couple_id)?.celebrity}
                </span>
                <span className="text-xs text-silver-500">
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

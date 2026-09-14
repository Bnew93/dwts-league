import { createClient } from "@/lib/supabase/server";
import { PageTitle, SectionTitle } from "@/components/shell";
import { CoupleFace } from "@/components/couple";
import { StatusChip } from "@/components/status-chip";
import { ConfirmForm } from "@/components/confirm-form";
import { loadShow, weekInfo } from "@/lib/queries";
import type { IngestRun } from "@/lib/types";
import { markOut, setPlacement, undoResult, applyIngestRun, dismissIngestRun, saveCast } from "../actions";

export const dynamic = "force-dynamic";

const sel = "input-dark w-auto px-2 py-1.5 text-sm";

/** Results for the whole platform (one couples update fans out to every league) plus ingestion runs. */
export default async function AdminIngestPage() {
  const supabase = await createClient();
  const { data: season } = await supabase.rpc("fn_current_season", { p_show_id: "dwts" });
  const s = (season as number) ?? 0;
  const [{ couples, episodes }, { data: runs }] = await Promise.all([
    loadShow("dwts", s),
    supabase.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);
  const { weeks, aired, current } = weekInfo(episodes);
  const defaultWeek = aired.size ? Math.max(...aired) : current;
  const finaleWeek = weeks[weeks.length - 1];
  const alive = couples.filter((c) => c.status === "active" || c.status === "finalist");
  const out = couples.filter((c) => c.status === "eliminated" || c.status === "withdrew");
  const review = ((runs ?? []) as IngestRun[]).filter((r) => r.status === "needs_review");

  return (
    <>
      <PageTitle eyebrow={`Season ${s}`} title="Results & ingest">
        <p className="mt-1 max-w-prose text-sm text-silver-500">
          Every action here changes the show data once and writes roster events and claims to every league in the season. Each one is audited.
        </p>
      </PageTitle>

      <section className="glass mt-6 p-4">
        <SectionTitle right={`${(runs ?? []).length} recent`}>Ingestion runs</SectionTitle>
        <p className="text-sm text-silver-500">Automated Wikipedia ingestion arrives in Phase 3. Runs that need review can be applied or dismissed here.</p>
        {review.length > 0 && (
          <ul className="mt-3 space-y-2">
            {review.map((r) => (
              <li key={r.id} className="rounded-lg border border-gold-400/40 bg-gold-400/10 p-3 text-sm">
                <div className="text-gold-200">Needs review · {new Date(r.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</div>
                <pre className="mt-2 max-h-40 overflow-auto text-xs text-silver-300">{JSON.stringify(r.diff, null, 1)}</pre>
                <div className="mt-2 flex gap-2">
                  <ConfirmForm action={applyIngestRun} message="Apply this diff, including any un-eliminations?">
                    <input type="hidden" name="run_id" value={r.id} />
                    <button className="btn-gold px-3 py-1.5 text-sm">Apply</button>
                  </ConfirmForm>
                  <form action={dismissIngestRun}>
                    <input type="hidden" name="run_id" value={r.id} />
                    <button className="btn-ghost px-3 py-1.5 text-sm">Dismiss</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {(runs ?? []).length > 0 && (
          <ul className="mt-3 divide-y divide-gold-400/10 text-xs text-silver-500">
            {((runs ?? []) as IngestRun[]).map((r) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span>{new Date(r.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</span>
                <span className="text-silver-300">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <SectionTitle right={`${alive.length}`}>Remaining</SectionTitle>
        <ul className="stagger space-y-2">
          {alive.map((c) => (
            <li key={c.id} className="glass p-3">
              <div className="flex items-center gap-3">
                <CoupleFace couple={c} size={44} ring="ring-gold-400/50" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-silver-100">
                    {c.celebrity} <span className="font-normal text-silver-500">&amp; {c.professional}</span>
                  </div>
                  <div className="text-xs text-silver-500">
                    cast #{c.cast_order}
                    {c.placement != null && ` · placed ${c.placement}`}
                  </div>
                </div>
                <StatusChip couple={c} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ConfirmForm action={markOut} message={`Mark ${c.celebrity} out? This updates every league in the season.`} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="couple_id" value={c.id} />
                  <input type="hidden" name="season" value={s} />
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
                </ConfirmForm>
                <ConfirmForm action={setPlacement} message={`Record a final placement for ${c.celebrity}?`} className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <input type="hidden" name="couple_id" value={c.id} />
                  <input type="hidden" name="season" value={s} />
                  <input type="hidden" name="week" value={finaleWeek} />
                  <span className="text-xs text-silver-500">Finale:</span>
                  <input name="placement" type="number" min={1} required placeholder="1 = 🏆" className={`${sel} w-24`} />
                  <button className="btn-ghost border-gold-400/50 px-3 py-1.5 text-sm text-gold-200">Place</button>
                </ConfirmForm>
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
                <CoupleFace couple={c} size={34} ring="ring-silver-500/30" />
                <div className="min-w-0 flex-1 truncate text-silver-300">
                  {c.celebrity} <span className="text-silver-500">&amp; {c.professional}</span>
                </div>
                <StatusChip couple={c} />
                <ConfirmForm action={undoResult} message={`Return ${c.celebrity} to active in every league?`}>
                  <input type="hidden" name="couple_id" value={c.id} />
                  <button className="btn-danger px-2.5 py-1 text-xs">Undo</button>
                </ConfirmForm>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass mt-7 p-4">
        <SectionTitle right={`${couples.length} couples`}>Cast</SectionTitle>
        <p className="mb-3 text-xs text-silver-500">Cast order drives timer auto-picks (lowest number first). The photo URL is the official couple promo shot; blank falls back to initials.</p>
        <form action={saveCast}>
          <ul className="divide-y divide-gold-400/10">
            {couples.map((c) => (
              <li key={c.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <input name={`order:${c.id}`} type="number" min={1} defaultValue={c.cast_order} className="input-dark w-16 px-2 py-1 text-center" />
                  <CoupleFace couple={c} size={40} ring="ring-gold-400/50" />
                  <div className="min-w-0 sm:w-48">
                    <div className="truncate font-semibold text-silver-100">{c.celebrity}</div>
                    <div className="truncate text-xs text-silver-500">with {c.professional}</div>
                  </div>
                </div>
                <input name={`photo:${c.id}`} defaultValue={c.image_url ?? ""} placeholder="Couple photo URL (https)" className="input-dark min-w-0 px-2 py-1 text-xs" size={10} />
              </li>
            ))}
          </ul>
          {couples.length > 0 && <button className="btn-gold mt-3">Save cast</button>}
        </form>
        {couples.length === 0 && <p className="mt-3 text-sm text-gold-300">No couples imported yet. Run the cast import.</p>}
      </section>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell, PageTitle, SectionTitle } from "@/components/shell";
import { CoupleFace } from "@/components/couple";
import { leftoverCount } from "@/lib/draft";
import type { Couple, AllowedEmail } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";
import { saveSettings, saveSchedule, addAllowedEmail, removeAllowedEmail, saveCast, startDraft, resetDraft, startMockDraft, endMockDraft } from "./actions";

export default async function AdminPage() {
  const ctx = await getCtx();
  if (!ctx.isCommissioner) redirect("/standings");
  const { league, members } = ctx;
  const supabase = await createClient();

  const [{ data: couples }, { data: allowed }] = await Promise.all([
    supabase.from("couples").select("*").eq("league_id", league.id).order("cast_order"),
    supabase.from("allowed_emails").select("*").eq("league_id", league.id).order("email"),
  ]);
  const cast = (couples ?? []) as Couple[];
  const allowlist = (allowed ?? []) as AllowedEmail[];
  const pending = league.draft_status === "pending";
  const activeCount = cast.filter((c) => c.status === "active").length;
  const leftovers = leftoverCount(activeCount, members.length, league.roster_size);
  const canStart = pending && members.length >= 2 && activeCount >= members.length * league.roster_size;

  return (
    <Shell ctx={ctx}>
      <PageTitle
        eyebrow="Commissioner"
        title="League Admin"
        meta={
          <span>
            Draft <span className="text-silver-100">{league.draft_status}</span>
            {league.draft_rng_seed && <> · seed <code className="text-xs">{league.draft_rng_seed.slice(0, 8)}</code></>}
          </span>
        }
      />

      <div className="stagger mt-5 space-y-4">
        {/* Draft */}
        <section className="glass border-gold-400/35 p-4">
          <SectionTitle>Draft</SectionTitle>
          <p className="text-sm text-silver-300">
            {members.length} members × {league.roster_size} rounds = {members.length * league.roster_size} picks from {activeCount} couples →{" "}
            {leftovers} leftover{leftovers === 1 ? "" : "s"}
            {leftovers === 0 && " (replacement picks disabled)"}.
          </p>
          {!canStart && pending && (
            <p className="mt-2 text-sm text-gold-300">
              {members.length < 2 ? "Need at least 2 members signed in before starting." : "Not enough active couples for this roster size."}
            </p>
          )}
          {league.is_mock && (
            <p className="mt-3 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm text-gold-200">
              Mock draft in progress. You pick for the proxies in the Draft Room. Ending the mock removes the proxies, all picks, and any results entered
              meanwhile.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2.5">
            {pending && !league.is_mock && (
              <>
                <form action={startDraft}>
                  <button className="btn-gold" disabled={!canStart}>
                    Start Draft
                  </button>
                </form>
                <form action={startMockDraft}>
                  <button className="btn-ghost border-gold-400/50 text-gold-200">Start mock draft</button>
                </form>
              </>
            )}
            {league.draft_status === "live" && (
              <Link href="/draft" className="btn-gold">
                Open Draft Room
              </Link>
            )}
            {league.draft_status === "live" && !league.is_mock && (
              <form action={resetDraft}>
                <button className="btn-danger">Reset draft (dry run only)</button>
              </form>
            )}
            {league.is_mock && (
              <form action={endMockDraft}>
                <button className="btn-danger">End mock draft &amp; clean up</button>
              </form>
            )}
          </div>
          {pending && !league.is_mock && (
            <p className="mt-2 text-xs text-silver-500">Mock draft adds proxy members to reach 4, lets you pick for them with the real timer, and is fully reversible.</p>
          )}
          {league.draft_order && (
            <ol className="mt-4 flex flex-wrap gap-2 text-sm">
              {league.draft_order.map((id, i) => {
                const m = members.find((m) => m.id === id);
                return (
                  <li key={id} className="rounded-full border hairline bg-plum-950/50 px-3 py-1 text-silver-300">
                    <span className="text-gold-300">{i + 1}.</span> {m?.display_name ?? id}
                    {m?.is_mock && <span className="ml-1 text-xs text-gold-400/80">proxy</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Schedule */}
        <section className="glass p-4" id="schedule">
          <SectionTitle>Draft night</SectionTitle>
          <p className="text-sm text-silver-300">
            Estimated start, shown as a countdown in the Draft Room lobby. Nothing starts automatically; you open the room with the button when everyone&apos;s
            there.
          </p>
          <form action={saveSchedule} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm text-silver-300">
              Start (Eastern)
              <input
                name="scheduled"
                type="datetime-local"
                defaultValue={league.draft_scheduled_at ? formatInTimeZone(new Date(league.draft_scheduled_at), "America/New_York", "yyyy-MM-dd'T'HH:mm") : ""}
                className="input-dark mt-1 w-auto"
              />
            </label>
            <button className="btn-gold">Save</button>
            {league.draft_scheduled_at && (
              <span className="text-xs text-silver-500">
                Currently {formatInTimeZone(new Date(league.draft_scheduled_at), "America/New_York", "EEE, MMM d · h:mm a")} ET
              </span>
            )}
          </form>
        </section>

        {/* Results */}
        <section className="glass p-4">
          <SectionTitle>Results</SectionTitle>
          <p className="text-sm text-silver-300">Manual eliminations, placements, and undo. Automated ingestion arrives in Phase 3.</p>
          <Link href="/admin/results" className="btn-gold mt-3">
            Results override
          </Link>
        </section>

        {/* Settings */}
        <section className="glass p-4">
          <SectionTitle>Settings</SectionTitle>
          <form action={saveSettings} className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-silver-300 sm:col-span-3">
              League name
              <input name="name" defaultValue={league.name} className="input-dark mt-1" disabled={!pending} />
            </label>
            <label className="text-sm text-silver-300">
              Roster size (rounds)
              <input name="roster_size" type="number" min={1} max={10} defaultValue={league.roster_size} className="input-dark mt-1" disabled={!pending} />
            </label>
            <label className="text-sm text-silver-300">
              Pick timer (seconds)
              <input name="pick_seconds" type="number" min={15} max={600} defaultValue={league.pick_seconds} className="input-dark mt-1" disabled={!pending} />
            </label>
            <div className="flex items-end">
              <button className="btn-gold" disabled={!pending}>
                Save
              </button>
            </div>
          </form>
        </section>

        {/* Members */}
        <section className="glass p-4">
          <SectionTitle right={`${members.length} of ${allowlist.length} signed in`}>Members</SectionTitle>
          <ul className="divide-y divide-gold-400/10 text-sm">
            {allowlist.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-silver-100">{a.email}</div>
                  <div className="text-xs text-silver-500">
                    {a.display_name ?? "—"}
                    {a.is_commissioner && " · commissioner"}
                  </div>
                </div>
                {a.is_commissioner ? null : a.user_id ? (
                  <span className="text-xs text-emerald-300">signed in</span>
                ) : (
                  <form action={removeAllowedEmail}>
                    <input type="hidden" name="email" value={a.email} />
                    <button className="text-xs text-silver-500 underline hover:text-rose-300">remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={addAllowedEmail} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input name="email" type="email" required placeholder="member@gmail.com" className="input-dark" />
            <input name="display_name" placeholder="Display name (optional)" className="input-dark" />
            <button className="btn-gold">Add</button>
          </form>
        </section>

        {/* Cast */}
        <section className="glass p-4">
          <SectionTitle right={`${cast.length} couples`}>Cast</SectionTitle>
          <p className="mb-3 text-xs text-silver-500">
            Cast order drives timer auto-picks (lowest number first) and is locked once the draft starts. The photo URL is the official couple promo shot;
            it can be swapped any time, and blank falls back to initials.
          </p>
          <form action={saveCast}>
            <ul className="divide-y divide-gold-400/10">
              {cast.map((c) => (
                <li key={c.id} className="grid gap-2 py-3 sm:grid-cols-[auto_1fr] sm:items-center">
                  <div className="flex items-center gap-3">
                    <input name={`order:${c.id}`} type="number" min={1} defaultValue={c.cast_order} disabled={!pending} className="input-dark w-16 px-2 py-1 text-center" />
                    <CoupleFace couple={c} size={40} ring="ring-gold-400/50" />
                    <div className="min-w-0 sm:w-48">
                      <div className="truncate font-semibold text-silver-100">{c.celebrity}</div>
                      <div className="truncate text-xs text-silver-500">with {c.professional}</div>
                    </div>
                  </div>
                  <input name={`photo:${c.id}`} defaultValue={c.image_url ?? ""} placeholder="Couple photo URL (https)" className="input-dark px-2 py-1 text-xs" />
                </li>
              ))}
            </ul>
            {cast.length > 0 && <button className="btn-gold mt-3">Save cast</button>}
          </form>
          {cast.length === 0 && <p className="mt-3 text-sm text-gold-300">No couples imported yet. Run the cast import.</p>}
        </section>
      </div>
    </Shell>
  );
}

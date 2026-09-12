import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { leftoverCount } from "@/lib/draft";
import type { Couple, AllowedEmail } from "@/lib/types";
import {
  saveSettings,
  addAllowedEmail,
  removeAllowedEmail,
  saveCastOrder,
  startDraft,
  resetDraft,
  startMockDraft,
  endMockDraft,
} from "./actions";

const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-base disabled:opacity-50";
const btn = "rounded-md bg-mirror px-4 py-2 font-medium text-zinc-900 disabled:opacity-40";
const card = "mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4";
const h2 = "text-sm font-semibold uppercase tracking-wide text-zinc-400";

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
  const canStart =
    pending && members.length >= 2 && activeCount >= members.length * league.roster_size;

  return (
    <Shell ctx={ctx}>
      <h1 className="text-2xl font-bold">League Admin</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Draft is <span className="font-medium text-zinc-200">{league.draft_status}</span>
        {league.draft_status !== "pending" && league.draft_rng_seed && (
          <> · seed <code className="text-xs">{league.draft_rng_seed.slice(0, 8)}</code></>
        )}
      </p>

      {/* Start draft */}
      <section className={`${card} border-mirror/40`}>
        <h2 className={h2}>Draft</h2>
        <p className="mt-2 text-sm text-zinc-300">
          {members.length} members × {league.roster_size} rounds = {members.length * league.roster_size} picks
          from {activeCount} couples → {leftovers} leftover{leftovers === 1 ? "" : "s"}
          {leftovers === 0 && " (replacement picks disabled)"}.
        </p>
        {!canStart && pending && (
          <p className="mt-2 text-sm text-amber-300">
            {members.length < 2
              ? "Need at least 2 members signed in before starting."
              : "Not enough active couples for this roster size."}
          </p>
        )}
        {league.is_mock && (
          <p className="mt-3 rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            Mock draft in progress. You pick for the proxies in the Draft Room. When you&apos;re done,
            end the mock to remove the proxies and all picks.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {pending && !league.is_mock && (
            <>
              <form action={startDraft}>
                <button className={btn} disabled={!canStart}>
                  Start Draft
                </button>
              </form>
              <form action={startMockDraft}>
                <button className="rounded-md border border-amber-600 px-4 py-2 font-medium text-amber-200">
                  Start mock draft
                </button>
              </form>
            </>
          )}
          {league.draft_status === "live" && (
            <a href="/draft" className={btn}>
              Open Draft Room
            </a>
          )}
          {league.draft_status === "live" && !league.is_mock && (
            <form action={resetDraft}>
              <button className="rounded-md border border-red-800 px-4 py-2 text-red-300">
                Reset draft (dry run only)
              </button>
            </form>
          )}
          {league.is_mock && (
            <form action={endMockDraft}>
              <button className="rounded-md border border-red-800 px-4 py-2 text-red-300">
                End mock draft &amp; clean up
              </button>
            </form>
          )}
        </div>
        {pending && !league.is_mock && (
          <p className="mt-2 text-xs text-zinc-500">
            Mock draft adds proxy members to reach 4, lets you pick for them with the real timer, and is fully
            reversible.
          </p>
        )}
        {league.draft_order && (
          <ol className="mt-4 list-decimal space-y-1 pl-6 text-sm">
            {league.draft_order.map((id) => (
              <li key={id}>
                {members.find((m) => m.id === id)?.display_name ?? id}
                {members.find((m) => m.id === id)?.is_mock && (
                  <span className="ml-1 text-xs text-amber-400">proxy</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Results */}
      <section className={card}>
        <h2 className={h2}>Results</h2>
        <p className="mt-2 text-sm text-zinc-300">Manual eliminations, placements, and undo. Automated ingestion arrives in Phase 3.</p>
        <a href="/admin/results" className={`${btn} mt-3 inline-block`}>
          Results override
        </a>
      </section>

      {/* Settings */}
      <section className={card}>
        <h2 className={h2}>Settings</h2>
        <form action={saveSettings} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-zinc-300 sm:col-span-3">
            League name
            <input name="name" defaultValue={league.name} className={input} disabled={!pending} />
          </label>
          <label className="text-sm text-zinc-300">
            Roster size (rounds)
            <input
              name="roster_size"
              type="number"
              min={1}
              max={10}
              defaultValue={league.roster_size}
              className={input}
              disabled={!pending}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Pick timer (seconds)
            <input
              name="pick_seconds"
              type="number"
              min={15}
              max={600}
              defaultValue={league.pick_seconds}
              className={input}
              disabled={!pending}
            />
          </label>
          <div className="flex items-end">
            <button className={btn} disabled={!pending}>
              Save
            </button>
          </div>
        </form>
      </section>

      {/* Members + allowlist */}
      <section className={card}>
        <h2 className={h2}>Members</h2>
        <ul className="mt-3 divide-y divide-zinc-800 text-sm">
          {allowlist.map((a) => {
            const joined = a.user_id != null;
            return (
              <li key={a.email} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate">{a.email}</div>
                  <div className="text-xs text-zinc-500">
                    {a.display_name ?? "—"}
                    {a.is_commissioner && " · commissioner"}
                  </div>
                </div>
                {a.is_commissioner ? null : joined ? (
                  <span className="text-xs text-emerald-400">signed in</span>
                ) : (
                  <form action={removeAllowedEmail}>
                    <input type="hidden" name="email" value={a.email} />
                    <button className="text-xs text-zinc-400 underline">remove</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          {members.length} of {allowlist.length} allowlisted accounts have signed in.
        </p>
        <form action={addAllowedEmail} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input name="email" type="email" required placeholder="member@gmail.com" className={input} />
          <input name="display_name" placeholder="Display name (optional)" className={input} />
          <button className={btn}>Add</button>
        </form>
      </section>

      {/* Cast */}
      <section className={card}>
        <h2 className={h2}>Cast · {cast.length} couples</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Cast order drives timer auto-picks (lowest number first). Editable until the draft starts.
        </p>
        <form action={saveCastOrder} className="mt-3">
          <ul className="divide-y divide-zinc-800 text-sm">
            {cast.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <input
                  name={`order:${c.id}`}
                  type="number"
                  min={1}
                  defaultValue={c.cast_order}
                  disabled={!pending}
                  className="w-16 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-center disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.celebrity}</div>
                  <div className="truncate text-xs text-zinc-500">
                    with {c.professional} · {c.notability}
                  </div>
                </div>
                <span className="text-xs text-zinc-500">{c.status}</span>
              </li>
            ))}
          </ul>
          {pending && cast.length > 0 && (
            <button className={`${btn} mt-3`}>Save order</button>
          )}
        </form>
        {cast.length === 0 && (
          <p className="mt-3 text-sm text-amber-300">No couples imported yet. Run the cast import.</p>
        )}
      </section>
    </Shell>
  );
}

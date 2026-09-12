import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { DraftRoom } from "@/components/draft/draft-room";
import type { Couple, DraftPick } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const ctx = await getCtx();
  const { league, members, isCommissioner } = ctx;
  if (league.draft_status === "complete") redirect("/standings");

  const supabase = await createClient();
  const [{ data: couples }, { data: picks }] = await Promise.all([
    supabase.from("couples").select("*").eq("league_id", league.id).order("cast_order"),
    supabase.from("draft_picks").select("*").eq("league_id", league.id).order("pick_no"),
  ]);

  if (league.draft_status === "pending") {
    return (
      <Shell ctx={ctx}>
        <h1 className="text-2xl font-bold">Draft Room</h1>
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <div className="text-4xl">🕺</div>
          <p className="mt-3 text-zinc-300">The draft hasn&apos;t started yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            {members.length} member{members.length === 1 ? "" : "s"} signed in · {league.roster_size} rounds ·{" "}
            {league.pick_seconds}s per pick
          </p>
          {isCommissioner && (
            <Link
              href="/admin"
              className="mt-5 inline-block rounded-md bg-mirror px-4 py-2 font-medium text-zinc-900"
            >
              Go to Admin to start the draft
            </Link>
          )}
        </div>
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Cast</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {((couples ?? []) as Couple[]).map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <div className="font-medium">{c.celebrity}</div>
                <div className="text-xs text-zinc-500">
                  with {c.professional} · {c.notability}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx}>
      <DraftRoom
        league={league}
        members={members}
        me={ctx.user.id}
        initialCouples={(couples ?? []) as Couple[]}
        initialPicks={(picks ?? []) as DraftPick[]}
      />
    </Shell>
  );
}

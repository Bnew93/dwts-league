import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { DraftRoom } from "@/components/draft/draft-room";
import { Lobby } from "@/components/draft/lobby";
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
      <Shell ctx={ctx} bare>
        <Lobby league={league} members={members} me={ctx.user.id} isCommissioner={isCommissioner} couples={(couples ?? []) as Couple[]} />
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} fill>
      <DraftRoom
        league={league}
        members={members}
        me={ctx.user.id}
        isCommissioner={isCommissioner}
        initialCouples={(couples ?? []) as Couple[]}
        initialPicks={(picks ?? []) as DraftPick[]}
      />
    </Shell>
  );
}

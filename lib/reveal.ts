import { createClient } from "@/lib/supabase/server";
import type { Ctx } from "@/lib/league";
import type { Couple } from "@/lib/types";

export type Reveal = {
  key: string;
  week: number;
  couples: (Couple & { owner_id: string | null; owner_name: string })[];
};

/**
 * The most recent elimination week the user hasn't been shown yet, or null.
 * Compares '<season>:<week>' of the latest eliminated/withdrew couples against profiles.last_reveal_key.
 */
export async function getPendingReveal(ctx: Ctx): Promise<Reveal | null> {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("couples")
    .select("elimination_week")
    .eq("league_id", ctx.league.id)
    .in("status", ["eliminated", "withdrew"])
    .not("elimination_week", "is", null)
    .order("elimination_week", { ascending: false })
    .limit(1)
    .maybeSingle();
  const week = latest?.elimination_week as number | undefined;
  if (!week) return null;
  const key = `${ctx.league.season}:${week}`;
  if (ctx.profile.last_reveal_key === key) return null;

  const { data: couples } = await supabase
    .from("couples")
    .select("*")
    .eq("league_id", ctx.league.id)
    .in("status", ["eliminated", "withdrew"])
    .eq("elimination_week", week)
    .order("placement", { ascending: false });
  const list = (couples ?? []) as Couple[];
  if (!list.length) return null;

  // who owned each couple when it went out (the eliminated/withdrew ledger row)
  const { data: events } = await supabase
    .from("roster_events")
    .select("couple_id, user_id, event")
    .eq("league_id", ctx.league.id)
    .in("event", ["eliminated", "withdrew"])
    .in(
      "couple_id",
      list.map((c) => c.id),
    );
  const ownerOf = new Map<string, string>();
  for (const e of events ?? []) ownerOf.set(e.couple_id, e.user_id);

  return {
    key,
    week,
    couples: list.map((c) => {
      const owner_id = ownerOf.get(c.id) ?? null;
      return { ...c, owner_id, owner_name: owner_id ? ctx.members.find((m) => m.id === owner_id)?.display_name ?? "—" : "Leftovers" };
    }),
  };
}

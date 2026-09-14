import { createClient } from "@/lib/supabase/server";
import type { Ctx } from "@/lib/league";
import type { Couple } from "@/lib/types";
import type { StandingRow } from "@/lib/queries";

export type EliminationReveal = {
  type: "elimination";
  key: string;
  week: number;
  couples: (Couple & { owner_id: string | null; owner_name: string })[];
};

export type FinaleReveal = {
  type: "finale";
  key: string;
  podium: { rank: number; user_id: string; name: string; points: number; slot: number }[];
  champion: { user_id: string; name: string; couple: Couple } | null;
};

export type Reveal = EliminationReveal | FinaleReveal;

/**
 * What the user hasn't been shown yet in this league: the finale (once the season is complete),
 * else the latest elimination week. Keys are '<season>:<week>' and '<season>:final'; the finale
 * key is terminal. The cursor lives on league_members, one per league.
 */
export async function getPendingReveal(ctx: Ctx): Promise<Reveal | null> {
  const supabase = await createClient();
  const seen = ctx.membership.last_reveal_key ?? null;
  const { league } = ctx;

  if (league.status === "complete") {
    const key = `${league.season}:final`;
    if (seen === key) return null;
    const [{ data: standings }, { data: winner }] = await Promise.all([
      supabase.from("v_standings").select("*").eq("league_id", league.id).order("podium_rank"),
      supabase.from("couples").select("*").eq("show_id", league.show_id).eq("season", league.season).eq("placement", 1).maybeSingle(),
    ]);
    const rows = (standings ?? []) as StandingRow[];
    const slotOf = (uid: string) => Math.max(0, league.draft_order?.indexOf(uid) ?? 0);
    let champion: FinaleReveal["champion"] = null;
    if (winner) {
      const { data: ev } = await supabase
        .from("roster_events")
        .select("user_id, event, created_at")
        .eq("league_id", league.id)
        .eq("couple_id", winner.id)
        .in("event", ["drafted", "replacement"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ev) champion = { user_id: ev.user_id, name: ctx.members.find((m) => m.id === ev.user_id)?.display_name ?? "—", couple: winner as Couple };
    }
    return {
      type: "finale",
      key,
      podium: rows.slice(0, 3).map((r) => ({ rank: r.podium_rank, user_id: r.user_id, name: r.display_name, points: r.survival_points, slot: slotOf(r.user_id) })),
      champion,
    };
  }

  if (league.status !== "active") return null;

  const { data: latest } = await supabase
    .from("couples")
    .select("elimination_week")
    .eq("show_id", league.show_id)
    .eq("season", league.season)
    .in("status", ["eliminated", "withdrew"])
    .not("elimination_week", "is", null)
    .order("elimination_week", { ascending: false })
    .limit(1)
    .maybeSingle();
  const week = latest?.elimination_week as number | undefined;
  if (!week) return null;
  const key = `${league.season}:${week}`;
  if (seen === key) return null;

  const { data: couples } = await supabase
    .from("couples")
    .select("*")
    .eq("show_id", league.show_id)
    .eq("season", league.season)
    .in("status", ["eliminated", "withdrew"])
    .eq("elimination_week", week)
    .order("placement", { ascending: false });
  const list = (couples ?? []) as Couple[];
  if (!list.length) return null;

  const { data: events } = await supabase
    .from("roster_events")
    .select("couple_id, user_id, event")
    .eq("league_id", league.id)
    .in("event", ["eliminated", "withdrew"])
    .in(
      "couple_id",
      list.map((c) => c.id),
    );
  const ownerOf = new Map<string, string>();
  for (const e of events ?? []) ownerOf.set(e.couple_id, e.user_id);

  return {
    type: "elimination",
    key,
    week,
    couples: list.map((c) => {
      const owner_id = ownerOf.get(c.id) ?? null;
      return { ...c, owner_id, owner_name: owner_id ? ctx.members.find((m) => m.id === owner_id)?.display_name ?? "—" : "Leftovers" };
    }),
  };
}

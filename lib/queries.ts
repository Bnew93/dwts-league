import { createClient } from "@/lib/supabase/server";
import type { Couple } from "@/lib/types";

export type RosterEvent = {
  id: string;
  league_id: string;
  user_id: string;
  couple_id: string;
  event: "drafted" | "replacement" | "eliminated" | "withdrew";
  week: number;
  source: "draft" | "claim" | "ingest" | "admin";
  created_at: string;
};

export type Episode = {
  id: string;
  season: number;
  week: number;
  air_date: string;
  air_time: string;
  title: string | null;
  has_elimination: boolean;
};

export type StandingRow = {
  league_id: string;
  user_id: string;
  display_name: string;
  survival_points: number;
  active_couples: number;
  best_placement: number | null;
  is_grand_champion: boolean;
  draft_slot: number | null;
  podium_rank: number;
};

export type Claim = {
  id: string;
  league_id: string;
  user_id: string;
  lost_couple_id: string;
  queue_pos: number;
  status: "pending" | "fulfilled" | "void" | "expired";
  picked_couple_id: string | null;
  deadline: string | null;
  created_at: string;
  resolved_at: string | null;
};

/** Everything the season views need, in one round of parallel queries. */
export async function loadSeason(leagueId: string, season: number) {
  const supabase = await createClient();
  const [couples, events, episodes, standings, claims, scores] = await Promise.all([
    supabase.from("couples").select("*").eq("league_id", leagueId).order("cast_order"),
    supabase.from("roster_events").select("*").eq("league_id", leagueId).order("created_at"),
    supabase.from("episodes").select("*").eq("season", season).order("week").order("air_time"),
    supabase.from("v_standings").select("*").eq("league_id", leagueId).order("podium_rank"),
    supabase.from("replacement_claims").select("*").eq("league_id", leagueId).order("queue_pos"),
    supabase.from("judge_scores").select("couple_id, week, total"),
  ]);
  return {
    couples: (couples.data ?? []) as Couple[],
    events: (events.data ?? []) as RosterEvent[],
    episodes: (episodes.data ?? []) as Episode[],
    standings: (standings.data ?? []) as StandingRow[],
    claims: (claims.data ?? []) as Claim[],
    scores: (scores.data ?? []) as { couple_id: string; week: number; total: number | null }[],
  };
}

/** Current owner of each couple (null = leftover / never drafted), derived from the ledger like v_current_rosters. */
export function currentOwners(events: RosterEvent[]): Map<string, string> {
  const latest = new Map<string, RosterEvent>();
  for (const e of events) {
    const key = `${e.user_id}:${e.couple_id}`;
    latest.set(key, e); // events are ordered by created_at
  }
  const owners = new Map<string, string>();
  for (const e of latest.values()) {
    if (e.event === "drafted" || e.event === "replacement") owners.set(e.couple_id, e.user_id);
  }
  return owners;
}

/** Every owner a couple ever had, with the week they joined and (if any) left that roster. */
export function ownershipHistory(events: RosterEvent[], coupleId: string) {
  const out: { user_id: string; joined_week: number; left_week: number | null; left_event: string | null; source: string }[] = [];
  for (const e of events.filter((e) => e.couple_id === coupleId)) {
    if (e.event === "drafted" || e.event === "replacement") {
      out.push({ user_id: e.user_id, joined_week: Math.max(1, e.week), left_week: null, left_event: null, source: e.source });
    } else {
      const open = out.find((o) => o.user_id === e.user_id && o.left_week === null);
      if (open) {
        open.left_week = e.week;
        open.left_event = e.event;
      }
    }
  }
  return out;
}

/** Distinct show weeks, and which have already aired (latest air_time in the past). */
export function weekInfo(episodes: Episode[], now = Date.now()) {
  const weeks = Array.from(new Set(episodes.map((e) => e.week))).sort((a, b) => a - b);
  const aired = new Set(
    weeks.filter((w) => {
      const times = episodes.filter((e) => e.week === w).map((e) => new Date(e.air_time).getTime());
      return Math.max(...times) < now;
    }),
  );
  const current = weeks.find((w) => !aired.has(w)) ?? weeks[weeks.length - 1] ?? 1;
  return { weeks, aired, current };
}

export function scoreTotals(scores: { couple_id: string; total: number | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of scores) m.set(s.couple_id, (m.get(s.couple_id) ?? 0) + Number(s.total ?? 0));
  return m;
}

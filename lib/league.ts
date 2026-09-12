import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LEAGUE_COLUMNS } from "@/lib/league-columns";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: "commissioner" | "member";
  is_mock: boolean;
  last_reveal_key?: string | null;
};

export type League = {
  id: string;
  name: string;
  season: number;
  roster_size: number;
  pick_seconds: number;
  draft_status: "pending" | "live" | "complete";
  draft_order: string[] | null;
  draft_rng_seed: string | null;
  current_pick: number;
  turn_started_at: string | null;
  season_complete: boolean;
  is_mock: boolean;
  draft_scheduled_at: string | null;
};

export { LEAGUE_COLUMNS };

export type Member = Profile & { is_player: boolean };

export type Ctx = {
  user: { id: string; email: string | null };
  profile: Profile;
  league: League;
  /** everyone in the league, drafting or not */
  members: Member[];
  /** members who draft a team (draft order, standings) */
  players: Member[];
  isCommissioner: boolean;
  /** does the signed-in user draft a team? */
  isPlayer: boolean;
};

/**
 * Loads the signed-in user, their profile, and the (single) league they belong to.
 * Redirects to /login if signed out, or to /login?error=not_in_league if the
 * Google account is not on the allowlist (and signs them out).
 */
export async function getCtx(): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const loadMembership = () => supabase.from("league_members").select("league_id, is_player").eq("user_id", user.id).limit(1).maybeSingle();
  const [{ data: profile, error: profileErr }, first] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url, role, is_mock, last_reveal_key").eq("id", user.id).maybeSingle(),
    loadMembership(),
  ]);
  let membership = first.data;
  let memberErr = first.error;

  // Allowlisted after the account already existed? Claim membership now instead of bouncing.
  if (!membership && !memberErr) {
    const { data: claimed } = await supabase.rpc("fn_claim_membership");
    if (claimed) ({ data: membership, error: memberErr } = await loadMembership());
  }

  // A transient query failure must not sign anyone out; only a confirmed "no membership" does.
  if (profileErr || memberErr) throw new Error(`league lookup failed: ${(profileErr ?? memberErr)!.message}`);
  if (!profile || !membership) {
    await supabase.auth.signOut();
    redirect("/login?error=not_in_league");
  }

  const { data: league } = await supabase
    .from("leagues")
    .select(LEAGUE_COLUMNS)
    .eq("id", membership.league_id)
    .single();
  if (!league) redirect("/login?error=not_in_league");

  const { data: memberRows } = await supabase
    .from("league_members")
    .select("is_player, profiles(id, display_name, avatar_url, role, is_mock)")
    .eq("league_id", league.id);

  const members: Member[] = (memberRows ?? [])
    .filter((r) => r.profiles)
    .map((r) => ({ ...(r.profiles as unknown as Profile), is_player: r.is_player as boolean }));

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profile as Profile,
    league: league as League,
    members,
    players: members.filter((m) => m.is_player),
    isCommissioner: profile.role === "commissioner",
    isPlayer: membership.is_player as boolean,
  };
}

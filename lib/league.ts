import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: "commissioner" | "member";
};

export type League = {
  id: string;
  name: string;
  season: number;
  roster_size: number;
  pick_seconds: number;
  draft_status: "pending" | "live" | "complete";
  draft_order: string[] | null;
  current_pick: number;
  turn_started_at: string | null;
  season_complete: boolean;
};

export type Ctx = {
  user: { id: string; email: string | null };
  profile: Profile;
  league: League;
  members: Profile[];
  isCommissioner: boolean;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role")
    .eq("id", user.id)
    .single();

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!profile || !membership) {
    await supabase.auth.signOut();
    redirect("/login?error=not_in_league");
  }

  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, season, roster_size, pick_seconds, draft_status, draft_order, current_pick, turn_started_at, season_complete",
    )
    .eq("id", membership.league_id)
    .single();
  if (!league) redirect("/login?error=not_in_league");

  const { data: memberRows } = await supabase
    .from("league_members")
    .select("profiles(id, display_name, avatar_url, role)")
    .eq("league_id", league.id);

  const members = (memberRows ?? [])
    .map((r) => r.profiles as unknown as Profile)
    .filter(Boolean);

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profile as Profile,
    league: league as League,
    members,
    isCommissioner: profile.role === "commissioner",
  };
}

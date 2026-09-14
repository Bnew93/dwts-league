import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LEAGUE_COLUMNS, PROFILE_COLUMNS } from "@/lib/league-columns";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_mock: boolean;
  is_platform_admin: boolean;
  disabled_at: string | null;
};

export type LeagueStatus = "setup" | "drafting" | "active" | "complete";

export type League = {
  id: string;
  name: string;
  slug: string;
  season: number;
  show_id: string;
  roster_size: number;
  pick_seconds: number;
  status: LeagueStatus;
  draft_order: string[] | null;
  draft_rng_seed: string | null;
  current_pick: number;
  turn_started_at: string | null;
  is_mock: boolean;
  draft_scheduled_at: string | null;
  member_cap: number;
  member_count_locked: number | null;
  draft_completed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export { LEAGUE_COLUMNS };

export type MemberRole = "commissioner" | "member";

export type Member = Profile & { is_player: boolean; role: MemberRole; joined_at: string };

/** One of the signed-in user's league memberships (nav switcher, home routing). */
export type Membership = {
  league_id: string;
  role: MemberRole;
  is_player: boolean;
  last_reveal_key: string | null;
  league: { id: string; slug: string; name: string; status: LeagueStatus; season: number };
};

export type UserCtx = {
  user: { id: string; email: string | null };
  profile: Profile;
  memberships: Membership[];
  isPlatformAdmin: boolean;
};

export type Ctx = UserCtx & {
  league: League;
  /** everyone in the league, drafting or not */
  members: Member[];
  /** members who draft a team (draft order, standings) */
  players: Member[];
  membership: Membership;
  isCommissioner: boolean;
  /** does the signed-in user draft a team in this league? */
  isPlayer: boolean;
};

const MEMBERSHIP_SELECT = "league_id, role, is_player, last_reveal_key, leagues!inner(id, slug, name, status, season)";

/**
 * Signed-in user + profile + every membership. Redirects to /login when signed out and signs
 * out disabled accounts. No league is implied: callers route on `memberships`.
 */
export async function getUser(): Promise<UserCtx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileErr }, { data: rows, error: memberErr }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle(),
    supabase.from("league_members").select(MEMBERSHIP_SELECT).eq("user_id", user.id),
  ]);
  if (profileErr || memberErr) throw new Error(`profile lookup failed: ${(profileErr ?? memberErr)!.message}`);
  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?error=auth");
  }
  if (profile.disabled_at) {
    await supabase.auth.signOut();
    redirect("/login?error=disabled");
  }

  const memberships: Membership[] = (rows ?? [])
    .map((r) => {
      const lg = r.leagues as unknown as Membership["league"] | Membership["league"][] | null;
      const league = Array.isArray(lg) ? lg[0] : lg;
      if (!league) return null;
      return { league_id: r.league_id, role: r.role as MemberRole, is_player: r.is_player as boolean, last_reveal_key: r.last_reveal_key as string | null, league };
    })
    .filter((m): m is Membership => m !== null)
    .sort((a, b) => a.league.name.localeCompare(b.league.name));

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profile as Profile,
    memberships,
    isPlatformAdmin: (profile as Profile).is_platform_admin,
  };
}

/**
 * League context for /l/[slug]/* pages. 404 when the league does not exist or the user cannot
 * see it; a platform admin who is not a member is sent to the admin drill-in instead.
 */
export async function getCtx(slug: string): Promise<Ctx> {
  const base = await getUser();
  const supabase = await createClient();

  const { data: league } = await supabase.from("leagues").select(LEAGUE_COLUMNS).eq("slug", slug).maybeSingle();
  if (!league) notFound();

  const membership = base.memberships.find((m) => m.league_id === league.id);
  if (!membership) {
    if (base.isPlatformAdmin) redirect(`/admin/leagues/${league.id}`);
    notFound();
  }

  const { data: memberRows } = await supabase
    .from("league_members")
    .select(`is_player, role, joined_at, profiles(${PROFILE_COLUMNS})`)
    .eq("league_id", league.id)
    .order("joined_at");

  const members: Member[] = (memberRows ?? [])
    .filter((r) => r.profiles)
    .map((r) => ({
      ...(r.profiles as unknown as Profile),
      is_player: r.is_player as boolean,
      role: r.role as MemberRole,
      joined_at: r.joined_at as string,
    }));

  return {
    ...base,
    league: league as League,
    members,
    players: members.filter((m) => m.is_player),
    membership,
    isCommissioner: membership.role === "commissioner",
    isPlayer: membership.is_player,
  };
}

/** Where a signed-in user lands: their only league, the picker, or league creation. */
export function homePathFor(memberships: Membership[]): string {
  if (memberships.length === 1) return `/l/${memberships[0].league.slug}`;
  if (memberships.length > 1) return "/leagues";
  return "/leagues/new-or-join";
}

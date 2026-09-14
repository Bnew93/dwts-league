/** Column list for `leagues` selects. Client-safe (no server imports). */
export const LEAGUE_COLUMNS =
  "id, name, slug, season, show_id, roster_size, pick_seconds, status, draft_order, draft_rng_seed, current_pick, turn_started_at, is_mock, draft_scheduled_at, member_cap, member_count_locked, draft_completed_at, created_by, created_at";

/** Column list for `profiles` selects. */
export const PROFILE_COLUMNS = "id, display_name, avatar_url, is_mock, is_platform_admin, disabled_at";

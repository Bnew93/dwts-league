import { createClient } from "@/lib/supabase/server";

/**
 * One activity_log row per server action (PHASE_1_5 §2.5). Best-effort: a logging failure never
 * fails the action that produced it. Actions that are already logged inside their SQL function
 * (join, create, start draft, …) do not call this again.
 */
export async function logActivity(action: string, leagueId?: string | null, meta?: Record<string, unknown> | null): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("fn_log_activity", { p_action: action, p_league_id: leagueId ?? null, p_meta: meta ?? null });
  } catch {
    // ignore
  }
}

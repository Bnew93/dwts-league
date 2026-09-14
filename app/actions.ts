"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Remember that the signed-in user has seen the reveal `key` ('<season>:<week>' | '<season>:final') in one league. */
export async function markRevealSeen(leagueId: string, key: string): Promise<void> {
  const k = z.string().regex(/^\d+:(\d+|final)$/).parse(key);
  const id = z.string().uuid().parse(leagueId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("league_members").update({ last_reveal_key: k }).eq("league_id", id).eq("user_id", user.id);
}

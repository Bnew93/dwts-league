"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export type PickResult = { ok: true; pickNo: number } | { ok: false; error: string };

/**
 * Commit a draft pick. All validation (turn, availability, atomicity, who may pick for whom)
 * lives in fn_make_pick. `asUserId` lets the commissioner pick for a proxy during a mock draft.
 */
export async function makePick(leagueId: string, coupleId: string, asUserId?: string): Promise<PickResult> {
  const lid = z.string().uuid().safeParse(leagueId);
  const id = z.string().uuid().safeParse(coupleId);
  if (!lid.success || !id.success) return { ok: false, error: "bad id" };
  const as = asUserId ? z.string().uuid().safeParse(asUserId) : null;
  if (as && !as.success) return { ok: false, error: "bad user id" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "sign in required" };
  const { data, error } = await supabase.rpc("fn_make_pick", {
    p_league_id: lid.data,
    p_user_id: as?.success ? as.data : user.id,
    p_couple_id: id.data,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  const pickNo = (data as { pick_no: number }).pick_no;
  await logActivity("draft.pick", lid.data, { couple_id: id.data, pick_no: pickNo, as: as?.success ? as.data : null });
  // No revalidatePath here: the room refetches over Realtime, and a server re-render of the draft
  // page after the final pick would redirect to standings before the curtain call plays.
  return { ok: true, pickNo };
}

/** Server clock, so client countdowns can correct for device clock skew. Display only. */
export async function serverNow(): Promise<number> {
  return Date.now();
}

function friendly(msg: string): string {
  if (/not your turn/i.test(msg)) return "It's not your turn.";
  if (/already drafted/i.test(msg)) return "That couple was just taken.";
  if (/not live/i.test(msg)) return "The draft isn't live.";
  return msg;
}

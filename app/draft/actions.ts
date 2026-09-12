"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/league";

export type PickResult = { ok: true; pickNo: number } | { ok: false; error: string };

/**
 * Commit a draft pick. All validation (turn, availability, atomicity) lives in fn_make_pick.
 * `asUserId` lets the commissioner pick for a proxy during a mock draft; the DB enforces that.
 */
export async function makePick(coupleId: string, asUserId?: string): Promise<PickResult> {
  const id = z.string().uuid().safeParse(coupleId);
  if (!id.success) return { ok: false, error: "bad couple id" };
  const as = asUserId ? z.string().uuid().safeParse(asUserId) : null;
  if (as && !as.success) return { ok: false, error: "bad user id" };
  const ctx = await getCtx();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_make_pick", {
    p_league_id: ctx.league.id,
    p_user_id: as?.success ? as.data : ctx.user.id,
    p_couple_id: id.data,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/draft");
  return { ok: true, pickNo: (data as { pick_no: number }).pick_no };
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

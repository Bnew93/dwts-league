"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Remember that the signed-in user has seen the elimination reveal for `key` ('<season>:<week>'). */
export async function markRevealSeen(key: string): Promise<void> {
  const k = z.string().regex(/^\d+:\d+$/).parse(key);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ last_reveal_key: k }).eq("id", user.id);
}

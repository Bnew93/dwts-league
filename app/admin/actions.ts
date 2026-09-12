"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/league";

async function requireCommissioner() {
  const ctx = await getCtx();
  if (!ctx.isCommissioner) throw new Error("commissioner only");
  return ctx;
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  roster_size: z.coerce.number().int().min(1).max(10),
  pick_seconds: z.coerce.number().int().min(15).max(600),
});

export async function saveSettings(formData: FormData): Promise<void> {
  const ctx = await requireCommissioner();
  if (ctx.league.draft_status !== "pending") throw new Error("settings are locked once the draft starts");
  const s = settingsSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("leagues").update(s).eq("id", ctx.league.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  display_name: z.string().trim().max(40).optional().transform((v) => v || null),
});

export async function addAllowedEmail(formData: FormData): Promise<void> {
  const ctx = await requireCommissioner();
  const { email, display_name } = emailSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("allowed_emails")
    .upsert({ email, display_name, league_id: ctx.league.id, is_commissioner: false }, { onConflict: "email" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function removeAllowedEmail(formData: FormData): Promise<void> {
  const ctx = await requireCommissioner();
  const email = z.string().email().parse(formData.get("email"));
  if (email.toLowerCase() === ctx.user.email?.toLowerCase()) throw new Error("cannot remove yourself");
  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").delete().eq("email", email);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

const urlOrNull = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), z.string().url().startsWith("https://")]));

/** Cast editor: cast_order (only while pending) and photo URLs (any time). */
export async function saveCast(formData: FormData): Promise<void> {
  const ctx = await requireCommissioner();
  const supabase = await createClient();
  const pending = ctx.league.draft_status === "pending";
  const rows = new Map<string, { cast_order?: number; image_url?: string | null }>();
  const row = (id: string) => rows.get(id) ?? rows.set(id, {}).get(id)!;
  for (const [k, v] of formData.entries()) {
    const m = /^(order|photo):(.+)$/.exec(k);
    if (!m) continue;
    if (m[1] === "order") {
      if (pending) row(m[2]).cast_order = z.coerce.number().int().min(1).parse(v);
    } else row(m[2]).image_url = urlOrNull.parse(v);
  }
  for (const [id, patch] of rows) {
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("couples").update(patch).eq("id", id).eq("league_id", ctx.league.id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}

export async function startDraft(): Promise<void> {
  const ctx = await requireCommissioner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_start_draft", { p_league_id: ctx.league.id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/draft");
}

/** Mock draft: adds proxy members up to 4, starts the draft; commissioner picks for proxies. */
export async function startMockDraft(): Promise<void> {
  const ctx = await requireCommissioner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_start_mock_draft", { p_league_id: ctx.league.id, p_total: 4 });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/draft");
}

/** Ends the mock: wipes picks and roster events, removes proxies, draft back to pending. */
export async function endMockDraft(): Promise<void> {
  const ctx = await requireCommissioner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_end_mock_draft", { p_league_id: ctx.league.id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function resetDraft(): Promise<void> {
  const ctx = await requireCommissioner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reset_draft", { p_league_id: ctx.league.id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/admin");
}

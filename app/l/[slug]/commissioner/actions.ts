"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/league";
import { logActivity } from "@/lib/activity";

const uuid = z.string().uuid();
const slugSchema = z.string().regex(/^[a-z0-9-]{2,32}$/);

async function requireCommissioner(slug: string) {
  const ctx = await getCtx(slugSchema.parse(slug));
  if (!ctx.isCommissioner) throw new Error("commissioner only");
  return ctx;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

const refresh = (slug: string) => revalidatePath(`/l/${slug}`, "layout");

/* ------------------------------------------------------------------ draft */

export type StartResult = { ok: true } | { ok: false; short?: { players: number; cap: number }; error?: string };

/** The DB refuses with `short:N:M` when fewer players than the cap have joined; the UI confirms and retries. */
export async function startDraft(leagueId: string, slug: string, confirmShort = false): Promise<StartResult> {
  const ctx = await requireCommissioner(slug);
  if (ctx.league.id !== uuid.parse(leagueId)) return { ok: false, error: "wrong league" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_start_draft", { p_league_id: ctx.league.id, p_seed: null, p_confirm_short: confirmShort });
  if (error) {
    const m = /^short:(\d+):(\d+)/.exec(error.message);
    if (m) return { ok: false, short: { players: Number(m[1]), cap: Number(m[2]) } };
    return { ok: false, error: error.message };
  }
  refresh(slug);
  return { ok: true };
}

export async function startMockDraft(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_start_mock_draft", { p_league_id: ctx.league.id, p_total: null });
  refresh(slug);
  redirect(`/l/${slug}/draft`);
}

export async function endMockDraft(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_end_mock_draft", { p_league_id: ctx.league.id });
  refresh(slug);
  redirect(`/l/${slug}/commissioner?tab=draft`);
}

export async function resetDraft(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_reset_draft", { p_league_id: ctx.league.id });
  refresh(slug);
  redirect(`/l/${slug}/commissioner?tab=draft`);
}

/* --------------------------------------------------------------- settings */

const settingsSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(60).optional(),
  member_cap: z.coerce.number().int().min(2).max(14).optional(),
  pick_seconds: z.coerce.number().int().min(15).max(600).optional(),
});

export async function saveSettings(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const s = settingsSchema.parse({ ...raw, name: raw.name || undefined, member_cap: raw.member_cap || undefined, pick_seconds: raw.pick_seconds || undefined });
  const ctx = await requireCommissioner(s.slug);
  await rpc("fn_update_league_settings", {
    p_league_id: ctx.league.id,
    p_name: s.name ?? null,
    p_member_cap: s.member_cap ?? null,
    p_pick_seconds: s.pick_seconds ?? null,
    p_draft_scheduled_at: null,
    p_clear_schedule: false,
  });
  refresh(s.slug);
}

const scheduleSchema = z.object({
  slug: slugSchema,
  // datetime-local value, interpreted in Eastern time
  scheduled: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).or(z.literal("")),
  back: z.string().optional(),
});

/** Estimated draft start (Eastern). Display only; the room opens on commissioner confirmation. */
export async function saveSchedule(formData: FormData): Promise<void> {
  const { slug, scheduled, back } = scheduleSchema.parse(Object.fromEntries(formData));
  const ctx = await requireCommissioner(slug);
  const iso = scheduled ? fromZonedTime(scheduled, "America/New_York").toISOString() : null;
  await rpc("fn_update_league_settings", {
    p_league_id: ctx.league.id,
    p_name: null,
    p_member_cap: null,
    p_pick_seconds: null,
    p_draft_scheduled_at: iso,
    p_clear_schedule: iso === null,
  });
  refresh(slug);
  if (back && back.startsWith("/")) redirect(back);
}

/* ---------------------------------------------------------------- members */

export async function regenerateInvite(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_regenerate_invite", { p_league_id: ctx.league.id, p_expires_at: null, p_max_uses: null });
  refresh(slug);
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_revoke_invite", { p_league_id: ctx.league.id });
  refresh(slug);
}

export async function removeMember(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const userId = uuid.parse(formData.get("user_id"));
  const ctx = await requireCommissioner(slug);
  if (ctx.league.status === "setup") await rpc("fn_remove_member", { p_league_id: ctx.league.id, p_user_id: userId });
  else await rpc("fn_commissioner_remove_active_member", { p_league_id: ctx.league.id, p_user_id: userId });
  refresh(slug);
}

export async function transferCommissioner(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const to = uuid.parse(formData.get("user_id"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_transfer_commissioner", { p_league_id: ctx.league.id, p_to_user_id: to });
  refresh(slug);
  redirect(`/l/${slug}`);
}

export async function deleteLeague(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const ctx = await requireCommissioner(slug);
  await rpc("fn_delete_league", { p_league_id: ctx.league.id });
  revalidatePath("/", "layout");
  redirect("/");
}

/* ---------------------------------------------------------------- results */

const overrideSchema = z.object({
  slug: slugSchema,
  couple_id: uuid,
  event: z.enum(["eliminated", "withdrew", "restore"]),
  week: z.coerce.number().int().min(1).optional(),
});

/** League-scoped roster override. Never touches the shared couples table. */
export async function overrideResult(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const m = overrideSchema.parse({ ...raw, week: raw.week || undefined });
  const ctx = await requireCommissioner(m.slug);
  await rpc("fn_commissioner_override", { p_league_id: ctx.league.id, p_couple_id: m.couple_id, p_event: m.event, p_week: m.week ?? null });
  refresh(m.slug);
}

/* ----------------------------------------------------------------- claims */

export async function voidClaim(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const claimId = uuid.parse(formData.get("claim_id"));
  await requireCommissioner(slug);
  await rpc("fn_commissioner_void_claim", { p_claim_id: claimId });
  refresh(slug);
}

/** Move one pending claim up or down; sends the full pending order to the DB. */
export async function moveClaim(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const claimId = uuid.parse(formData.get("claim_id"));
  const dir = z.enum(["up", "down"]).parse(formData.get("dir"));
  const ctx = await requireCommissioner(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("replacement_claims").select("id").eq("league_id", ctx.league.id).eq("status", "pending").order("queue_pos");
  const ids = (data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(claimId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await rpc("fn_commissioner_reorder_claims", { p_league_id: ctx.league.id, p_claim_ids: ids });
  await logActivity("claim.reorder", ctx.league.id, { claim_id: claimId, dir });
  refresh(slug);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/league";
import { logActivity } from "@/lib/activity";

const uuid = z.string().uuid();

async function requireAdmin() {
  const u = await getUser();
  if (!u.isPlatformAdmin) throw new Error("platform admin only");
  return u;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function airDateFor(season: number, week: number): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("episodes").select("air_date").eq("season", season).eq("week", week).order("air_date", { ascending: false }).limit(1).maybeSingle();
  return data?.air_date ?? null;
}

const markSchema = z.object({
  couple_id: uuid,
  season: z.coerce.number().int(),
  status: z.enum(["eliminated", "withdrew"]),
  week: z.coerce.number().int().min(1),
  placement: z
    .union([z.literal(""), z.coerce.number().int().min(1)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/** Official result: mark a couple eliminated/withdrew in week N. Fans out to every league (audited). */
export async function markOut(formData: FormData): Promise<void> {
  await requireAdmin();
  const m = markSchema.parse(Object.fromEntries(formData));
  await rpc("fn_admin_set_couple_status", {
    p_couple_id: m.couple_id,
    p_status: m.status,
    p_elimination_week: m.week,
    p_elimination_date: await airDateFor(m.season, m.week),
    p_placement: m.placement,
  });
  revalidatePath("/", "layout");
}

const placeSchema = z.object({ couple_id: uuid, season: z.coerce.number().int(), placement: z.coerce.number().int().min(1), week: z.coerce.number().int().min(1) });

/** Finale: give a remaining couple its final placement (status finalist; 1 = the Mirrorball). */
export async function setPlacement(formData: FormData): Promise<void> {
  await requireAdmin();
  const m = placeSchema.parse(Object.fromEntries(formData));
  await rpc("fn_admin_set_couple_status", {
    p_couple_id: m.couple_id,
    p_status: "finalist",
    p_elimination_week: m.week,
    p_elimination_date: await airDateFor(m.season, m.week),
    p_placement: m.placement,
  });
  revalidatePath("/", "layout");
}

/** Undo: back to active; elimination ledger rows removed in every league; open claims voided. */
export async function undoResult(formData: FormData): Promise<void> {
  await requireAdmin();
  const couple_id = uuid.parse(formData.get("couple_id"));
  await rpc("fn_admin_set_couple_status", { p_couple_id: couple_id, p_status: "active", p_elimination_week: null, p_elimination_date: null, p_placement: null });
  revalidatePath("/", "layout");
}

export async function applyIngestRun(formData: FormData): Promise<void> {
  await requireAdmin();
  await rpc("fn_admin_force_ingest_apply", { p_run_id: uuid.parse(formData.get("run_id")) });
  revalidatePath("/", "layout");
}

export async function dismissIngestRun(formData: FormData): Promise<void> {
  await requireAdmin();
  await rpc("fn_admin_dismiss_ingest_run", { p_run_id: uuid.parse(formData.get("run_id")) });
  revalidatePath("/admin/ingest");
}

export async function adminRevokeInvite(formData: FormData): Promise<void> {
  await requireAdmin();
  const leagueId = uuid.parse(formData.get("league_id"));
  await rpc("fn_admin_revoke_invite", { p_league_id: leagueId });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function setUserDisabled(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = uuid.parse(formData.get("user_id"));
  const disabled = formData.get("disabled") === "true";
  await rpc("fn_admin_set_user_disabled", { p_user_id: userId, p_disabled: disabled });
  await logActivity("admin.user_disabled", null, { user_id: userId, disabled });
  revalidatePath("/admin", "layout");
}

const urlOrNull = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), z.string().url().startsWith("https://")]));

/** Cast editor: cast_order and photo URL, one audited call per changed couple. */
export async function saveCast(formData: FormData): Promise<void> {
  await requireAdmin();
  const rows = new Map<string, { cast_order?: number; image_url?: string | null }>();
  const row = (id: string) => rows.get(id) ?? rows.set(id, {}).get(id)!;
  for (const [k, v] of formData.entries()) {
    const m = /^(order|photo):(.+)$/.exec(k);
    if (!m) continue;
    if (m[1] === "order") row(m[2]).cast_order = z.coerce.number().int().min(1).parse(v);
    else row(m[2]).image_url = urlOrNull.parse(v);
  }
  const supabase = await createClient();
  const { data: current } = await supabase.from("couples").select("id, cast_order, image_url").in("id", [...rows.keys()]);
  for (const c of current ?? []) {
    const patch = rows.get(c.id)!;
    const orderChanged = patch.cast_order !== undefined && patch.cast_order !== c.cast_order;
    const photoChanged = patch.image_url !== undefined && patch.image_url !== c.image_url;
    if (!orderChanged && !photoChanged) continue;
    await rpc("fn_admin_update_couple", {
      p_couple_id: c.id,
      p_cast_order: orderChanged ? patch.cast_order : null,
      p_image_url: photoChanged && patch.image_url ? patch.image_url : null,
      p_clear_image: photoChanged && patch.image_url === null,
    });
  }
  revalidatePath("/", "layout");
}

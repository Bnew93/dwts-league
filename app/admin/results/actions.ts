"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/league";

async function requireCommissioner() {
  const ctx = await getCtx();
  if (!ctx.isCommissioner) throw new Error("commissioner only");
  return ctx;
}

type DiffItem = {
  couple_id: string;
  status: "active" | "eliminated" | "withdrew" | "finalist";
  elimination_week?: number | null;
  elimination_date?: string | null;
  placement?: number | null;
};

async function apply(diff: DiffItem[], allowRevert = false) {
  const ctx = await requireCommissioner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_apply_results", {
    p_league_id: ctx.league.id,
    p_diff: diff,
    p_source: "admin",
    p_run_id: null,
    p_allow_revert: allowRevert,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data;
}

async function airDateFor(season: number, week: number): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("episodes")
    .select("air_date")
    .eq("season", season)
    .eq("week", week)
    .order("air_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.air_date ?? null;
}

const markSchema = z.object({
  couple_id: z.string().uuid(),
  status: z.enum(["eliminated", "withdrew"]),
  week: z.coerce.number().int().min(1),
  placement: z
    .union([z.literal(""), z.coerce.number().int().min(1)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/** Mark one couple eliminated/withdrew in week N (optional placement). */
export async function markOut(formData: FormData): Promise<void> {
  const ctx = await requireCommissioner();
  const m = markSchema.parse(Object.fromEntries(formData));
  await apply([
    {
      couple_id: m.couple_id,
      status: m.status,
      elimination_week: m.week,
      elimination_date: await airDateFor(ctx.league.season, m.week),
      placement: m.placement,
    },
  ]);
}

const placeSchema = z.object({
  couple_id: z.string().uuid(),
  placement: z.coerce.number().int().min(1),
  week: z.coerce.number().int().min(1),
});

/** Finale: give a remaining couple its final placement (status finalist; 1 = Mirrorball). */
export async function setPlacement(formData: FormData): Promise<void> {
  const ctx = await requireCommissioner();
  const m = placeSchema.parse(Object.fromEntries(formData));
  await apply([
    {
      couple_id: m.couple_id,
      status: "finalist",
      elimination_week: m.week,
      elimination_date: await airDateFor(ctx.league.season, m.week),
      placement: m.placement,
    },
  ]);
}

/** Undo: return a couple to active, delete its elimination ledger rows, void open claims. */
export async function undoResult(formData: FormData): Promise<void> {
  const couple_id = z.string().uuid().parse(formData.get("couple_id"));
  await apply([{ couple_id, status: "active", elimination_week: null, elimination_date: null, placement: null }], true);
}

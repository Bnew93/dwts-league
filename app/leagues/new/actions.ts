"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { inviteUrl } from "@/lib/url";

export type CreateResult =
  | { ok: true; slug: string; leagueId: string; inviteUrl: string; rosterSize: number; leftovers: number; coupleCount: number }
  | { ok: false; error: string };

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  memberCap: z.number().int().min(2).max(14),
});

/** One fn_create_league call at the end of the wizard; the first invite link is created inside it. */
export async function createLeague(input: { name: string; slug: string; memberCap: number }): Promise<CreateResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the name, link name, and size." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_create_league", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_member_cap: parsed.data.memberCap,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { league_id: string; slug: string; invite_token: string; roster_size: number; leftovers: number; couple_count: number };
  return { ok: true, slug: r.slug, leagueId: r.league_id, inviteUrl: inviteUrl(r.invite_token), rosterSize: r.roster_size, leftovers: r.leftovers, coupleCount: r.couple_count };
}

export async function checkSlug(slug: string): Promise<boolean> {
  const s = z.string().regex(/^[a-z0-9-]{2,32}$/).safeParse(slug);
  if (!s.success) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("fn_slug_available", { p_slug: s.data });
  return data === true;
}

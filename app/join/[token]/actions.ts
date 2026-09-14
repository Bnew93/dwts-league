"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE, INVITE_TOKEN_RE } from "@/lib/invite";

const tokenSchema = z.string().regex(INVITE_TOKEN_RE);

/** Called right before a signed-out visitor starts Google sign-in from /join/[token]. */
export async function rememberInvite(token: string): Promise<void> {
  const t = tokenSchema.parse(token);
  const jar = await cookies();
  jar.set(INVITE_COOKIE, t, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
    path: "/",
  });
}

/** A signed-in visitor joins directly. */
export async function joinLeague(formData: FormData): Promise<void> {
  const token = tokenSchema.parse(formData.get("token"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_join_league", { p_token: token });
  if (error) redirect(`/join/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  const r = data as { slug: string; joined: boolean };
  redirect(`/l/${r.slug}${r.joined ? "?joined=1" : ""}`);
}

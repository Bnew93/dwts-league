"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";

export async function updateDisplayName(formData: FormData): Promise<void> {
  const name = z.string().trim().min(1).max(40).parse(formData.get("display_name"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  if (error) throw new Error(error.message);
  await logActivity("profile.rename", null, null);
  revalidatePath("/", "layout");
}

export async function leaveLeague(formData: FormData): Promise<void> {
  const leagueId = z.string().uuid().parse(formData.get("league_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_leave_league", { p_league_id: leagueId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * §6: the SQL function leaves every league and anonymizes the profile (blocking when the user
 * still runs a league); then the auth user is deleted with the service role and the session ends.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("fn_delete_account");
  if (error) throw new Error(error.message);
  const admin = createAdminClient();
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) throw new Error(delErr.message);
  await supabase.auth.signOut();
  redirect("/login");
}

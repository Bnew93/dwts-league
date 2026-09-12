import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell, PageTitle } from "@/components/shell";

async function updateDisplayName(formData: FormData) {
  "use server";
  const name = z.string().trim().min(1).max(40).parse(formData.get("display_name"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  revalidatePath("/", "layout");
}

export default async function ProfilePage() {
  const ctx = await getCtx();
  return (
    <Shell ctx={ctx}>
      <PageTitle eyebrow={ctx.isCommissioner ? "Commissioner" : "Member"} title="Profile">
        <p className="mt-1 text-sm text-silver-500">{ctx.user.email}</p>
      </PageTitle>

      <form action={updateDisplayName} className="glass fade-up mt-6 space-y-3 p-5" style={{ animationDelay: "80ms" }}>
        <label className="block text-sm text-silver-300" htmlFor="display_name">
          Display name
        </label>
        <input id="display_name" name="display_name" defaultValue={ctx.profile.display_name} maxLength={40} required className="input-dark" />
        <button className="btn-gold">Save</button>
      </form>

      <form action="/auth/signout" method="post" className="mt-8 text-center">
        <button className="btn-ghost text-sm">Sign out</button>
      </form>
    </Shell>
  );
}

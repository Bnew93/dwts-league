import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";

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
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-1 text-sm text-zinc-400">{ctx.user.email}</p>

      <form action={updateDisplayName} className="mt-6 space-y-3">
        <label className="block text-sm text-zinc-300" htmlFor="display_name">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={ctx.profile.display_name}
          maxLength={40}
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-base"
        />
        <button className="rounded-md bg-mirror px-4 py-2 font-medium text-zinc-900">Save</button>
      </form>

      <form action="/auth/signout" method="post" className="mt-10">
        <button className="text-sm text-zinc-400 underline hover:text-white">Sign out</button>
      </form>
    </Shell>
  );
}

import { getUser } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { UserMain } from "@/components/shell";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

/** Three-step creation wizard (PHASE_1_5 §4.1). State stays client-side until the final submit. */
export default async function NewLeaguePage() {
  await getUser(); // sign-in gate
  const supabase = await createClient();
  const { data: season } = await supabase.rpc("fn_current_season", { p_show_id: "dwts" });
  const { count } = await supabase
    .from("couples")
    .select("id", { count: "exact", head: true })
    .eq("show_id", "dwts")
    .eq("season", season as number)
    .eq("status", "active");
  return (
    <UserMain>
      <Wizard coupleCount={count ?? 0} season={(season as number) ?? 0} />
    </UserMain>
  );
}

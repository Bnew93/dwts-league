import { getUser } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { UserShell } from "@/components/shell";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

/** Three-step creation wizard (PHASE_1_5 §4.1). State stays client-side until the final submit. */
export default async function NewLeaguePage() {
  const u = await getUser();
  const supabase = await createClient();
  const { data: season } = await supabase.rpc("fn_current_season", { p_show_id: "dwts" });
  const { count } = await supabase
    .from("couples")
    .select("id", { count: "exact", head: true })
    .eq("show_id", "dwts")
    .eq("season", season as number)
    .eq("status", "active");
  return (
    <UserShell u={u}>
      <Wizard coupleCount={count ?? 0} season={(season as number) ?? 0} />
    </UserShell>
  );
}

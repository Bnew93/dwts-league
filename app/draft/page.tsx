import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { ComingSoon } from "@/components/coming-soon";

export default async function DraftPage() {
  const ctx = await getCtx();
  if (ctx.league.draft_status === "complete") redirect("/standings");
  return (
    <Shell ctx={ctx}>
      <ComingSoon title="Draft Room" phase={1} />
    </Shell>
  );
}

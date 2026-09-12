import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { ComingSoon } from "@/components/coming-soon";

export default async function AdminPage() {
  const ctx = await getCtx();
  if (!ctx.isCommissioner) redirect("/standings");
  return (
    <Shell ctx={ctx}>
      <ComingSoon title="League Admin" phase={1} />
    </Shell>
  );
}

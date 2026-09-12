import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { ComingSoon } from "@/components/coming-soon";

export default async function BracketPage() {
  const ctx = await getCtx();
  return (
    <Shell ctx={ctx}>
      <ComingSoon title="Bracket" phase={2} />
    </Shell>
  );
}

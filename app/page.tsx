import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";

export default async function Home() {
  const { league } = await getCtx();
  // Draft room is home while the draft is pending/live; Standings once complete (§1.1).
  if (league.draft_status !== "complete") redirect("/draft");
  redirect("/standings");
}

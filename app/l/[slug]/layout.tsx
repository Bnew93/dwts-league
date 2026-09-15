import { getCtx } from "@/lib/league";
import { LeagueNav } from "@/components/shell";

/** The league nav lives here so it stays on screen while a tab's page loads (see loading.tsx). */
export default async function LeagueLayout({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  const { slug } = await params;
  const ctx = await getCtx(slug);
  return (
    <>
      <LeagueNav ctx={ctx} />
      {children}
    </>
  );
}

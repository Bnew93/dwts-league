import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell, PageTitle, SectionTitle } from "@/components/shell";
import { CoupleCard } from "@/components/couple-card";
import { Mirrorball } from "@/components/mirrorball";
import { DraftRoom } from "@/components/draft/draft-room";
import type { Couple, DraftPick } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const ctx = await getCtx();
  const { league, members, isCommissioner } = ctx;
  if (league.draft_status === "complete") redirect("/standings");

  const supabase = await createClient();
  const [{ data: couples }, { data: picks }] = await Promise.all([
    supabase.from("couples").select("*").eq("league_id", league.id).order("cast_order"),
    supabase.from("draft_picks").select("*").eq("league_id", league.id).order("pick_no"),
  ]);

  if (league.draft_status === "pending") {
    return (
      <Shell ctx={ctx}>
        <PageTitle eyebrow="Snake draft" title="Draft Room" />
        <div className="glass fade-up relative mt-5 overflow-hidden p-8 text-center" style={{ animationDelay: "60ms" }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(233_194_80/0.22),transparent_70%)]" />
          <Mirrorball size={72} className="mx-auto" />
          <p className="display mt-4 text-2xl font-semibold text-silver-100">The ballroom is dark. For now.</p>
          <p className="mt-1 text-sm text-silver-500">
            {members.length} member{members.length === 1 ? "" : "s"} signed in · {league.roster_size} rounds · {league.pick_seconds}s per pick
          </p>
          {isCommissioner && (
            <Link href="/admin" className="btn-gold mt-6">
              Start the draft from Admin
            </Link>
          )}
        </div>
        <section className="mt-7">
          <SectionTitle right={`${couples?.length ?? 0} couples`}>The cast</SectionTitle>
          <ul className="stagger grid gap-2 sm:grid-cols-2">
            {((couples ?? []) as Couple[]).map((c) => (
              <li key={c.id}>
                <CoupleCard couple={c} right={<span className="text-xs text-silver-500">#{c.cast_order}</span>} />
              </li>
            ))}
          </ul>
        </section>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} wide>
      <DraftRoom
        league={league}
        members={members}
        me={ctx.user.id}
        isCommissioner={isCommissioner}
        initialCouples={(couples ?? []) as Couple[]}
        initialPicks={(picks ?? []) as DraftPick[]}
      />
    </Shell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, SectionTitle } from "@/components/shell";
import { LeagueStatusChip } from "@/components/league-status";
import { ConfirmForm } from "@/components/confirm-form";
import { LEAGUE_COLUMNS, PROFILE_COLUMNS } from "@/lib/league-columns";
import type { League, Profile } from "@/lib/league";
import type { ActivityRow, AuditRow, Invite } from "@/lib/types";
import type { RosterEvent } from "@/lib/queries";
import { AuditList } from "../../audit-list";
import { adminRevokeInvite, setUserDisabled } from "../../actions";

export const dynamic = "force-dynamic";

const et = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" });

export default async function AdminLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: league } = await supabase.from("leagues").select(LEAGUE_COLUMNS).eq("id", id).maybeSingle();
  if (!league) notFound();
  const lg = league as League;
  const [{ data: members }, { data: activity }, { data: events }, { data: couples }, { data: audit }, { data: invite }] = await Promise.all([
    supabase.from("league_members").select(`role, is_player, joined_at, profiles(${PROFILE_COLUMNS})`).eq("league_id", id).order("joined_at"),
    supabase.from("activity_log").select("*").eq("league_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("roster_events").select("*").eq("league_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("couples").select("id, celebrity").eq("show_id", lg.show_id).eq("season", lg.season),
    supabase.from("audit_log").select("*").contains("target", { league_id: id }).order("created_at", { ascending: false }).limit(20),
    supabase.from("league_invites").select("*").eq("league_id", id).is("revoked_at", null).maybeSingle(),
  ]);
  const people = (members ?? []).map((m) => ({ ...(m.profiles as unknown as Profile), role: m.role as string, is_player: m.is_player as boolean, joined_at: m.joined_at as string }));
  const nameOf = (uid: string | null) => people.find((p) => p.id === uid)?.display_name ?? uid?.slice(0, 8) ?? "—";
  const coupleName = (cid: string) => (couples ?? []).find((c) => c.id === cid)?.celebrity ?? cid.slice(0, 8);

  return (
    <>
      <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-silver-500 transition-colors hover:text-gold-300">
        <ArrowLeft size={14} /> Admin
      </Link>
      <PageTitle eyebrow={`/l/${lg.slug} · season ${lg.season}`} title={lg.name} meta={<LeagueStatusChip status={lg.status} />}>
        <p className="mt-1 text-xs text-silver-500">
          cap {lg.member_cap} · locked {lg.member_count_locked ?? "—"} · roster {lg.roster_size} · created {et(lg.created_at)}
          {lg.draft_completed_at && ` · drafted ${et(lg.draft_completed_at)}`}
        </p>
      </PageTitle>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="glass p-4">
          <SectionTitle right={`${people.length} / ${lg.member_cap}`}>Members</SectionTitle>
          <ul className="divide-y divide-gold-400/10 text-sm">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="text-silver-100">
                    {p.display_name}
                    {p.disabled_at && <span className="ml-1.5 text-xs text-rose-300">disabled</span>}
                    {p.is_mock && <span className="ml-1.5 text-xs text-gold-400/80">proxy</span>}
                  </div>
                  <div className="text-xs text-silver-500">
                    {p.role}
                    {!p.is_player && " · not drafting"} · {et(p.joined_at)}
                  </div>
                </div>
                {!p.is_platform_admin && !p.is_mock && (
                  <ConfirmForm action={setUserDisabled} message={p.disabled_at ? `Re-enable ${p.display_name}?` : `Disable ${p.display_name}? They are signed out everywhere.`}>
                    <input type="hidden" name="user_id" value={p.id} />
                    <input type="hidden" name="disabled" value={p.disabled_at ? "false" : "true"} />
                    <button className="text-xs text-silver-500 underline hover:text-rose-300">{p.disabled_at ? "enable" : "disable"}</button>
                  </ConfirmForm>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-silver-500">
            {invite ? (
              <ConfirmForm action={adminRevokeInvite} message="Revoke this league's invite link?" className="flex items-center gap-2">
                <span>Active invite · {(invite as Invite).use_count} uses</span>
                <input type="hidden" name="league_id" value={id} />
                <button className="underline hover:text-rose-300">revoke</button>
              </ConfirmForm>
            ) : (
              "No active invite"
            )}
          </div>
        </section>

        <section className="glass p-4">
          <SectionTitle right={`${(events ?? []).length}`}>Roster ledger</SectionTitle>
          <ul className="max-h-80 divide-y divide-gold-400/10 overflow-y-auto text-xs">
            {((events ?? []) as RosterEvent[]).map((e) => (
              <li key={e.id} className="flex justify-between gap-2 py-1.5">
                <span className="text-silver-300">
                  {e.event} · {coupleName(e.couple_id)} · {nameOf(e.user_id)}
                  <span className="text-silver-500"> · wk {e.week} · {e.source}</span>
                </span>
                <span className="shrink-0 text-silver-500">{et(e.created_at)}</span>
              </li>
            ))}
            {(events ?? []).length === 0 && <li className="py-2 text-silver-500">No roster events.</li>}
          </ul>
        </section>

        <section className="glass p-4">
          <SectionTitle right={`${(activity ?? []).length}`}>Activity</SectionTitle>
          <ul className="max-h-80 divide-y divide-gold-400/10 overflow-y-auto text-xs">
            {((activity ?? []) as ActivityRow[]).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-1.5">
                <span className="text-silver-300">
                  {a.action} <span className="text-silver-500">· {nameOf(a.user_id)}</span>
                </span>
                <span className="shrink-0 text-silver-500">{et(a.created_at)}</span>
              </li>
            ))}
            {(activity ?? []).length === 0 && <li className="py-2 text-silver-500">No activity yet.</li>}
          </ul>
        </section>

        <section>
          <SectionTitle>Audit</SectionTitle>
          <AuditList rows={(audit ?? []) as AuditRow[]} />
        </section>
      </div>
    </>
  );
}

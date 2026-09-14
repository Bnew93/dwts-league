import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, SectionTitle } from "@/components/shell";
import { LeagueStatusChip } from "@/components/league-status";
import { AdminCharts } from "./charts";
import { AuditList } from "./audit-list";
import type { AuditRow } from "@/lib/types";
import type { LeagueStatus } from "@/lib/league";

export const dynamic = "force-dynamic";

type Stats = {
  users: number;
  leagues_setup: number;
  leagues_drafting: number;
  leagues_active: number;
  leagues_complete: number;
  dau: number;
  wau: number;
  mau: number;
  drafts_completed: number;
  claims_pending: number;
  last_ingest_status: string | null;
  last_ingest_at: string | null;
  couples_remaining: number;
};

type LeagueStat = {
  id: string;
  name: string;
  slug: string;
  status: LeagueStatus;
  season: number;
  member_cap: number;
  member_count: number;
  player_count: number;
  roster_size: number;
  commissioner_name: string | null;
  created_at: string;
  draft_completed_at: string | null;
  last_activity_at: string | null;
  picks_made: number;
  claims_pending: number;
};

const SORTS = ["name", "status", "members", "created", "activity"] as const;

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: rawSort } = await searchParams;
  const sort = (SORTS as readonly string[]).includes(rawSort ?? "") ? (rawSort as (typeof SORTS)[number]) : "activity";
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: stats }, { data: leagues }, { data: activity }, { data: audit }] = await Promise.all([
    supabase.from("v_admin_platform_stats").select("*").single(),
    supabase.from("v_admin_league_stats").select("*"),
    supabase.from("activity_log").select("user_id, created_at").gte("created_at", since),
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  const s = (stats ?? {}) as Stats;
  const rows = ((leagues ?? []) as LeagueStat[]).sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "status":
        return a.status.localeCompare(b.status);
      case "members":
        return b.member_count - a.member_count;
      case "created":
        return b.created_at.localeCompare(a.created_at);
      default:
        return (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "");
    }
  });

  // daily series for the last 30 days
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 864e5).toISOString()));
  const dauByDay = new Map<string, Set<string>>();
  for (const a of activity ?? []) {
    const k = dayKey(a.created_at as string);
    if (!dauByDay.has(k)) dauByDay.set(k, new Set());
    if (a.user_id) dauByDay.get(k)!.add(a.user_id as string);
  }
  const createdByDay = new Map<string, number>();
  for (const l of rows) {
    const k = dayKey(l.created_at);
    createdByDay.set(k, (createdByDay.get(k) ?? 0) + 1);
  }
  const series = days.map((d) => ({ day: d.slice(5), dau: dauByDay.get(d)?.size ?? 0, leagues: createdByDay.get(d) ?? 0 }));

  const cards: [string, React.ReactNode][] = [
    ["Users", s.users],
    ["Leagues", `${s.leagues_setup} setup · ${s.leagues_drafting} drafting · ${s.leagues_active} active · ${s.leagues_complete} done`],
    ["DAU / WAU / MAU", `${s.dau} / ${s.wau} / ${s.mau}`],
    ["Drafts completed", s.drafts_completed],
    ["Claims pending", s.claims_pending],
    ["Last ingest", s.last_ingest_at ? `${s.last_ingest_status} · ${new Date(s.last_ingest_at).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "never"],
    ["Couples remaining", s.couples_remaining],
  ];

  return (
    <>
      <PageTitle eyebrow="Platform" title="Admin" meta="Read-only except the audited actions on Results & ingest" />
      <div className="stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([k, v]) => (
          <div key={k} className="glass p-4">
            <div className="eyebrow">{k}</div>
            <div className="display mt-1 text-xl font-semibold text-silver-100">{v}</div>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <SectionTitle>Last 30 days</SectionTitle>
        <div className="glass p-4">
          <AdminCharts series={series} />
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle
          right={
            <span className="flex gap-2">
              {SORTS.map((k) => (
                <Link key={k} href={`/admin?sort=${k}`} className={k === sort ? "text-gold-300" : "hover:text-silver-300"}>
                  {k}
                </Link>
              ))}
            </span>
          }
        >
          Leagues
        </SectionTitle>
        <div className="glass overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-silver-500">
              <tr>
                <th className="px-3 py-2">League</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Commissioner</th>
                <th className="px-3 py-2">Picks</th>
                <th className="px-3 py-2">Claims</th>
                <th className="px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-400/10">
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/leagues/${l.id}`} className="text-silver-100 hover:text-gold-300">
                      {l.name}
                    </Link>
                    <div className="text-xs text-silver-500">/l/{l.slug}</div>
                  </td>
                  <td className="px-3 py-2">
                    <LeagueStatusChip status={l.status} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-silver-300">
                    {l.member_count}/{l.member_cap}
                    {l.player_count !== l.member_count && <span className="text-silver-500"> ({l.player_count} drafting)</span>}
                  </td>
                  <td className="px-3 py-2 text-silver-300">{l.commissioner_name ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-silver-300">{l.picks_made}</td>
                  <td className="px-3 py-2 tabular-nums text-silver-300">{l.claims_pending}</td>
                  <td className="px-3 py-2 text-xs text-silver-500">{l.last_activity_at ? new Date(l.last_activity_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle>Audit log</SectionTitle>
        <AuditList rows={(audit ?? []) as AuditRow[]} />
      </section>
    </>
  );
}

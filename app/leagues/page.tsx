import Link from "next/link";
import { Plus } from "lucide-react";
import { getUser } from "@/lib/league";
import { UserShell } from "@/components/shell";
import { LeagueStatusChip } from "@/components/league-status";

export const dynamic = "force-dynamic";

/** League picker for users in more than one league (also reachable from the nav switcher). */
export default async function LeaguesPage() {
  const u = await getUser();
  return (
    <UserShell u={u}>
      <div className="fade-up">
        <div className="eyebrow">Your leagues</div>
        <h1 className="display mt-0.5 text-3xl font-semibold leading-none tracking-tight text-silver-100">Pick a ballroom</h1>
      </div>
      <ul className="stagger mt-5 space-y-2.5">
        {u.memberships.map((m) => (
          <li key={m.league_id}>
            <Link href={`/l/${m.league.slug}`} className="glass glass-hover flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="display truncate text-lg font-semibold text-silver-100">{m.league.name}</div>
                <div className="mt-0.5 text-xs text-silver-500">
                  Season {m.league.season} · {m.role === "commissioner" ? "Commissioner" : "Member"}
                </div>
              </div>
              <LeagueStatusChip status={m.league.status} />
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/leagues/new" className="btn-ghost mt-6 text-sm">
        <Plus size={16} /> Start another league
      </Link>
    </UserShell>
  );
}

import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getUser } from "@/lib/league";
import { UserShell, PageTitle } from "@/components/shell";
import { LeagueStatusChip } from "@/components/league-status";
import { SHOW_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** My Leagues: the first stop after every sign-in. One card per league; tap to enter. */
export default async function LeaguesPage() {
  const u = await getUser();
  const first = u.profile.display_name.split(" ")[0];

  return (
    <UserShell u={u}>
      <PageTitle eyebrow={`Hi ${first}`} title="My Leagues" meta={u.memberships.length ? `${u.memberships.length} league${u.memberships.length === 1 ? "" : "s"}` : undefined} />

      {u.memberships.length === 0 ? (
        <div className="mx-auto mt-6 max-w-md">
          <p className="fade-up text-sm text-silver-300">
            You&apos;re not in a league yet. {SHOW_NAME} fantasy is played in small private leagues: start one and invite your group, or tap the link a commissioner sent you.
          </p>
          <div className="glass fade-up mt-6 p-5" style={{ animationDelay: "120ms" }}>
            <div className="display text-lg font-semibold text-silver-100">Start a league</div>
            <p className="mt-1 text-sm text-silver-300">Pick a size, name it, share one link. Takes a minute.</p>
            <Link href="/leagues/new" className="btn-gold mt-4 w-full">
              Create a league
            </Link>
          </div>
          <div className="glass fade-up mt-4 p-5" style={{ animationDelay: "200ms" }}>
            <div className="display text-lg font-semibold text-silver-100">Have an invite?</div>
            <p className="mt-1 text-sm text-silver-300">
              Open the link your commissioner shared (it looks like <code className="text-xs text-silver-500">/join/…</code>). You&apos;ll land in the league right away.
            </p>
          </div>
        </div>
      ) : (
        <>
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
                  <ChevronRight size={18} className="text-silver-500" />
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/leagues/new" className="btn-ghost mt-6 text-sm">
            <Plus size={16} /> Start another league
          </Link>
        </>
      )}
    </UserShell>
  );
}

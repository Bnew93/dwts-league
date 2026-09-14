import Link from "next/link";
import { getUser } from "@/lib/league";
import { UserShell, PageTitle, SectionTitle } from "@/components/shell";
import { ConfirmForm } from "@/components/confirm-form";
import { LeagueStatusChip } from "@/components/league-status";
import { updateDisplayName, leaveLeague, deleteAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const u = await getUser();
  const runsSomething = u.memberships.some((m) => m.role === "commissioner");
  return (
    <UserShell u={u}>
      <PageTitle eyebrow={u.isPlatformAdmin ? "Platform admin" : "Account"} title="Account">
        <p className="mt-1 text-sm text-silver-500">{u.user.email}</p>
      </PageTitle>

      <form action={updateDisplayName} className="glass fade-up mt-6 space-y-3 p-5" style={{ animationDelay: "80ms" }}>
        <label className="block text-sm text-silver-300" htmlFor="display_name">
          Display name
        </label>
        <input id="display_name" name="display_name" defaultValue={u.profile.display_name} maxLength={40} required className="input-dark" />
        <button className="btn-gold">Save</button>
      </form>

      <section className="glass fade-up mt-4 p-5" style={{ animationDelay: "140ms" }}>
        <SectionTitle right={<Link href="/leagues/new" className="hover:text-gold-300">+ New league</Link>}>Leagues</SectionTitle>
        {u.memberships.length === 0 ? (
          <p className="text-sm text-silver-500">You&apos;re not in a league yet.</p>
        ) : (
          <ul className="divide-y divide-gold-400/10 text-sm">
            {u.memberships.map((m) => (
              <li key={m.league_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/l/${m.league.slug}`} className="text-silver-100 hover:text-gold-300">
                    {m.league.name}
                  </Link>
                  <div className="text-xs text-silver-500">{m.role === "commissioner" ? "Commissioner" : "Member"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <LeagueStatusChip status={m.league.status} />
                  {m.role === "commissioner" ? (
                    <Link href={`/l/${m.league.slug}/commissioner?tab=more`} className="text-xs text-silver-500 underline hover:text-gold-300">
                      manage
                    </Link>
                  ) : (
                    m.league.status !== "drafting" && (
                      <ConfirmForm
                        action={leaveLeague}
                        message={
                          m.league.status === "setup"
                            ? `Leave ${m.league.name}? Your seat reopens.`
                            : `Leave ${m.league.name}? Your couples return to the Leftovers pool and your standing is gone. This cannot be undone.`
                        }
                      >
                        <input type="hidden" name="league_id" value={m.league_id} />
                        <button className="text-xs text-silver-500 underline hover:text-rose-300">leave</button>
                      </ConfirmForm>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {u.isPlatformAdmin && (
        <p className="mt-4 text-center text-xs text-silver-500">
          <Link href="/admin" className="underline hover:text-gold-300">
            Platform admin dashboard
          </Link>
        </p>
      )}

      <form action="/auth/signout" method="post" className="mt-8 text-center">
        <button className="btn-ghost text-sm">Sign out</button>
      </form>

      <section className="glass mt-10 border-rose-500/30 p-5">
        <SectionTitle>Delete account</SectionTitle>
        <p className="text-sm text-silver-300">
          Removes your Google sign-in and your name from this site. Roster history stays as &ldquo;Departed user&rdquo; so your leagues&apos; seasons still add up.
          {runsSomething && " Transfer the commissioner role in the leagues you run first."}
        </p>
        <ConfirmForm action={deleteAccount} message="Delete your account? This cannot be undone." className="mt-3">
          <button className="btn-danger" disabled={runsSomething}>
            Delete my account
          </button>
        </ConfirmForm>
      </section>

      <p className="mt-8 text-center text-xs text-silver-500">
        <Link href="/legal/privacy" className="hover:text-silver-300">
          Privacy
        </Link>
        {" · "}
        <Link href="/legal/terms" className="hover:text-silver-300">
          Terms
        </Link>
      </p>
    </UserShell>
  );
}

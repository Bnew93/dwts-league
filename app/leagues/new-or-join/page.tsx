import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, homePathFor } from "@/lib/league";
import { UserShell } from "@/components/shell";
import { BRAND, SHOW_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Landing for a signed-in user with no league yet. */
export default async function NewOrJoinPage() {
  const u = await getUser();
  if (u.memberships.length) redirect(homePathFor(u.memberships));
  return (
    <UserShell u={u}>
      <div className="mx-auto max-w-md text-center">
        <div className="fade-up">
          <div className="eyebrow">Welcome to {BRAND}</div>
          <h1 className="display mt-2 text-3xl font-semibold leading-tight tracking-tight text-silver-100">
            Hi {u.profile.display_name.split(" ")[0]}. You&apos;re not in a league yet.
          </h1>
          <p className="mt-3 text-sm text-silver-300">
            {SHOW_NAME} fantasy is played in small private leagues. Start one and invite your group, or tap the link a commissioner sent you.
          </p>
        </div>
        <div className="glass fade-up mt-8 p-5 text-left" style={{ animationDelay: "120ms" }}>
          <div className="display text-lg font-semibold text-silver-100">Start a league</div>
          <p className="mt-1 text-sm text-silver-300">Pick a size, name it, share one link. Takes a minute.</p>
          <Link href="/leagues/new" className="btn-gold mt-4 w-full">
            Create a league
          </Link>
        </div>
        <div className="glass fade-up mt-4 p-5 text-left" style={{ animationDelay: "200ms" }}>
          <div className="display text-lg font-semibold text-silver-100">Have an invite?</div>
          <p className="mt-1 text-sm text-silver-300">
            Open the link your commissioner shared (it looks like <code className="text-xs text-silver-500">/join/…</code>). You&apos;ll land in the league right away.
          </p>
        </div>
      </div>
    </UserShell>
  );
}

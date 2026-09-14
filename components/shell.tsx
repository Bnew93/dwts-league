import { Fragment } from "react";
import Link from "next/link";
import type { Ctx, UserCtx } from "@/lib/league";
import { getPendingReveal } from "@/lib/reveal";
import { Nav, type NavItem, type NavLeague } from "./nav";
import { EliminationReveal } from "./elimination-reveal";
import { FinaleReveal } from "./finale-reveal";

function navLeagues(u: UserCtx): NavLeague[] {
  return u.memberships.map((m) => ({ slug: m.league.slug, name: m.league.name, status: m.league.status }));
}

/** Chrome for league pages (/l/[slug]/*). */
export async function Shell({
  ctx,
  children,
  wide = false,
  bare = false,
  fill = false,
}: {
  ctx: Ctx;
  children: React.ReactNode;
  wide?: boolean;
  /** no max-width / padding on main */
  bare?: boolean;
  /** lock the page to the viewport; children manage their own scrolling */
  fill?: boolean;
}) {
  const { league, profile, isCommissioner, isPlayer, isPlatformAdmin } = ctx;
  const base = `/l/${league.slug}`;
  const items: NavItem[] = [];
  if (league.status === "setup" || league.status === "drafting") items.push({ href: `${base}/draft`, label: "Draft", icon: "draft" });
  items.push({ href: base, label: "Standings", icon: "standings", exact: true });
  if (isPlayer) items.push({ href: `${base}/team`, label: "My Team", icon: "team" });
  items.push({ href: `${base}/bracket`, label: "Bracket", icon: "bracket" });
  if (isCommissioner) items.push({ href: `${base}/commissioner`, label: "Commissioner", icon: "commissioner" });
  if (isPlatformAdmin) items.push({ href: "/admin", label: "Admin", icon: "admin", desktopOnly: true });

  const Wrap = fill ? "div" : Fragment;
  const wrapProps = fill ? { className: "flex h-dvh flex-col overflow-hidden" } : {};
  // Once-per-elimination reveal (skipped in the live draft room, which has its own overlay).
  const reveal = fill ? null : await getPendingReveal(ctx);
  return (
    <Wrap {...wrapProps}>
      {reveal?.type === "finale" && <FinaleReveal reveal={reveal} me={ctx.user.id} leagueId={league.id} />}
      {reveal?.type === "elimination" && <EliminationReveal reveal={reveal} me={ctx.user.id} leagueId={league.id} />}
      <Nav
        items={items}
        league={{ slug: league.slug, name: league.name, status: league.status }}
        leagues={navLeagues(ctx)}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
      />
      {league.is_mock && (
        <div className="bg-gold-400/15 px-4 py-1.5 text-center text-xs text-gold-200">
          Mock draft mode · nothing here counts.
          {isCommissioner && (
            <>
              {" "}
              <Link href={`${base}/commissioner?tab=draft`} className="underline decoration-gold-400/60 hover:text-gold-100">
                End it in Commissioner
              </Link>
            </>
          )}
        </div>
      )}
      <main
        className={
          fill
            ? "min-h-0 w-full flex-1"
            : bare
              ? "w-full pb-20 sm:pb-0"
              : `mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} px-4 pb-24 pt-5 sm:pb-10`
        }
      >
        {children}
      </main>
    </Wrap>
  );
}

/** Chrome for pages outside a league (/leagues, /account, /admin). */
export function UserShell({ u, children, wide = false, items = [] }: { u: UserCtx; children: React.ReactNode; wide?: boolean; items?: NavItem[] }) {
  const nav: NavItem[] = [...items];
  if (u.isPlatformAdmin && !nav.some((i) => i.href === "/admin")) nav.push({ href: "/admin", label: "Admin", icon: "admin", desktopOnly: true });
  return (
    <>
      <Nav items={nav} league={null} leagues={navLeagues(u)} displayName={u.profile.display_name} avatarUrl={u.profile.avatar_url} />
      <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} px-4 pb-24 pt-5 sm:pb-10`}>{children}</main>
    </>
  );
}

/** Page title block with an eyebrow and optional right-side meta. */
export function PageTitle({ eyebrow, title, meta, children }: { eyebrow?: string; title: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="fade-up flex flex-wrap items-end justify-between gap-2">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="display mt-0.5 text-3xl font-semibold leading-none tracking-tight text-silver-100">{title}</h1>
        {children}
      </div>
      {meta && <div className="text-sm text-silver-500">{meta}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="eyebrow">{children}</h2>
      {right && <div className="text-xs text-silver-500">{right}</div>}
    </div>
  );
}

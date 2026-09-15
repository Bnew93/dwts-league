import Link from "next/link";
import type { Ctx, UserCtx } from "@/lib/league";
import { getPendingReveal } from "@/lib/reveal";
import { Nav, type NavItem, type NavLeague } from "./nav";
import { HOME_ITEM, leagueNavItems } from "./nav-items";
import { EliminationReveal } from "./elimination-reveal";
import { FinaleReveal } from "./finale-reveal";

/** Header height (and the mock-mode banner's); pages that lock to the viewport (draft room) subtract them. */
export const NAV_HEIGHT_PX = 55;
const MOCK_BANNER_PX = 28;

function navLeagues(u: UserCtx): NavLeague[] {
  return u.memberships.map((m) => ({ slug: m.league.slug, name: m.league.name, status: m.league.status }));
}

/** The nav for league pages. Rendered by app/l/[slug]/layout so it persists across tab changes. */
export function LeagueNav({ ctx }: { ctx: Ctx }) {
  const { league, profile, isCommissioner, isPlayer, isPlatformAdmin } = ctx;
  const items: NavItem[] = [HOME_ITEM, ...leagueNavItems({ slug: league.slug, status: league.status, isPlayer, isCommissioner })];
  if (isPlatformAdmin) items.push({ href: "/admin", label: "Admin", icon: "admin", desktopOnly: true });
  return (
    <>
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
              <Link href={`/l/${league.slug}/commissioner?tab=draft`} className="underline decoration-gold-400/60 hover:text-gold-100">
                End it in Commissioner
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Content wrapper for league pages: reveal overlays + main. The nav comes from the layout. */
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
  /** lock the page to the viewport below the nav; children manage their own scrolling */
  fill?: boolean;
}) {
  // Once-per-elimination reveal (skipped in the live draft room, which has its own overlay).
  const reveal = fill ? null : await getPendingReveal(ctx);
  return (
    <>
      {reveal?.type === "finale" && <FinaleReveal reveal={reveal} me={ctx.user.id} leagueId={ctx.league.id} />}
      {reveal?.type === "elimination" && <EliminationReveal reveal={reveal} me={ctx.user.id} leagueId={ctx.league.id} />}
      <main
        className={
          fill
            ? "flex min-h-0 w-full flex-col overflow-hidden"
            : bare
              ? "w-full pb-20 sm:pb-0"
              : `mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} overflow-x-clip px-4 pb-24 pt-5 sm:pb-10`
        }
        style={fill ? { height: `calc(100dvh - ${NAV_HEIGHT_PX + (ctx.league.is_mock ? MOCK_BANNER_PX : 0)}px)` } : undefined}
      >
        {children}
      </main>
    </>
  );
}

/**
 * The nav for pages outside a league (/leagues, /account, /admin). Keeps the current league's
 * tabs so there is always a way back in; admin pages pass their own items instead.
 */
export function UserNav({ u, items }: { u: UserCtx; items?: NavItem[] }) {
  const nav: NavItem[] = [HOME_ITEM];
  if (items) nav.push(...items);
  else if (u.current) {
    const c = u.current;
    nav.push(...leagueNavItems({ slug: c.league.slug, status: c.league.status, isPlayer: c.is_player, isCommissioner: c.role === "commissioner" }));
  }
  if (u.isPlatformAdmin && !nav.some((i) => i.href === "/admin")) nav.push({ href: "/admin", label: "Admin", icon: "admin", desktopOnly: true });
  return <Nav items={nav} league={null} leagues={navLeagues(u)} displayName={u.profile.display_name} avatarUrl={u.profile.avatar_url} />;
}

export function UserMain({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} overflow-x-clip px-4 pb-24 pt-5 sm:pb-10`}>{children}</main>;
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

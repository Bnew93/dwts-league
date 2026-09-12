import { Fragment } from "react";
import Link from "next/link";
import type { Ctx } from "@/lib/league";
import { Nav, type NavItem } from "./nav";

export function Shell({
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
  const { league, profile, isCommissioner } = ctx;
  const items: NavItem[] = [];
  if (league.draft_status !== "complete") items.push({ href: "/draft", label: "Draft", icon: "draft" });
  items.push({ href: "/standings", label: "Standings", icon: "standings" });
  items.push({ href: "/team", label: "My Team", icon: "team" });
  items.push({ href: "/bracket", label: "Bracket", icon: "bracket" });
  if (isCommissioner) items.push({ href: "/admin", label: "Admin", icon: "admin" });

  const Wrap = fill ? "div" : Fragment;
  const wrapProps = fill ? { className: "flex h-dvh flex-col overflow-hidden" } : {};
  return (
    <Wrap {...wrapProps}>
      <Nav items={items} leagueName={league.name} displayName={profile.display_name} avatarUrl={profile.avatar_url} />
      {league.is_mock && (
        <div className="bg-gold-400/15 px-4 py-1.5 text-center text-xs text-gold-200">
          Mock draft mode · nothing here counts.
          {isCommissioner && (
            <>
              {" "}
              <Link href="/admin" className="underline decoration-gold-400/60 hover:text-gold-100">
                End it in Admin
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

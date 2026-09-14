"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, Users, GitBranch, Shield, Sparkles, Gavel, ChevronDown, Home, type LucideIcon } from "lucide-react";
import { Mirrorball } from "./mirrorball";
import { BRAND } from "@/lib/brand";
import type { LeagueStatus } from "@/lib/league";

export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "draft" | "standings" | "team" | "bracket" | "commissioner" | "admin";
  /** match only the exact path (league home) */
  exact?: boolean;
  /** keep the phone tab bar to five: platform-level links live on the wide layout only */
  desktopOnly?: boolean;
};
export type NavLeague = { slug: string; name: string; status: LeagueStatus };

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  home: Home,
  draft: Sparkles,
  standings: Trophy,
  team: Users,
  bracket: GitBranch,
  commissioner: Gavel,
  admin: Shield,
};

/** Top bar on wide screens, bottom tab bar on phones. Active route glows gold. */
export function Nav({
  items,
  league,
  leagues,
  displayName,
  avatarUrl,
}: {
  items: NavItem[];
  league: NavLeague | null;
  leagues: NavLeague[];
  displayName: string;
  avatarUrl: string | null;
}) {
  const path = usePathname();
  const active = (it: NavItem) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/"));
  const switcher = leagues.length > 1;

  return (
    <>
      <header className="sticky top-0 z-20 border-b hairline bg-plum-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/leagues" className="flex shrink-0 items-center gap-2.5" title="My Leagues">
              <Mirrorball size={30} />
              <span className={`display text-[15px] font-semibold italic tracking-tight sm:inline sm:text-lg ${league ? "hidden" : ""}`}>
                <span className="gold-text">{BRAND}</span>
              </span>
            </Link>
            {league &&
              (switcher ? (
                <details className="relative min-w-0">
                  <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1 rounded-lg border hairline bg-plum-900/60 px-2.5 py-1 text-sm text-silver-100">
                    <span className="truncate">{league.name}</span>
                    <ChevronDown size={14} className="shrink-0 text-silver-500" />
                  </summary>
                  <ul className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border hairline bg-plum-950/95 p-1 shadow-xl backdrop-blur">
                    {leagues.map((l) => (
                      <li key={l.slug}>
                        <Link
                          href={`/l/${l.slug}`}
                          className={`block truncate rounded-lg px-3 py-2 text-sm ${l.slug === league.slug ? "bg-gold-400/15 text-gold-200" : "text-silver-300 hover:bg-gold-400/10"}`}
                        >
                          {l.name}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href="/leagues" className="block rounded-lg px-3 py-2 text-sm text-silver-500 hover:bg-gold-400/10">
                        All my leagues
                      </Link>
                    </li>
                    <li>
                      <Link href="/leagues/new" className="block rounded-lg px-3 py-2 text-sm text-silver-500 hover:bg-gold-400/10">
                        + New league
                      </Link>
                    </li>
                  </ul>
                </details>
              ) : (
                <span className="truncate text-sm text-silver-300 sm:border-l sm:border-gold-400/20 sm:pl-2.5">{league.name}</span>
              ))}
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {items.map((it) => {
              const Icon = ICONS[it.icon];
              const on = active(it);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    on ? "text-gold-300" : "text-silver-300 hover:bg-gold-400/10 hover:text-silver-100"
                  }`}
                >
                  <Icon size={15} />
                  {it.label}
                  {on && <span className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-gold-400 shadow-[0_0_10px_rgb(233_194_80/0.9)]" />}
                </Link>
              );
            })}
          </nav>
          <Link href="/account" className="flex shrink-0 items-center gap-2 rounded-full border hairline bg-plum-900/60 py-1 pl-1 pr-3 text-sm text-silver-300 transition-colors hover:border-gold-400/60 hover:text-silver-100">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-[11px] font-bold text-plum-950">{displayName.slice(0, 1)}</span>
            )}
            <span className="hidden max-w-[9rem] truncate sm:inline">{displayName}</span>
          </Link>
        </div>
      </header>

      {items.some((i) => !i.desktopOnly) && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t hairline bg-plum-950/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
          <div className="flex">
            {items
              .filter((i) => !i.desktopOnly)
              .map((it) => {
                const Icon = ICONS[it.icon];
                const on = active(it);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                      on ? "text-gold-300" : "text-silver-500 active:text-silver-100"
                    }`}
                  >
                    {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold-400 shadow-[0_0_10px_rgb(233_194_80/0.9)]" />}
                    <Icon size={20} strokeWidth={on ? 2.4 : 1.8} />
                    {it.label === "Commissioner" ? "Commish" : it.label}
                  </Link>
                );
              })}
          </div>
        </nav>
      )}
    </>
  );
}

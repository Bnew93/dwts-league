"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, Users, GitBranch, Shield, Sparkles, type LucideIcon } from "lucide-react";
import { Mirrorball } from "./mirrorball";

export type NavItem = { href: string; label: string; icon: "draft" | "standings" | "team" | "bracket" | "admin" };
const ICONS: Record<NavItem["icon"], LucideIcon> = {
  draft: Sparkles,
  standings: Trophy,
  team: Users,
  bracket: GitBranch,
  admin: Shield,
};

/** Top bar on wide screens, bottom tab bar on phones. Active route glows gold. */
export function Nav({ items, leagueName, displayName, avatarUrl }: { items: NavItem[]; leagueName: string; displayName: string; avatarUrl: string | null }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <>
      <header className="sticky top-0 z-20 border-b hairline bg-plum-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/" className="group flex items-center gap-2.5">
            <Mirrorball size={30} />
            <span className="display text-lg font-semibold tracking-tight">
              <span className="gold-text">{leagueName}</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {items.map((it) => {
              const Icon = ICONS[it.icon];
              const on = active(it.href);
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
          <Link href="/profile" className="flex items-center gap-2 rounded-full border hairline bg-plum-900/60 py-1 pl-1 pr-3 text-sm text-silver-300 transition-colors hover:border-gold-400/60 hover:text-silver-100">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-[11px] font-bold text-plum-950">{displayName.slice(0, 1)}</span>
            )}
            <span className="max-w-[9rem] truncate">{displayName}</span>
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t hairline bg-plum-950/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="flex">
          {items.map((it) => {
            const Icon = ICONS[it.icon];
            const on = active(it.href);
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
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

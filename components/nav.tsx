import Link from "next/link";
import type { Ctx } from "@/lib/league";

/** Bottom tab bar on phones, top bar on wider screens. Draft tab hidden once complete (§1.1). */
export function Nav({ ctx }: { ctx: Ctx }) {
  const { league, profile, isCommissioner } = ctx;
  const items: { href: string; label: string }[] = [];
  if (league.draft_status !== "complete") items.push({ href: "/draft", label: "Draft" });
  items.push({ href: "/standings", label: "Standings" });
  items.push({ href: "/team", label: "My Team" });
  items.push({ href: "/bracket", label: "Bracket" });
  if (isCommissioner) items.push({ href: "/admin", label: "Admin" });

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span>🪩</span>
          <span>{league.name}</span>
        </Link>
        <nav className="hidden gap-1 sm:flex">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {it.label}
            </Link>
          ))}
        </nav>
        <Link href="/profile" className="text-sm text-zinc-300 hover:text-white">
          {profile.display_name}
        </Link>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-800 bg-zinc-950/95 backdrop-blur sm:hidden">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex-1 py-3 text-center text-xs font-medium text-zinc-300 active:bg-zinc-800"
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

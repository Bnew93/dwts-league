import type { NavItem } from "./nav";
import type { LeagueStatus } from "@/lib/league";

export const HOME_ITEM: NavItem = { href: "/leagues", label: "Home", icon: "home", exact: true };

/** The league tabs for one league. Draft stands in for Standings until the draft is done. */
export function leagueNavItems(l: { slug: string; status: LeagueStatus; isPlayer: boolean; isCommissioner: boolean }): NavItem[] {
  const base = `/l/${l.slug}`;
  const items: NavItem[] = [];
  if (l.status === "setup" || l.status === "drafting") items.push({ href: `${base}/draft`, label: "Draft", icon: "draft" });
  else items.push({ href: base, label: "Standings", icon: "standings", exact: true });
  if (l.isPlayer) items.push({ href: `${base}/team`, label: "My Team", icon: "team" });
  items.push({ href: `${base}/bracket`, label: "Bracket", icon: "bracket" });
  if (l.isCommissioner) items.push({ href: `${base}/commissioner`, label: "Commissioner", icon: "commissioner" });
  return items;
}

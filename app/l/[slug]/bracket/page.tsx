import Link from "next/link";
import { getCtx } from "@/lib/league";
import { Shell, PageTitle } from "@/components/shell";
import { CoupleFace } from "@/components/couple";
import { loadSeason, ownershipHistory, currentOwners, weekInfo } from "@/lib/queries";
import { OWNER_BG, OWNER_TEXT, ownerIndex } from "@/lib/colors";
import type { Couple } from "@/lib/types";

export const dynamic = "force-dynamic";

type Cell = { w: number; state: "alive" | "out" | "gone" | "future"; color: string; trophy: boolean };
type Row = { couple: Couple; alive: boolean; cells: Cell[] };
type Group = { uid: string | null; label: string; color: string; rows: Row[] };

export default async function BracketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCtx(slug);
  const { league, members } = ctx;
  const drafted = league.status === "active" || league.status === "complete";
  const { couples, events, episodes } = await loadSeason(league);
  const { weeks, aired, current } = weekInfo(episodes);
  const owners = currentOwners(events);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";
  const idx = (id: string | null | undefined) => (id ? ownerIndex(league.draft_order, id, members) % OWNER_BG.length : -1);
  const finale = weeks[weeks.length - 1];

  const order = league.draft_order ?? ctx.players.map((m) => m.id);
  const sortRows = (rows: Couple[]) =>
    [...rows].sort(
      (a, b) => (a.placement ?? 999) - (b.placement ?? 999) || (b.elimination_week ?? 999) - (a.elimination_week ?? 999) || a.cast_order - b.cast_order,
    );
  const ownerAt = (coupleId: string, w: number) => {
    const hist = ownershipHistory(events, coupleId);
    const h = hist.find((h) => w >= h.joined_week && (h.left_week === null || w < h.left_week));
    return h?.user_id ?? null;
  };
  const toRow = (c: Couple): Row => ({
    couple: c,
    alive: c.status === "active" || c.status === "finalist",
    cells: weeks.map((w) => {
      const ended = c.elimination_week != null && w > c.elimination_week;
      const dies = c.elimination_week === w && (c.status === "eliminated" || c.status === "withdrew");
      const o = drafted ? ownerAt(c.id, w) : null;
      return {
        w,
        state: ended ? "gone" : dies ? "out" : aired.has(w) ? "alive" : "future",
        color: o ? OWNER_BG[idx(o)] : owners.has(c.id) ? OWNER_BG[idx(owners.get(c.id))] : "bg-silver-500/60",
        trophy: c.placement === 1 && w === finale,
      };
    }),
  });

  const lastOwner = (c: Couple) => {
    const hist = ownershipHistory(events, c.id);
    return hist.length ? hist[hist.length - 1].user_id : null;
  };
  const groups: Group[] = [
    ...order.map((uid) => ({ uid, label: nameOf(uid), color: OWNER_TEXT[idx(uid)], rows: sortRows(couples.filter((c) => lastOwner(c) === uid)).map(toRow) })),
    { uid: null, label: "Leftovers", color: "text-silver-500", rows: sortRows(couples.filter((c) => lastOwner(c) === null)).map(toRow) },
  ].filter((g) => g.rows.length);

  const stripCols = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` };

  return (
    <Shell ctx={ctx} wide>
      <PageTitle eyebrow="Season progression" title="Bracket" meta={aired.size ? `${aired.size} of ${weeks.length} weeks aired` : "Pre-season"} />
      {!drafted && <p className="mt-3 text-sm text-silver-500">Lanes take their owner colors once the draft is complete.</p>}

      {/* Phones: every week fits in one strip beside the name, no sideways scroll. */}
      <div className="glass fade-up mt-5 py-3 sm:hidden" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center px-3 text-[11px] text-silver-500">
          <span className="flex-1">Couple</span>
          <div className="grid w-[176px] flex-none gap-0.5 text-center" style={stripCols}>
            {weeks.map((w) => (
              <span key={w} className={w === current && !aired.has(w) ? "font-semibold text-gold-300" : aired.has(w) ? "text-silver-300" : ""}>
                {w === finale ? "F" : w}
              </span>
            ))}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.uid ?? "leftovers"} className="mt-2">
            <div className={`px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${g.color}`}>
              {g.label}
              {g.uid && <span className="ml-1.5 font-normal normal-case tracking-normal text-silver-500">· {g.rows.filter((r) => r.alive).length} dancing</span>}
            </div>
            {g.rows.map((r) => (
              <Link key={r.couple.id} href={`/l/${slug}/couples/${r.couple.id}`} className="flex items-center gap-2 px-3 py-1 active:bg-gold-400/10">
                <CoupleFace couple={r.couple} size={24} ring={r.alive ? "ring-gold-400/50" : "ring-silver-500/30"} />
                <span className={`min-w-0 flex-1 truncate text-[13px] ${r.alive ? "text-silver-100" : "text-silver-500"}`}>{r.couple.celebrity}</span>
                <div className="grid w-[176px] flex-none gap-0.5" style={stripCols}>
                  {r.cells.map((cell) => (
                    <span
                      key={cell.w}
                      className={`flex h-5 items-center justify-center rounded-[3px] text-[10px] font-bold ${
                        cell.state === "alive"
                          ? `${cell.color} text-white`
                          : cell.state === "out"
                            ? "bg-plum-950/80 text-silver-300 ring-1 ring-inset ring-silver-500/30"
                            : cell.state === "future"
                              ? `${cell.color} opacity-20`
                              : ""
                      }`}
                    >
                      {cell.trophy ? "🏆" : cell.state === "out" ? "✕" : ""}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Tablet and up: the full table. */}
      <div className="glass fade-up mt-5 hidden overflow-x-auto px-3 py-3 sm:block" style={{ animationDelay: "80ms" }}>
        <table className="border-separate border-spacing-y-1 text-xs" style={{ minWidth: 260 + weeks.length * 42 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-plum-900/95 pl-2 pr-3 text-left font-medium text-silver-500 backdrop-blur">Couple</th>
              {weeks.map((w) => (
                <th
                  key={w}
                  className={`w-10 text-center font-semibold ${
                    w === current && !aired.has(w) ? "text-gold-300" : aired.has(w) ? "text-silver-300" : "text-silver-500/60"
                  }`}
                >
                  {w === current && !aired.has(w) && <span className="mx-auto mb-0.5 block h-1 w-1 rounded-full bg-gold-400 shadow-[0_0_8px_rgb(233_194_80)]" />}
                  {w === finale ? "F" : w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.uid ?? "leftovers"} slug={slug} label={g.label} color={g.color} rows={g.rows} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-silver-500">
        {order.map((uid) => (
          <span key={uid} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${OWNER_BG[idx(uid)]}`} /> {nameOf(uid)}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-silver-500/60" /> Leftovers
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-silver-500/60 opacity-30" /> upcoming
        </span>
        <span>✕ eliminated · F finale</span>
      </div>
    </Shell>
  );
}

function GroupRows({ slug, label, color, rows }: { slug: string; label: string; color: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td colSpan={99} className={`sticky left-0 pl-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] ${color}`}>
          {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.couple.id} className="group">
          <td className="sticky left-0 z-10 bg-plum-900/95 pl-2 pr-3 backdrop-blur">
            <Link href={`/l/${slug}/couples/${r.couple.id}`} className="flex w-[230px] items-center gap-2 py-0.5 hover:underline">
              <CoupleFace couple={r.couple} size={30} ring={r.alive ? "ring-gold-400/50" : "ring-silver-500/30"} />
              <span className={`truncate ${r.alive ? "text-silver-100" : "text-silver-500"}`}>
                {r.couple.celebrity}
                <span className="text-silver-500/70"> · {r.couple.professional.split(" ")[0]}</span>
              </span>
            </Link>
          </td>
          {r.cells.map((cell) => (
            <td key={cell.w} className="p-0">
              <div
                className={`mx-auto flex h-7 w-9 items-center justify-center rounded-[5px] text-[11px] font-bold transition-transform group-hover:scale-[1.04] ${
                  cell.state === "alive"
                    ? `${cell.color} text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]`
                    : cell.state === "out"
                      ? "bg-plum-950/80 text-silver-300 ring-1 ring-inset ring-silver-500/30"
                      : cell.state === "future"
                        ? `${cell.color} opacity-20`
                        : ""
                }`}
                title={`Week ${cell.w}`}
              >
                {cell.trophy ? "🏆" : cell.state === "out" ? "✕" : ""}
              </div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

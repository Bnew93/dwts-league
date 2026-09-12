import Link from "next/link";
import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";
import { loadSeason, ownershipHistory, currentOwners, weekInfo } from "@/lib/queries";
import { OWNER_BG, OWNER_TEXT, ownerIndex } from "@/lib/colors";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const ctx = await getCtx();
  const { league, members } = ctx;
  const { couples, events, episodes } = await loadSeason(league.id, league.season);
  const { weeks, aired, current } = weekInfo(episodes);
  const owners = currentOwners(events);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";
  const idx = (id: string | null | undefined) => (id ? ownerIndex(league.draft_order, id, members) % OWNER_BG.length : -1);

  // Row order: by owner in draft order, then leftovers. Within owner: alive first, then by elimination week desc.
  const order = league.draft_order ?? members.map((m) => m.id);
  const groups = [
    ...order.map((uid) => ({
      uid,
      rows: couples.filter((c) => {
        const hist = ownershipHistory(events, c.id);
        return (hist.length ? hist[hist.length - 1].user_id : null) === uid;
      }),
    })),
    { uid: null as string | null, rows: couples.filter((c) => ownershipHistory(events, c.id).length === 0) },
  ].filter((g) => g.rows.length);

  const sortRows = <T extends { elimination_week: number | null; placement: number | null; cast_order: number }>(rows: T[]) =>
    [...rows].sort(
      (a, b) =>
        (a.placement ?? 999) - (b.placement ?? 999) ||
        (b.elimination_week ?? 999) - (a.elimination_week ?? 999) ||
        a.cast_order - b.cast_order,
    );

  // owner of a couple during week w (replacement couples change lanes)
  const ownerAt = (coupleId: string, w: number) => {
    const hist = ownershipHistory(events, coupleId);
    const h = hist.find((h) => w >= h.joined_week && (h.left_week === null || w < h.left_week));
    return h?.user_id ?? null;
  };

  return (
    <Shell ctx={ctx}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Bracket</h1>
        <span className="text-sm text-zinc-400">{aired.size ? `${aired.size} of ${weeks.length} weeks aired` : "pre-season"}</span>
      </div>

      {league.draft_status !== "complete" && (
        <p className="mt-3 text-sm text-zinc-400">Lanes get their owner colors once the draft is complete.</p>
      )}

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <table className="border-separate border-spacing-y-1 text-xs" style={{ minWidth: 220 + weeks.length * 40 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-950 pr-3 text-left font-medium text-zinc-500">Couple</th>
              {weeks.map((w) => (
                <th
                  key={w}
                  className={`w-10 text-center font-medium ${w === current && !aired.has(w) ? "text-mirror" : aired.has(w) ? "text-zinc-300" : "text-zinc-600"}`}
                >
                  {w === weeks[weeks.length - 1] ? "F" : w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.uid ?? "leftovers"}
                label={g.uid ? nameOf(g.uid) : "Leftovers"}
                color={g.uid ? OWNER_TEXT[idx(g.uid)] : "text-zinc-500"}
                rows={sortRows(g.rows).map((c) => ({
                  id: c.id,
                  name: c.celebrity,
                  pro: c.professional,
                  alive: c.status === "active" || c.status === "finalist",
                  elimWeek: c.elimination_week,
                  placement: c.placement,
                  cells: weeks.map((w) => {
                    const ended = c.elimination_week != null && w > c.elimination_week;
                    const dies = c.elimination_week === w && (c.status === "eliminated" || c.status === "withdrew");
                    const o = league.draft_status === "complete" ? ownerAt(c.id, w) : null;
                    return {
                      w,
                      state: ended ? "gone" : dies ? "out" : aired.has(w) ? "alive" : "future",
                      color: o ? OWNER_BG[idx(o)] : owners.has(c.id) ? OWNER_BG[idx(owners.get(c.id))] : "bg-zinc-600",
                      trophy: c.placement === 1 && w === weeks[weeks.length - 1],
                    } as const;
                  }),
                }))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
        {order.map((uid) => (
          <span key={uid} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${OWNER_BG[idx(uid)]}`} /> {nameOf(uid)}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-600" /> Leftovers
        </span>
        <span>✕ eliminated · F finale</span>
      </div>
    </Shell>
  );
}

type Cell = { w: number; state: "alive" | "out" | "gone" | "future"; color: string; trophy: boolean };
type Row = { id: string; name: string; pro: string; alive: boolean; elimWeek: number | null; placement: number | null; cells: Cell[] };

function GroupRows({ label, color, rows }: { label: string; color: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td colSpan={99} className={`sticky left-0 pt-3 text-[11px] font-semibold uppercase tracking-wide ${color}`}>
          {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="sticky left-0 z-10 bg-zinc-950 pr-3">
            <Link href={`/couples/${r.id}`} className={`block max-w-[200px] truncate hover:underline ${r.alive ? "text-zinc-100" : "text-zinc-500"}`}>
              {r.name}
              <span className="text-zinc-600"> · {r.pro.split(" ")[0]}</span>
            </Link>
          </td>
          {r.cells.map((cell) => (
            <td key={cell.w} className="p-0">
              <div
                className={`mx-auto flex h-6 w-9 items-center justify-center rounded-sm text-[11px] font-bold ${
                  cell.state === "alive"
                    ? `${cell.color} text-white`
                    : cell.state === "out"
                      ? "bg-zinc-800 text-zinc-300"
                      : cell.state === "future"
                        ? `${cell.color} opacity-25`
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

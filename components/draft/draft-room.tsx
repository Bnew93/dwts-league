"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Timer, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildBoard, pickOwner, roundOf, secondsLeft, leftoverCount } from "@/lib/draft";
import type { League, Profile } from "@/lib/league";
import { LEAGUE_COLUMNS } from "@/lib/league-columns";
import type { Couple, DraftPick } from "@/lib/types";
import { makePick, serverNow } from "@/app/draft/actions";

type Props = {
  league: League;
  members: Profile[];
  me: string;
  isCommissioner: boolean;
  initialCouples: Couple[];
  initialPicks: DraftPick[];
};

type Tab = "available" | "board" | "team";

const OWNER_COLORS = ["bg-sky-500", "bg-rose-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-teal-500"];

export function DraftRoom({ league: initialLeague, members, me, isCommissioner, initialCouples, initialPicks }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [league, setLeague] = useState(initialLeague);
  const [couples, setCouples] = useState(initialCouples);
  const [picks, setPicks] = useState(initialPicks);
  const [tab, setTab] = useState<Tab>("available");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Couple | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const skew = useRef(0); // serverNow − clientNow

  const order = league.draft_order ?? [];
  const nameOf = useCallback(
    (id: string) => members.find((m) => m.id === id)?.display_name ?? "—",
    [members],
  );
  const colorOf = (id: string) => OWNER_COLORS[Math.max(0, order.indexOf(id)) % OWNER_COLORS.length];

  // ---- refetch from server (RLS applies) --------------------------------
  const refetch = useCallback(async () => {
    const [l, c, p] = await Promise.all([
      supabase
        .from("leagues")
        .select(LEAGUE_COLUMNS)
        .eq("id", league.id)
        .single(),
      supabase.from("couples").select("*").eq("league_id", league.id).order("cast_order"),
      supabase.from("draft_picks").select("*").eq("league_id", league.id).order("pick_no"),
    ]);
    if (l.data) setLeague(l.data as League);
    if (c.data) setCouples(c.data as Couple[]);
    if (p.data) setPicks(p.data as DraftPick[]);
  }, [supabase, league.id]);

  // ---- realtime ------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`league:${league.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_picks", filter: `league_id=eq.${league.id}` }, refetch)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leagues", filter: `id=eq.${league.id}` }, refetch)
      .subscribe();
    // safety net: poll while live (auto-picks by cron arrive via the same channel, this covers dropped sockets)
    const poll = setInterval(refetch, 10_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, league.id, refetch]);

  // ---- clock ---------------------------------------------------------------
  useEffect(() => {
    serverNow().then((s) => (skew.current = s - Date.now())).catch(() => {});
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (league.draft_status === "complete") router.push("/standings");
  }, [league.draft_status, router]);

  // ---- derived -------------------------------------------------------------
  const pickNo = league.current_pick + 1;
  const totalPicks = league.roster_size * order.length;
  const onClock = order.length ? pickOwner(order, pickNo) : null;
  // Mock mode: the commissioner picks on behalf of proxy members.
  const isProxy = (id: string) => members.find((m) => m.id === id)?.is_mock === true;
  const canProxy = isCommissioner && league.is_mock;
  const actingAs = onClock && (onClock === me || (canProxy && isProxy(onClock))) ? onClock : null;
  const myTurn = actingAs !== null;
  const teamOf = actingAs && actingAs !== me ? actingAs : me;
  const left = secondsLeft(league.turn_started_at, league.pick_seconds, Date.now() + skew.current);
  void tick;

  const takenIds = useMemo(() => new Set(picks.map((p) => p.couple_id)), [picks]);
  const coupleById = useMemo(() => new Map(couples.map((c) => [c.id, c])), [couples]);
  const available = couples.filter((c) => c.status === "active" && !takenIds.has(c.id));
  const filtered = available.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || `${c.celebrity} ${c.professional} ${c.notability ?? ""}`.toLowerCase().includes(q);
  });
  const myPicks = picks.filter((p) => p.user_id === teamOf);
  const board = buildBoard(order, league.roster_size);
  const pickAt = (n: number) => picks.find((p) => p.pick_no === n);
  const leftovers = leftoverCount(available.length + takenIds.size, order.length, league.roster_size);
  // couples that will be undrafted if everyone auto-picks from here: the highest cast_order ones
  const leftoverPreview = [...available].sort((a, b) => b.cast_order - a.cast_order).slice(0, leftovers);

  // ---- actions -------------------------------------------------------------
  function submitPick(c: Couple) {
    startTransition(async () => {
      const res = await makePick(c.id, actingAs && actingAs !== me ? actingAs : undefined);
      setConfirm(null);
      if (!res.ok) {
        setToast(res.error);
        setTimeout(() => setToast(null), 3500);
      }
      await refetch();
    });
  }

  // ---- render --------------------------------------------------------------
  return (
    <div className="-mx-4 sm:mx-0">
      {/* On the clock */}
      <div
        className={`sticky top-[49px] z-10 border-b px-4 py-3 backdrop-blur ${
          myTurn ? "border-mirror/50 bg-mirror/15" : "border-zinc-800 bg-zinc-950/90"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              Pick {pickNo} of {totalPicks} · Round {roundOf(pickNo, order.length)}
            </div>
            <div className="truncate text-lg font-semibold">
              {actingAs === me
                ? "You're on the clock"
                : actingAs
                  ? `Pick for ${nameOf(actingAs)}`
                  : `${onClock ? nameOf(onClock) : "—"} is picking`}
            </div>
            {league.is_mock && (
              <div className="text-xs text-amber-300">Mock draft · you control the proxies</div>
            )}
          </div>
          <div
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-2xl tabular-nums ${
              left <= 10 ? "bg-red-900/60 text-red-200" : "bg-zinc-800 text-zinc-100"
            }`}
          >
            <Timer size={18} />
            {String(Math.floor(left / 60)).padStart(1, "0")}:{String(left % 60).padStart(2, "0")}
          </div>
        </div>
        <div className="mt-2 flex gap-1 text-xs">
          {order.map((id) => (
            <span
              key={id}
              className={`rounded px-2 py-0.5 ${id === onClock ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
            >
              <span className={`mr-1 inline-block h-2 w-2 rounded-full ${colorOf(id)}`} />
              {nameOf(id)}
            </span>
          ))}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex border-b border-zinc-800 text-sm sm:hidden">
        {(["available", "board", "team"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 capitalize ${tab === t ? "border-b-2 border-mirror text-white" : "text-zinc-400"}`}
          >
            {t === "team" ? "My team" : t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 px-4 pt-4 sm:grid-cols-[1fr_1.2fr_0.9fr] sm:px-0">
        {/* Available */}
        <section className={tab === "available" ? "" : "hidden sm:block"}>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search couples"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-base"
            />
          </div>
          <ul className="mt-3 space-y-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => myTurn && setConfirm(c)}
                  disabled={!myTurn || pending}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${
                    myTurn
                      ? "border-zinc-700 bg-zinc-900 active:bg-zinc-800 hover:border-mirror/60"
                      : "border-zinc-800 bg-zinc-900/40 opacity-80"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-lg">
                    {c.celebrity.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.celebrity}</div>
                    <div className="truncate text-xs text-zinc-400">with {c.professional}</div>
                    <div className="truncate text-xs text-zinc-500">{c.notability}</div>
                  </div>
                  <span className="text-xs text-zinc-600">#{c.cast_order}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="py-6 text-center text-zinc-500">No couples match.</li>}
          </ul>
        </section>

        {/* Board */}
        <section className={tab === "board" ? "" : "hidden sm:block"}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Board</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="w-8 text-left text-zinc-500">Rd</th>
                  {order.map((id) => (
                    <th key={id} className="text-left font-medium text-zinc-300">
                      <span className={`mr-1 inline-block h-2 w-2 rounded-full ${colorOf(id)}`} />
                      {nameOf(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.map((row, r) => (
                  <tr key={r}>
                    <td className="text-zinc-500">{r + 1}</td>
                    {order.map((uid) => {
                      const cell = row.find((c) => c.userId === uid)!;
                      const p = pickAt(cell.pickNo);
                      const c = p ? coupleById.get(p.couple_id) : undefined;
                      const isNow = cell.pickNo === pickNo && league.draft_status === "live";
                      return (
                        <td
                          key={uid}
                          className={`h-14 rounded-md border p-1.5 align-top ${
                            isNow
                              ? "border-mirror bg-mirror/10"
                              : p
                                ? "border-zinc-700 bg-zinc-900"
                                : "border-zinc-800/60 bg-zinc-900/30"
                          }`}
                        >
                          <div className="text-[10px] text-zinc-500">#{cell.pickNo}</div>
                          {c ? (
                            <>
                              <div className="truncate font-medium text-zinc-100">{c.celebrity}</div>
                              <div className="truncate text-zinc-500">
                                {c.professional}
                                {p?.auto && " · auto"}
                              </div>
                            </>
                          ) : isNow ? (
                            <div className="text-mirror">on the clock</div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* My team + leftovers */}
        <section className={tab === "team" ? "" : "hidden sm:block"}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {teamOf === me ? "My team" : `${nameOf(teamOf)}'s team`}
          </h2>
          <ul className="mt-3 space-y-2">
            {myPicks.map((p) => {
              const c = coupleById.get(p.couple_id);
              return (
                <li key={p.id} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                  <div className="font-medium">{c?.celebrity}</div>
                  <div className="text-xs text-zinc-400">
                    with {c?.professional} · Rd {p.round}, pick {p.pick_no}
                    {p.auto && " · auto-pick"}
                  </div>
                </li>
              );
            })}
            {Array.from({ length: Math.max(0, league.roster_size - myPicks.length) }).map((_, i) => (
              <li key={`empty-${i}`} className="rounded-lg border border-dashed border-zinc-800 p-3 text-xs text-zinc-600">
                Round {myPicks.length + i + 1}
              </li>
            ))}
          </ul>

          {leftovers > 0 && (
            <>
              <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Leftovers preview · {leftovers}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">Undrafted if every remaining pick goes by cast order.</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                {leftoverPreview.map((c) => (
                  <li key={c.id}>
                    {c.celebrity} <span className="text-zinc-600">· {c.professional}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              Round {roundOf(pickNo, order.length)} · Pick {pickNo}
              {actingAs && actingAs !== me && ` · for ${nameOf(actingAs)}`}
            </div>
            <div className="mt-1 text-xl font-semibold">{confirm.celebrity}</div>
            <div className="text-sm text-zinc-400">with {confirm.professional}</div>
            <div className="mt-1 text-xs text-zinc-500">{confirm.notability}</div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 px-4 py-2.5"
              >
                <X size={16} /> Cancel
              </button>
              <button
                onClick={() => submitPick(confirm)}
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-mirror px-4 py-2.5 font-medium text-zinc-900 disabled:opacity-60"
              >
                <Check size={16} /> {pending ? "Picking…" : "Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-20 z-40 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-center text-sm text-red-100 sm:bottom-6 sm:left-1/2 sm:w-96 sm:-translate-x-1/2">
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Timer, Check, X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildBoard, pickOwner, roundOf, secondsLeft, leftoverCount } from "@/lib/draft";
import type { League, Profile } from "@/lib/league";
import { LEAGUE_COLUMNS } from "@/lib/league-columns";
import { OWNER_BG, OWNER_BORDER } from "@/lib/colors";
import type { Couple, DraftPick } from "@/lib/types";
import { CoupleAvatar } from "@/components/couple-avatar";
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
  const [flash, setFlash] = useState<string | null>(null); // couple id just drafted
  const [pending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const skew = useRef(0);
  const lastPickCount = useRef(initialPicks.length);

  const order = league.draft_order ?? [];
  const nameOf = useCallback((id: string) => members.find((m) => m.id === id)?.display_name ?? "—", [members]);
  const slot = (id: string) => Math.max(0, order.indexOf(id)) % OWNER_BG.length;

  const refetch = useCallback(async () => {
    const [l, c, p] = await Promise.all([
      supabase.from("leagues").select(LEAGUE_COLUMNS).eq("id", league.id).single(),
      supabase.from("couples").select("*").eq("league_id", league.id).order("cast_order"),
      supabase.from("draft_picks").select("*").eq("league_id", league.id).order("pick_no"),
    ]);
    if (l.data) setLeague(l.data as League);
    if (c.data) setCouples(c.data as Couple[]);
    if (p.data) {
      const next = p.data as DraftPick[];
      if (next.length > lastPickCount.current) {
        setFlash(next[next.length - 1].couple_id);
        setTimeout(() => setFlash(null), 1600);
      }
      lastPickCount.current = next.length;
      setPicks(next);
    }
  }, [supabase, league.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`league:${league.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_picks", filter: `league_id=eq.${league.id}` }, refetch)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leagues", filter: `id=eq.${league.id}` }, refetch)
      .subscribe();
    const poll = setInterval(refetch, 10_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, league.id, refetch]);

  useEffect(() => {
    serverNow()
      .then((s) => (skew.current = s - Date.now()))
      .catch(() => {});
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (league.draft_status === "complete") router.push("/standings");
  }, [league.draft_status, router]);

  const pickNo = league.current_pick + 1;
  const totalPicks = league.roster_size * order.length;
  const onClock = order.length ? pickOwner(order, pickNo) : null;
  const isProxy = (id: string) => members.find((m) => m.id === id)?.is_mock === true;
  const canProxy = isCommissioner && league.is_mock;
  const actingAs = onClock && (onClock === me || (canProxy && isProxy(onClock))) ? onClock : null;
  const myTurn = actingAs !== null;
  const teamOf = actingAs && actingAs !== me ? actingAs : me;
  const left = secondsLeft(league.turn_started_at, league.pick_seconds, Date.now() + skew.current);
  const urgent = left <= 10;
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
  const leftoverPreview = [...available].sort((a, b) => b.cast_order - a.cast_order).slice(0, leftovers);
  const lastPick = picks[picks.length - 1];

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

  return (
    <div className="-mx-4 sm:mx-0">
      {/* On the clock */}
      <div
        className={`sticky top-[53px] z-10 border-b px-4 py-3 backdrop-blur-md transition-colors sm:rounded-2xl sm:border ${
          myTurn ? "border-gold-400/60 bg-gold-400/15 shadow-glow-sm" : "hairline bg-plum-950/80"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">
              Pick {pickNo} of {totalPicks} · Round {roundOf(pickNo, order.length)}
            </div>
            <div className="display truncate text-xl font-semibold text-silver-100">
              {actingAs === me ? "You're on the clock" : actingAs ? `Pick for ${nameOf(actingAs)}` : `${onClock ? nameOf(onClock) : "—"} is picking`}
            </div>
            {league.is_mock && <div className="text-xs text-gold-300/80">Mock draft · you control the proxies</div>}
            {lastPick && !myTurn && (
              <div className="mt-0.5 truncate text-xs text-silver-500">
                Last: {nameOf(lastPick.user_id)} took {coupleById.get(lastPick.couple_id)?.celebrity}
                {lastPick.auto && " (auto)"}
              </div>
            )}
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 font-mono text-2xl tabular-nums transition-colors ${
              urgent ? "animate-pulse-gold bg-rose-600/80 text-white" : myTurn ? "bg-gold-400 text-plum-950" : "bg-plum-800/80 text-silver-100"
            }`}
          >
            <Timer size={18} />
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </div>
        </div>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto text-xs">
          {order.map((id) => {
            const on = id === onClock;
            return (
              <span
                key={id}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all ${
                  on ? `${OWNER_BORDER[slot(id)]} bg-plum-950/70 text-silver-100 shadow-glow-sm` : "border-transparent bg-plum-800/60 text-silver-300"
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${OWNER_BG[slot(id)]}`} />
                {nameOf(id)}
                <span className="text-silver-500">{picks.filter((p) => p.user_id === id).length}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex border-b hairline text-sm sm:hidden">
        {(["available", "board", "team"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 py-2.5 capitalize transition-colors ${tab === t ? "text-gold-300" : "text-silver-500"}`}
          >
            {t === "team" ? (teamOf === me ? "My team" : nameOf(teamOf)) : t}
            {tab === t && <span className="absolute inset-x-8 bottom-0 h-0.5 rounded-full bg-gold-400 shadow-[0_0_10px_rgb(233_194_80)]" />}
          </button>
        ))}
      </div>

      <div className="grid gap-4 px-4 pt-4 sm:grid-cols-[1fr_1.25fr_0.9fr] sm:px-0">
        {/* Available */}
        <section className={tab === "available" ? "" : "hidden sm:block"}>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-silver-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search couples" className="input-dark pl-9" />
          </div>
          <ul className="stagger mt-3 space-y-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => myTurn && setConfirm(c)}
                  disabled={!myTurn || pending}
                  className={`glass flex w-full items-center gap-3 p-3 text-left transition-all ${
                    myTurn ? "glass-hover cursor-pointer hover:border-gold-400/70" : "cursor-default opacity-70"
                  }`}
                >
                  <CoupleAvatar couple={c} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-silver-100">{c.celebrity}</div>
                    <div className="truncate text-xs text-silver-300">with {c.professional}</div>
                    <div className="truncate text-xs text-silver-500">{c.notability}</div>
                  </div>
                  <span className="text-xs text-silver-500">#{c.cast_order}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="py-8 text-center text-silver-500">No couples match.</li>}
          </ul>
        </section>

        {/* Board */}
        <section className={tab === "board" ? "" : "hidden sm:block"}>
          <div className="eyebrow mb-2">Board</div>
          <div className="glass overflow-x-auto p-2">
            <table className="w-full min-w-[500px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="w-7 text-left text-silver-500">Rd</th>
                  {order.map((id) => (
                    <th key={id} className="text-left font-medium text-silver-300">
                      <span className={`mr-1 inline-block h-2 w-2 rounded-full ${OWNER_BG[slot(id)]}`} />
                      {nameOf(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.map((row, r) => (
                  <tr key={r}>
                    <td className="text-silver-500">{r + 1}</td>
                    {order.map((uid) => {
                      const cell = row.find((c) => c.userId === uid)!;
                      const p = pickAt(cell.pickNo);
                      const c = p ? coupleById.get(p.couple_id) : undefined;
                      const isNow = cell.pickNo === pickNo && league.draft_status === "live";
                      const justIn = c && flash === c.id;
                      return (
                        <td
                          key={uid}
                          className={`h-[62px] rounded-lg border p-1.5 align-top transition-all ${
                            isNow
                              ? "border-gold-400 bg-gold-400/15 shadow-glow-sm"
                              : p
                                ? `${justIn ? "fade-up border-gold-300" : "border-plum-600/60"} bg-plum-900/70`
                                : "border-plum-700/40 bg-plum-950/30"
                          }`}
                        >
                          <div className="flex items-start gap-1.5">
                            {c && <CoupleAvatar couple={c} size="sm" />}
                            <div className="min-w-0">
                              <div className="text-[10px] text-silver-500">#{cell.pickNo}</div>
                              {c ? (
                                <>
                                  <div className="truncate font-semibold text-silver-100">{c.celebrity}</div>
                                  <div className="truncate text-silver-500">
                                    {c.professional.split(" ")[0]}
                                    {p?.auto && " · auto"}
                                  </div>
                                </>
                              ) : isNow ? (
                                <div className="flex items-center gap-1 text-gold-300">
                                  <Zap size={11} /> on the clock
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Team */}
        <section className={tab === "team" ? "" : "hidden sm:block"}>
          <div className="eyebrow mb-2">{teamOf === me ? "My team" : `${nameOf(teamOf)}'s team`}</div>
          <ul className="stagger space-y-2">
            {myPicks.map((p) => {
              const c = coupleById.get(p.couple_id);
              return (
                <li key={p.id} className="glass flex items-center gap-3 p-3">
                  {c && <CoupleAvatar couple={c} size="md" />}
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-silver-100">{c?.celebrity}</div>
                    <div className="truncate text-xs text-silver-500">
                      with {c?.professional} · Rd {p.round}, #{p.pick_no}
                      {p.auto && " · auto"}
                    </div>
                  </div>
                </li>
              );
            })}
            {Array.from({ length: Math.max(0, league.roster_size - myPicks.length) }).map((_, i) => (
              <li key={`empty-${i}`} className="rounded-2xl border border-dashed hairline p-3.5 text-xs text-silver-500">
                Round {myPicks.length + i + 1}
              </li>
            ))}
          </ul>

          {leftovers > 0 && (
            <>
              <div className="eyebrow mb-1 mt-6">Leftovers preview · {leftovers}</div>
              <p className="mb-2 text-xs text-silver-500">Undrafted if every remaining pick goes by cast order.</p>
              <ul className="space-y-1 text-sm text-silver-300">
                {leftoverPreview.map((c) => (
                  <li key={c.id}>
                    {c.celebrity} <span className="text-silver-500">· {c.professional}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-plum-950/80 p-4 backdrop-blur-sm sm:items-center" onClick={() => !pending && setConfirm(null)}>
          <div className="glass fade-up w-full max-w-sm border-gold-400/40 p-5 shadow-glow" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">
              Round {roundOf(pickNo, order.length)} · Pick {pickNo}
              {actingAs && actingAs !== me && ` · for ${nameOf(actingAs)}`}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <CoupleAvatar couple={confirm} size="lg" />
              <div className="min-w-0">
                <div className="display text-2xl font-semibold leading-tight text-silver-100">{confirm.celebrity}</div>
                <div className="text-sm text-silver-300">with {confirm.professional}</div>
                <div className="mt-0.5 text-xs text-silver-500">{confirm.notability}</div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(null)} disabled={pending} className="btn-ghost flex-1">
                <X size={16} /> Cancel
              </button>
              <button onClick={() => submitPick(confirm)} disabled={pending} className="btn-gold flex-1">
                <Check size={16} /> {pending ? "Picking…" : "Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fade-up fixed inset-x-4 bottom-20 z-40 rounded-xl border border-rose-500/50 bg-rose-950/90 px-4 py-3 text-center text-sm text-rose-100 backdrop-blur sm:bottom-6 sm:left-1/2 sm:w-96 sm:-translate-x-1/2">
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mirrorball } from "@/components/mirrorball";
import { CoupleFace } from "@/components/couple";
import { OWNER_BG, OWNER_TEXT } from "@/lib/colors";
import type { Profile } from "@/lib/league";
import type { Couple, DraftPick } from "@/lib/types";

/**
 * Curtain call when the final pick lands. Phases:
 *   0  burst + headline           (0 – 1.8s)
 *   1  teams fan in               (1.8 – 6.5s)
 *   2  fade to black, then route  (6.5 – 7.3s → /standings?welcome=1)
 */
export function DraftWrap({ order, members, picks, couples }: { order: string[]; members: Profile[]; picks: DraftPick[]; couples: Couple[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";
  const byId = useMemo(() => new Map(couples.map((c) => [c.id, c])), [couples]);

  useEffect(() => {
    router.prefetch("/standings");
    const t1 = setTimeout(() => setPhase(1), 1800);
    const t2 = setTimeout(() => setPhase(2), 6500);
    const t3 = setTimeout(() => router.push("/standings?welcome=1"), 7300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [router]);

  // deterministic confetti
  const confetti = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
        return {
          left: `${r(1) * 100}%`,
          delay: `${r(2) * 1.2}s`,
          dur: `${3.2 + r(3) * 2.4}s`,
          size: 6 + r(4) * 8,
          rot: `${r(5) * 360}deg`,
          color: ["#f5d97a", "#e9c250", "#d15be6", "#8b5cf6", "#f3f2f7", "#fbeab3"][i % 6],
          shape: i % 3,
        };
      }),
    [],
  );

  return (
    <div className={`wrap fixed inset-0 z-50 overflow-hidden ${phase === 2 ? "wrap-out" : ""}`} role="dialog" aria-label="The draft is complete">
      {/* ground */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(233_194_80/.35),transparent_70%),radial-gradient(40%_40%_at_20%_80%,rgb(184_58_209/.25),transparent_70%),radial-gradient(40%_40%_at_80%_80%,rgb(184_58_209/.2),transparent_70%),linear-gradient(180deg,#170c25,#0e0716)]" />
      {/* light strips */}
      <div className="wrap-strips absolute inset-0 opacity-60" />

      {/* confetti */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {confetti.map((c, i) => (
          <span
            key={i}
            className="wrap-confetti absolute -top-4"
            style={{
              left: c.left,
              width: c.size,
              height: c.shape === 1 ? c.size * 0.45 : c.size,
              background: c.color,
              borderRadius: c.shape === 2 ? "50%" : 2,
              animationDelay: c.delay,
              animationDuration: c.dur,
              ["--rot" as string]: c.rot,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-5 text-center">
        {/* mirrorball drops in */}
        <div className="wrap-ball">
          <Mirrorball size={phase === 0 ? 150 : 84} className="drop-shadow-[0_30px_60px_rgb(233_194_80/.45)] transition-all duration-700" />
        </div>

        <div className="wrap-title mt-5">
          <div className="eyebrow">Season 35 · Draft night</div>
          <h1 className="display mt-2 text-[clamp(40px,8vw,84px)] font-semibold italic leading-none tracking-tight">
            <span className="gold-text">That&apos;s a wrap.</span>
          </h1>
          <p className="mt-3 text-silver-300">All {picks.length} picks are in. The ballroom is set.</p>
        </div>

        {/* teams fan in */}
        <div className={`mt-8 grid w-full gap-3 transition-opacity duration-700 sm:grid-cols-2 lg:grid-cols-4 ${phase >= 1 ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          {order.map((uid, i) => {
            const mine = picks.filter((p) => p.user_id === uid).sort((a, b) => a.pick_no - b.pick_no);
            return (
              <div key={uid} className="wrap-team glass p-3.5 text-left" style={{ animationDelay: phase >= 1 ? `${i * 260}ms` : "9999s" }}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${OWNER_BG[i % OWNER_BG.length]}`} />
                  <span className={`display text-lg font-semibold ${OWNER_TEXT[i % OWNER_TEXT.length]}`}>{nameOf(uid)}</span>
                  <span className="ml-auto text-[11px] text-silver-500">slot {i + 1}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {mine.map((p, j) => {
                    const c = byId.get(p.couple_id);
                    if (!c) return null;
                    return (
                      <li key={p.id} className="wrap-couple flex items-center gap-2.5" style={{ animationDelay: phase >= 1 ? `${i * 260 + 300 + j * 140}ms` : "9999s" }}>
                        <CoupleFace couple={c} size={34} ring="ring-gold-400/50" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-silver-100">{c.celebrity}</span>
                          <span className="block truncate text-[11px] text-silver-500">
                            with {c.professional} · #{p.pick_no}
                            {p.auto && " · auto"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <button onClick={() => router.push("/standings?welcome=1")} className="wrap-skip mt-8 text-xs text-silver-500 underline decoration-silver-500/40 hover:text-silver-300">
          Go to standings now
        </button>
      </div>
    </div>
  );
}

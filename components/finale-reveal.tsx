"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, X } from "lucide-react";
import type { FinaleReveal as Data } from "@/lib/reveal";
import { markRevealSeen } from "@/app/actions";
import { Mirrorball } from "@/components/mirrorball";
import { OWNER_BG, OWNER_TEXT } from "@/lib/colors";

/**
 * Once-per-user finale: the podium rises (3rd, 2nd, 1st by survival points), then the
 * mirrorball drops for the Grand Champion with the winning couple.
 *   0  title                       (0 – 1.2s)
 *   1  podium rises                (1.2 – 5.2s)
 *   2  champion + confetti         (5.2s →)
 */
export function FinaleReveal({ reveal, me, leagueId }: { reveal: Data; me: string; leagueId: string }) {
  const [open, setOpen] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 5200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  function close() {
    if (leaving) return;
    setLeaving(true);
    void markRevealSeen(leagueId, reveal.key);
    setTimeout(() => setOpen(false), 650);
  }

  const confetti = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
        return {
          left: `${r(1) * 100}%`,
          delay: `${r(2) * 1.4}s`,
          dur: `${3.4 + r(3) * 2.6}s`,
          size: 6 + r(4) * 8,
          rot: `${r(5) * 360}deg`,
          color: ["#f5d97a", "#e9c250", "#fbeab3", "#f3f2f7", "#d15be6", "#8b5cf6"][i % 6],
          shape: i % 3,
        };
      }),
    [],
  );

  if (!open) return null;

  // podium display order: 2nd, 1st, 3rd
  const byRank = (r: number) => reveal.podium.find((p) => p.rank === r);
  const cols = [byRank(2), byRank(1), byRank(3)].filter(Boolean) as Data["podium"];
  const heights: Record<number, string> = { 1: "h-44 sm:h-56", 2: "h-32 sm:h-40", 3: "h-24 sm:h-28" };

  return (
    <div className={`reveal fixed inset-0 z-50 overflow-y-auto ${leaving ? "reveal-out" : ""}`} role="dialog" aria-modal aria-label="Season results">
      <div className="fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(233_194_80/.35),transparent_70%),radial-gradient(40%_40%_at_15%_85%,rgb(184_58_209/.25),transparent_70%),radial-gradient(40%_40%_at_85%_85%,rgb(184_58_209/.2),transparent_70%),linear-gradient(180deg,#170c25,#0e0716)]" />
      <div className="wrap-strips fixed inset-0 opacity-60" />
      {phase >= 2 && (
        <div className="pointer-events-none fixed inset-0" aria-hidden>
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
      )}

      <div className="relative z-10 mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center px-5 py-12 text-center">
        <div className="reveal-eyebrow eyebrow">Season finale · Final results</div>
        <h1 className="reveal-title display mt-2 text-[clamp(32px,6vw,60px)] font-semibold italic leading-none tracking-tight text-silver-100">
          The results are in
        </h1>

        {/* podium */}
        <div className={`mt-10 grid w-full max-w-2xl grid-cols-3 items-end gap-3 transition-opacity duration-700 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
          {cols.map((p) => {
            const first = p.rank === 1;
            const delay = p.rank === 3 ? 0 : p.rank === 2 ? 900 : 1900;
            const isMe = p.user_id === me;
            return (
              <div key={p.user_id} className="podium-col flex flex-col items-center" style={{ animationDelay: phase >= 1 ? `${delay}ms` : "9999s" }}>
                <div className="mb-2 flex flex-col items-center">
                  {first && <Crown size={22} className="mb-1 text-gold-300 drop-shadow-[0_0_14px_rgb(233_194_80/.9)]" />}
                  <div className={`display text-lg font-semibold sm:text-2xl ${first ? "gold-text" : OWNER_TEXT[p.slot % OWNER_TEXT.length]}`}>{p.name}</div>
                  <div className="text-xs text-silver-400">
                    <span className="display text-base text-silver-100 tabular-nums">{p.points}</span> pts{isMe && " · you"}
                  </div>
                </div>
                <div
                  className={`podium-block relative w-full rounded-t-xl border border-b-0 ${heights[p.rank]} ${
                    first ? "border-gold-400/70 bg-gradient-to-b from-gold-400/40 to-plum-900/80 shadow-glow" : "hairline bg-gradient-to-b from-plum-700/70 to-plum-900/80"
                  }`}
                  style={{ animationDelay: phase >= 1 ? `${delay}ms` : "9999s" }}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${OWNER_BG[p.slot % OWNER_BG.length]}`} />
                  <span className={`display absolute inset-x-0 top-1/2 -translate-y-1/2 text-4xl font-semibold sm:text-6xl ${first ? "text-gold-200" : "text-silver-300/80"}`}>
                    {p.rank}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 h-px w-full max-w-2xl bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" />

        {/* champion */}
        <div className={`mt-10 w-full max-w-3xl transition-all duration-700 ${phase >= 2 ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
          {reveal.champion ? (
            <div className="glass relative overflow-hidden border-gold-400/50 p-5 shadow-glow sm:p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(233_194_80/.3),transparent_70%)]" />
              <div className="relative grid items-center gap-5 sm:grid-cols-[auto_1fr_auto]">
                <div className="wrap-ball mx-auto" style={{ animationDelay: "0ms" }}>
                  <Mirrorball size={96} className="drop-shadow-[0_24px_50px_rgb(233_194_80/.5)]" />
                </div>
                <div className="text-center sm:text-left">
                  <div className="eyebrow">Grand Champion · Mirrorball</div>
                  <div className="display mt-1 text-[clamp(30px,5vw,48px)] font-semibold leading-none">
                    <span className="gold-text">{reveal.champion.name}</span>
                    {reveal.champion.user_id === me && <span className="ml-2 align-middle text-sm text-gold-300">that&apos;s you</span>}
                  </div>
                  <div className="mt-2 text-sm text-silver-300">
                    {reveal.champion.couple.celebrity} &amp; {reveal.champion.couple.professional} took the Mirrorball.
                  </div>
                </div>
                <div className="mx-auto h-[150px] w-[112px] overflow-hidden rounded-xl border border-gold-400/50 shadow-[0_20px_50px_-20px_rgb(0_0_0/.9)]">
                  {reveal.champion.couple.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={reveal.champion.couple.image_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-[50%_18%]" />
                  ) : (
                    <div className="display flex h-full w-full items-center justify-center bg-plum-800 text-3xl text-silver-300">{reveal.champion.couple.celebrity.slice(0, 1)}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-silver-500">The Mirrorball winner wasn&apos;t on anyone&apos;s roster this season.</p>
          )}
        </div>

        <div className={`mt-8 transition-opacity duration-700 ${phase >= 2 ? "opacity-100" : "opacity-0"}`}>
          <button onClick={close} className="btn-gold px-7">
            See the final standings
          </button>
        </div>
      </div>

      <button onClick={close} aria-label="Dismiss" className="fixed right-4 top-4 z-20 rounded-full border hairline bg-plum-950/60 p-2 text-silver-300 hover:text-silver-100">
        <X size={18} />
      </button>
    </div>
  );
}

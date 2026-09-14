"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { EliminationReveal as Data } from "@/lib/reveal";
import { markRevealSeen } from "@/app/actions";

/**
 * Once-per-elimination overlay: lights down, the couple's poster in a spotlight,
 * an "Eliminated · Week N" stamp, and whose roster took the hit.
 */
export function EliminationReveal({ reveal, me, leagueId }: { reveal: Data; me: string; leagueId: string }) {
  const [open, setOpen] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const multi = reveal.couples.length > 1;
  const mine = reveal.couples.filter((c) => c.owner_id === me);

  function close() {
    if (leaving) return;
    setLeaving(true);
    void markRevealSeen(leagueId, reveal.key);
    setTimeout(() => setOpen(false), 650);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <div className={`reveal fixed inset-0 z-50 overflow-hidden ${leaving ? "reveal-out" : ""}`} role="dialog" aria-modal aria-label={`Week ${reveal.week} elimination`} onClick={close}>
      <div className="absolute inset-0 bg-[radial-gradient(45%_60%_at_50%_0%,rgb(233_194_80/.22),transparent_70%),linear-gradient(180deg,#0f0818,#08040d)]" />
      <div className="reveal-spot pointer-events-none absolute inset-x-0 top-0 mx-auto h-[90vh] w-[70vw] max-w-3xl" aria-hidden />

      <div className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="reveal-eyebrow eyebrow">Week {reveal.week} results</div>
        <h1 className="reveal-title display mt-2 text-[clamp(30px,6vw,56px)] font-semibold italic leading-none tracking-tight text-silver-100">
          {multi ? "Two couples leave the ballroom" : reveal.couples[0].status === "withdrew" ? "A couple withdraws" : "The ballroom says goodbye"}
        </h1>

        <div className={`mt-8 flex flex-wrap items-end justify-center ${multi ? "gap-5" : ""}`}>
          {reveal.couples.map((c, i) => (
            <figure key={c.id} className="reveal-card relative m-0" style={{ animationDelay: `${400 + i * 350}ms` }}>
              <div className="relative h-[min(52vh,380px)] w-[min(39vh,285px)] overflow-hidden rounded-2xl border border-gold-400/40 bg-plum-800 shadow-[0_40px_80px_-30px_rgb(0_0_0/.9),0_0_0_1px_rgb(233_194_80/.2)]">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={`${c.celebrity} and ${c.professional}`} referrerPolicy="no-referrer" className="reveal-photo h-full w-full object-cover object-[50%_18%]" />
                ) : (
                  <div className="display flex h-full w-full items-center justify-center text-5xl text-silver-300">{c.celebrity.slice(0, 1)}</div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(14_7_22/.1),transparent_40%,rgb(14_7_22/.92))]" />
                <figcaption className="absolute inset-x-4 bottom-4 text-left">
                  <div className="display text-2xl font-semibold leading-tight text-silver-100">{c.celebrity}</div>
                  <div className="text-sm text-silver-300">with {c.professional}</div>
                </figcaption>
                {/* stamp */}
                <div className="reveal-stamp absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded-md border-[3px] border-rose-400/90 px-3 py-1 text-center" style={{ animationDelay: `${1100 + i * 350}ms` }}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-rose-300">{c.status === "withdrew" ? "Withdrew" : "Eliminated"}</div>
                  <div className="display text-lg font-semibold text-rose-200">Week {reveal.week}</div>
                </div>
              </div>
              <div className="reveal-owner mt-3 text-sm text-silver-300" style={{ animationDelay: `${1500 + i * 350}ms` }}>
                {c.owner_id ? (
                  c.owner_id === me ? (
                    <>
                      <span className="font-semibold text-gold-300">Your roster</span> loses {c.celebrity.split(" ")[0]}.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-silver-100">{c.owner_name}</span> loses {c.celebrity.split(" ")[0]}.
                    </>
                  )
                ) : (
                  <>Undrafted · no roster affected.</>
                )}
              </div>
            </figure>
          ))}
        </div>

        <div className="reveal-foot mt-8 flex flex-col items-center gap-3">
          {mine.length > 0 && <p className="text-sm text-gold-200">{mine.length === 1 ? "One fewer couple dancing for you." : "Two fewer couples dancing for you."}</p>}
          <button onClick={close} className="btn-gold px-6">
            Continue
          </button>
        </div>
      </div>

      <button onClick={close} aria-label="Dismiss" className="absolute right-4 top-4 z-20 rounded-full border hairline bg-plum-950/60 p-2 text-silver-300 hover:text-silver-100">
        <X size={18} />
      </button>
    </div>
  );
}

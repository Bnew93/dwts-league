"use client";

import { useState, useTransition } from "react";
import { startDraft } from "@/app/l/[slug]/commissioner/actions";

/**
 * Starts the draft. When fewer players than the cap have joined, the server refuses with
 * `short:N:M`; we then ask "Start with N of M?" and retry with confirmation, which locks the cap.
 */
export function StartDraftButton({
  leagueId,
  slug,
  players,
  cap,
  coupleCount,
  disabled,
  className = "btn-gold",
  label = "Start draft",
  sub,
}: {
  leagueId: string;
  slug: string;
  players: number;
  cap: number;
  coupleCount: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  sub?: string;
}) {
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rosterSize = players ? Math.floor(coupleCount / players) : 0;

  function go(confirmShort: boolean) {
    setErr(null);
    start(async () => {
      const r = await startDraft(leagueId, slug, confirmShort);
      if (r.ok) return;
      if (r.short) setAsk(true);
      else setErr(r.error ?? "Could not start the draft");
    });
  }

  if (ask) {
    return (
      <div className="mt-4 rounded-xl border border-gold-400/50 bg-plum-950/80 p-4 text-left text-sm">
        <div className="font-semibold text-silver-100">
          Start with {players} of {cap}?
        </div>
        <p className="mt-1 text-silver-300">
          The league locks at {players} players and each drafts {rosterSize} couples ({coupleCount - rosterSize * players} left over). Open seats close.
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setAsk(false)} disabled={pending} className="btn-ghost flex-1">
            Wait
          </button>
          <button onClick={() => go(true)} disabled={pending} className="btn-gold flex-1">
            {pending ? "Starting…" : `Start with ${players}`}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => go(false)} disabled={disabled || pending} className={className}>
        {pending ? "Starting…" : label}
        {sub && <small className="block text-xs font-normal opacity-80">{sub}</small>}
      </button>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </>
  );
}

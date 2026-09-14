"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Check, ArrowLeft } from "lucide-react";
import { createLeague, checkSlug, type CreateResult } from "./actions";
import { ShareLink } from "@/components/share-link";
import { rosterMath } from "@/lib/draft";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export function Wizard({ coupleCount, season }: { coupleCount: number; season: number }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cap, setCap] = useState(4);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "ok" | "taken" | "bad">("idle");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { rosterSize, leftovers } = rosterMath(coupleCount, cap);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  async function verifySlug(s: string) {
    if (!/^[a-z0-9-]{2,32}$/.test(s)) return setSlugState("bad");
    setSlugState("checking");
    setSlugState((await checkSlug(s)) ? "ok" : "taken");
  }

  function submit(showLink: boolean) {
    setErr(null);
    start(async () => {
      const r = await createLeague({ name, slug, memberCap: cap });
      if (!r.ok) {
        setErr(r.error);
        if (/link name|slug/i.test(r.error)) setStep(2);
        return;
      }
      if (showLink) setResult(r);
      else router.push(`/l/${r.slug}/commissioner?tab=members`);
    });
  }

  const canName = name.trim().length > 0 && slugState !== "taken" && slugState !== "bad" && slug.length >= 2;

  return (
    <div className="mx-auto max-w-md">
      <div className="fade-up flex items-center gap-3">
        {step > 1 && !result && (
          <button onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))} className="text-silver-500 hover:text-gold-300" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <div className="eyebrow">New league · step {step} of 3</div>
          <h1 className="display mt-0.5 text-3xl font-semibold leading-none tracking-tight text-silver-100">
            {step === 1 ? "How many people are playing?" : step === 2 ? "Name your league" : result ? "Share the link" : "Invite your group"}
          </h1>
        </div>
      </div>
      <ol className="mt-4 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((s) => (
          <li key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-gold-400" : "bg-plum-800"}`} />
        ))}
      </ol>

      {step === 1 && (
        <section className="glass fade-up mt-6 p-5 text-center">
          <div className="flex items-center justify-center gap-5">
            <button onClick={() => setCap((c) => Math.max(2, c - 1))} className="btn-ghost h-12 w-12 rounded-full p-0" aria-label="Fewer">
              <Minus size={18} />
            </button>
            <div className="display w-20 text-6xl font-semibold tabular-nums text-silver-100">{cap}</div>
            <button onClick={() => setCap((c) => Math.min(14, c + 1))} className="btn-ghost h-12 w-12 rounded-full p-0" aria-label="More">
              <Plus size={18} />
            </button>
          </div>
          <p className="mt-2 text-xs text-silver-500">including you · 2 to 14</p>
          <div className="mt-5 rounded-xl border hairline bg-plum-950/50 px-4 py-3 text-sm text-silver-300">
            Each player drafts <b className="text-gold-300">{rosterSize}</b> couple{rosterSize === 1 ? "" : "s"} ·{" "}
            <b className="text-gold-300">{leftovers}</b> go{leftovers === 1 ? "es" : ""} to the Leftovers pool
            <div className="mt-1 text-xs text-silver-500">
              {coupleCount} couples in season {season}
              {leftovers === 0 && " · no leftovers means no replacement picks"}
            </div>
          </div>
          <button onClick={() => setStep(2)} disabled={rosterSize < 1} className="btn-gold mt-5 w-full">
            Continue
          </button>
          {rosterSize < 1 && <p className="mt-2 text-xs text-rose-300">Not enough couples for a league that size.</p>}
        </section>
      )}

      {step === 2 && (
        <section className="glass fade-up mt-6 space-y-4 p-5">
          <label className="block text-sm text-silver-300">
            League name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="Tuesday Night Tangos" className="input-dark mt-1" />
          </label>
          <label className="block text-sm text-silver-300">
            Link name
            <div className="mt-1 flex items-center gap-1 rounded-lg border hairline bg-plum-950/60 pl-3 focus-within:border-gold-400/60">
              <span className="text-xs text-silver-500">/l/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                  setSlugState("idle");
                }}
                onBlur={() => verifySlug(slug)}
                maxLength={32}
                className="w-full bg-transparent py-2.5 pr-3 text-silver-100 outline-none"
              />
            </div>
            <span className="mt-1 block text-xs text-silver-500">
              {slugState === "checking" && "Checking…"}
              {slugState === "ok" && <span className="text-emerald-300">Available</span>}
              {slugState === "taken" && <span className="text-rose-300">Taken — try another</span>}
              {slugState === "bad" && <span className="text-rose-300">2–32 lowercase letters, digits, or dashes</span>}
              {slugState === "idle" && "Lowercase letters, digits, and dashes."}
            </span>
          </label>
          <button
            onClick={async () => {
              await verifySlug(slug);
              setStep(3);
            }}
            disabled={!canName}
            className="btn-gold w-full"
          >
            Continue
          </button>
        </section>
      )}

      {step === 3 && !result && (
        <section className="glass fade-up mt-6 p-5">
          <p className="text-sm text-silver-300">
            <b className="text-silver-100">{name}</b> · {cap} seats · {rosterSize} couples each. One link gets everyone in; anyone who follows it and signs in with Google takes a seat.
          </p>
          <button onClick={() => submit(true)} disabled={pending} className="btn-gold mt-5 w-full py-3 text-base">
            {pending ? "Creating…" : "Create invite link"}
          </button>
          <button onClick={() => submit(false)} disabled={pending} className="btn-ghost mt-2 w-full text-sm">
            Skip for now
          </button>
          <p className="mt-2 text-center text-xs text-silver-500">The link is always available under Commissioner → Members.</p>
          {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
        </section>
      )}

      {result?.ok && (
        <section className="glass fade-up mt-6 p-5">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <Check size={16} /> {name} is ready.
          </div>
          <ShareLink leagueName={name} url={result.inviteUrl} />
          <button onClick={() => router.push(`/l/${result.slug}/commissioner?tab=members`)} className="btn-gold mt-5 w-full">
            Done
          </button>
        </section>
      )}
    </div>
  );
}

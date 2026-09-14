"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoogleMark } from "@/app/login/google-button";
import { rememberInvite } from "./actions";

/** Parks the invite token in an httpOnly cookie (server action), then starts Google sign-in. */
export function JoinGoogleButton({ token, redirectTo }: { token: string; redirectTo: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      await rememberInvite(token);
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start sign-in");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-5 py-3 text-base font-medium text-zinc-900 shadow-[0_8px_30px_-10px_rgb(255_255_255/0.5)] transition hover:-translate-y-0.5 hover:bg-zinc-50 active:translate-y-0 disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </>
  );
}

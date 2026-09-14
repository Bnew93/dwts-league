"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.8c4.4-4 7.2-10 7.2-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.4-5.6l-7.4-5.8c-2 1.4-4.7 2.3-8 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** `redirectTo` is computed server-side from NEXT_PUBLIC_APP_URL / VERCEL_URL, never window.location. */
export function GoogleButton({ redirectTo }: { redirectTo: string }) {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
  }

  return (
    <button
      onClick={signIn}
      disabled={busy}
      className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-5 py-3 text-base font-medium text-zinc-900 shadow-[0_8px_30px_-10px_rgb(255_255_255/0.5)] transition hover:-translate-y-0.5 hover:bg-zinc-50 active:translate-y-0 disabled:opacity-60"
    >
      <GoogleMark />
      {busy ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

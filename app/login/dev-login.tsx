"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Local-only password sign-in for layout testing. The login page renders it only under `next dev`. */
export function DevLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="mt-6 w-full rounded-xl border border-dashed border-silver-500/30 p-4 text-left">
      <div className="eyebrow">Dev only · password sign-in</div>
      <div className="mt-2 grid gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="email" className="input-dark py-2 text-sm" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="password" className="input-dark py-2 text-sm" />
        <button disabled={busy} className="btn-ghost text-sm">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {err && <p className="text-xs text-rose-300">{err}</p>}
      </div>
    </form>
  );
}

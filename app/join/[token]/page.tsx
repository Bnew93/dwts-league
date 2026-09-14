import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Mirrorball } from "@/components/mirrorball";
import { BRAND, TAGLINE } from "@/lib/brand";
import { appUrl } from "@/lib/url";
import { joinLeague } from "./actions";
import { JoinGoogleButton } from "./join-button";

export const dynamic = "force-dynamic";

type Preview = {
  valid: boolean;
  reason?: string;
  already_member?: boolean;
  name?: string;
  slug?: string;
  status?: string;
  joined?: number;
  cap?: number;
};

export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: preview }, { data: auth }] = await Promise.all([supabase.rpc("fn_invite_preview", { p_token: token }), supabase.auth.getUser()]);
  const p = (preview ?? { valid: false, reason: "This invite is no longer valid." }) as Preview;
  const user = auth.user;

  // An existing member following the link is just redirected, never duplicated.
  if (user && p.valid && p.already_member && p.slug) redirect(`/l/${p.slug}`);

  const seats = p.cap ? Array.from({ length: p.cap }, (_, i) => i < (p.joined ?? 0)) : [];

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="fade-up">
        <Mirrorball size={96} className="mx-auto drop-shadow-[0_20px_40px_rgb(233_194_80/0.35)]" />
      </div>
      <div className="stagger mt-6">
        <div className="eyebrow">{BRAND}</div>
        {p.name ? (
          <h1 className="display mt-2 text-[clamp(30px,8vw,44px)] font-semibold italic leading-[1.05] tracking-tight [text-wrap:balance]">
            <span className="text-silver-100">You&apos;re invited to</span>
            <br />
            <span className="gold-text">{p.name}</span>
          </h1>
        ) : (
          <h1 className="display mt-2 text-[clamp(30px,8vw,44px)] font-semibold italic leading-[1.05] tracking-tight text-silver-100">Invite link</h1>
        )}
        <p className="mt-3 text-silver-300">{p.valid ? TAGLINE : p.reason}</p>
      </div>

      {p.valid && seats.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-1.5" aria-label={`${p.joined} of ${p.cap} seats filled`}>
          {seats.map((filled, i) => (
            <span key={i} className={`h-3 w-6 rounded-full ${filled ? "bg-gold-400 shadow-[0_0_8px_rgb(233_194_80/.8)]" : "border hairline bg-plum-900/70"}`} />
          ))}
          <span className="ml-2 text-xs text-silver-500">
            {p.joined} of {p.cap} seats filled
          </span>
        </div>
      )}

      <div className="glass mt-8 w-full p-5 fade-up" style={{ animationDelay: "240ms" }}>
        {p.valid ? (
          user ? (
            <form action={joinLeague}>
              <input type="hidden" name="token" value={token} />
              <button className="btn-gold w-full py-3 text-base">Grab your seat</button>
              <p className="mt-3 text-xs text-silver-500">Joining as {user.email}</p>
            </form>
          ) : (
            <>
              <JoinGoogleButton token={token} redirectTo={`${appUrl()}/auth/callback`} />
              <p className="mt-3 text-xs text-silver-500">Sign in with Google to take a seat. New here? That&apos;s all it takes.</p>
            </>
          )
        ) : (
          <div className="text-sm text-silver-300">
            {p.name && <p className="mb-2">Ask the commissioner of {p.name} for a fresh link.</p>}
            <Link href={user ? "/" : "/login"} className="btn-ghost mt-2 text-sm">
              {user ? "Go to my leagues" : "Sign in"}
            </Link>
          </div>
        )}
      </div>

      {error && <p className="fade-up mt-5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">{error}</p>}
    </main>
  );
}

import Link from "next/link";
import { GoogleButton } from "./google-button";
import { Mirrorball } from "@/components/mirrorball";
import { DevLogin } from "./dev-login";
import { BRAND, TAGLINE, SHOW_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/url";

const ERRORS: Record<string, string> = {
  auth: "Sign-in failed. Please try again.",
  disabled: "This account has been disabled.",
  not_in_league: "Sign in to create a league or follow an invite link from your commissioner.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [first, ...rest] = BRAND.split(" ");
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="fade-up">
        <Mirrorball size={112} className="mx-auto drop-shadow-[0_20px_40px_rgb(233_194_80/0.35)]" />
      </div>
      <div className="stagger mt-8">
        <div className="eyebrow">{SHOW_NAME} fantasy</div>
        <h1 className="display mt-2 text-[clamp(34px,9vw,52px)] font-semibold italic leading-[1.02] tracking-tight [text-wrap:balance]">
          <span className="text-silver-100">{first}</span>
          <br />
          <span className="gold-text">{rest.join(" ")}</span>
        </h1>
        <p className="mt-3 text-silver-300">{TAGLINE}</p>
      </div>
      <div className="glass mt-10 w-full p-5 fade-up" style={{ animationDelay: "240ms" }}>
        <GoogleButton redirectTo={`${appUrl()}/auth/callback`} />
        <p className="mt-3 text-xs text-silver-500">Start a league with friends, or follow the invite link they sent you.</p>
        {process.env.NODE_ENV === "development" && <DevLogin />}
      </div>
      {error && (
        <p className="fade-up mt-5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">{ERRORS[error] ?? ERRORS.auth}</p>
      )}
      <p className="mt-8 text-xs text-silver-500">
        <Link href="/legal/privacy" className="hover:text-silver-300">
          Privacy
        </Link>
        {" · "}
        <Link href="/legal/terms" className="hover:text-silver-300">
          Terms
        </Link>
      </p>
    </main>
  );
}

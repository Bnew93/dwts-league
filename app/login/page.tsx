import { GoogleButton } from "./google-button";
import { Mirrorball } from "@/components/mirrorball";
import { DevLogin } from "./dev-login";

const ERRORS: Record<string, string> = {
  not_in_league: "That Google account isn't in this league. Ask the commissioner to add your email.",
  auth: "Sign-in failed. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="fade-up">
        <Mirrorball size={112} className="mx-auto drop-shadow-[0_20px_40px_rgb(233_194_80/0.35)]" />
      </div>
      <div className="stagger mt-8">
        <div className="eyebrow">Season 35</div>
        <h1 className="display mt-2 text-5xl font-semibold italic leading-none tracking-tight">
          <span className="gold-text">DWTS</span> <span className="text-silver-100">League</span>
        </h1>
        <p className="mt-3 text-silver-300">Draft your couples. Survive the ballroom. Claim the Mirrorball.</p>
      </div>
      <div className="glass mt-10 w-full p-5 fade-up" style={{ animationDelay: "240ms" }}>
        <GoogleButton />
        <p className="mt-3 text-xs text-silver-500">League members only. Tuesdays 8/7c on ABC.</p>
        {process.env.NODE_ENV === "development" && <DevLogin />}
      </div>
      {error && (
        <p className="fade-up mt-5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">{ERRORS[error] ?? ERRORS.auth}</p>
      )}
    </main>
  );
}

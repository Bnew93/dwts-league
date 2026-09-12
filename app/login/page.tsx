import { GoogleButton } from "./google-button";

const ERRORS: Record<string, string> = {
  not_in_league: "That Google account isn't in this league. Ask the commissioner to add your email.",
  auth: "Sign-in failed. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <div className="text-5xl">🪩</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">DWTS League</h1>
        <p className="mt-2 text-zinc-400">Season 35 fantasy draft &amp; bracket</p>
      </div>
      <GoogleButton />
      {error && (
        <p className="rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          {ERRORS[error] ?? ERRORS.auth}
        </p>
      )}
    </main>
  );
}

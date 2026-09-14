/**
 * Absolute URL base for everything we generate (invite links, share text, OAuth redirectTo,
 * metadata). Never derived from window.location (PHASE_1_5 §10).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL — set on Vercel Production once fantasyfootwork.com is live.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the production alias (dwts-league.vercel.app) on
 *      production deployments, so the OAuth return matches the Supabase redirect allowlist.
 *   3. VERCEL_URL — the deployment's own hostname (preview deployments).
 *   4. http://localhost:3000
 * Server-only for the Vercel branches — pass the result to client components as a prop.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const vercel = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function inviteUrl(token: string): string {
  return `${appUrl()}/join/${token}`;
}

/** Bare host for display (share cards, footers). */
export function appHost(): string {
  return appUrl().replace(/^https?:\/\//, "");
}

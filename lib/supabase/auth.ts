import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who is signed in, verified locally. The project signs sessions with an asymmetric key (ES256),
 * so the JWT can be checked against the public key set without a round trip to the Auth server
 * on every request. The key set is fetched once per server instance and kept in memory.
 * Falls back to getUser() (network) if local verification is unavailable.
 */
type Jwks = { keys: unknown[] };
let jwksPromise: Promise<Jwks | null> | null = null;

function loadJwks(): Promise<Jwks | null> {
  if (!jwksPromise) {
    jwksPromise = fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`, { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Jwks>) : null))
      .catch(() => null);
  }
  return jwksPromise;
}

export type SessionUser = { id: string; email: string | null };

export async function sessionUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const jwks = await loadJwks();
  if (jwks) {
    const { data, error } = await supabase.auth.getClaims(undefined, { jwks: jwks as { keys: never[] } });
    if (!error && data?.claims?.sub) return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
    if (!error) return null; // no session
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE } from "@/lib/invite";

/**
 * OAuth return. Exchanges the code, then: a disabled account is signed out; a pending invite
 * (httpOnly cookie set by /join/[token] before sign-in) is redeemed; otherwise the user lands on
 * `/`, which routes by membership count.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // Behind a proxy (Vercel) prefer the forwarded host so previews redirect to themselves.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base = process.env.NODE_ENV === "development" || !forwardedHost ? origin : `https://${forwardedHost}`;
  const to = (path: string) => NextResponse.redirect(`${base}${path}`);

  const code = searchParams.get("code");
  if (!code) return to("/login?error=auth");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=auth");

  const { data: profile } = await supabase.from("profiles").select("disabled_at").eq("id", data.user.id).maybeSingle();
  if (profile?.disabled_at) {
    await supabase.auth.signOut();
    return to("/login?error=disabled");
  }

  await supabase.rpc("fn_log_activity", { p_action: "login", p_league_id: null, p_meta: null });

  const jar = await cookies();
  const invite = jar.get(INVITE_COOKIE)?.value;
  if (!invite) return to("/");

  const { data: joined, error: joinErr } = await supabase.rpc("fn_join_league", { p_token: invite });
  const res = joinErr
    ? to(`/join/${encodeURIComponent(invite)}?error=${encodeURIComponent(joinErr.message)}`)
    : to(`/l/${(joined as { slug: string; joined: boolean }).slug}${(joined as { joined: boolean }).joined ? "?joined=1" : ""}`);
  res.cookies.set(INVITE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

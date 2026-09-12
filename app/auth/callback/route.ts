import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** OAuth return. Exchanges the code, then enforces the league allowlist. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth`);

  let { data: membership } = await supabase.from("league_members").select("league_id").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!membership) {
    // allowlisted after first sign-in → join now
    const { data: claimed } = await supabase.rpc("fn_claim_membership");
    if (claimed) ({ data: membership } = await supabase.from("league_members").select("league_id").eq("user_id", data.user.id).limit(1).maybeSingle());
  }

  if (!membership) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_in_league`);
  }

  // Behind a proxy (Vercel) prefer the forwarded host so previews redirect to themselves.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost ? origin : `https://${forwardedHost}`;
  return NextResponse.redirect(`${base}/`);
}

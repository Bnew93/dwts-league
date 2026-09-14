import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public: the landing page (`/`), login, OAuth return, invite landing, legal, and the share-card images crawlers fetch unauthenticated.
const PUBLIC_PATHS = ["/login", "/auth", "/join", "/legal", "/opengraph-image", "/twitter-image", "/icon", "/robots.txt"];

/** last_seen_at is bumped at most once per 10 minutes per user; this cookie is the throttle. */
const SEEN_COOKIE = "ff_seen";
const SEEN_TTL = 600;
/** Slug of the league the user most recently opened; Home and the tab bar key off it. */
export const LEAGUE_COOKIE = "ff_league";

/**
 * Refreshes the Supabase session cookie, gates every non-public route behind login, and sends the
 * *.vercel.app production URL to the primary domain (PHASE_1_5 §10; previews are excluded).
 */
export async function updateSession(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const primary = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_ENV === "production" && primary && host.endsWith(".vercel.app")) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, primary);
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not add logic between createServerClient and getUser: it can cause random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login" && !request.nextUrl.searchParams.get("error")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const leagueMatch = user ? /^\/l\/([a-z0-9-]{2,32})(?:\/|$)/.exec(path) : null;
  if (leagueMatch && request.cookies.get(LEAGUE_COOKIE)?.value !== leagueMatch[1]) {
    response.cookies.set(LEAGUE_COOKIE, leagueMatch[1], { maxAge: 365 * 24 * 3600, sameSite: "lax", path: "/" });
  }

  if (user && !request.cookies.get(SEEN_COOKIE)) {
    await supabase.rpc("fn_touch_last_seen");
    response.cookies.set(SEEN_COOKIE, "1", { maxAge: SEEN_TTL, httpOnly: true, sameSite: "lax", path: "/" });
  }

  return response;
}

import type { MetadataRoute } from "next";

/** Only the landing page and legal pages are indexable; league, invite, and admin pages stay out (PHASE_1_5 §10). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/legal/"], disallow: ["/l/", "/join/", "/admin", "/leagues", "/account"] }],
  };
}

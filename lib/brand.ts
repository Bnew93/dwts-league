/**
 * Every user-facing product string lives here (PHASE_1_5 §2.5a). The product name must not
 * appear anywhere else in the codebase — not in DB objects, function names, or env vars.
 * Leagues keep their own `name` in the DB.
 */
export const BRAND = "Fantasy Footwork";
export const BRAND_SHORT = "Footwork";
export const TAGLINE = "Draft your couples. Survive the ballroom. Claim the Mirrorball.";
/** Shown in the footer of legal pages. */
export const LEGAL_ENTITY = "Fantasy Footwork";
/** The show this season of the product is built around (display copy only). */
export const SHOW_NAME = "Dancing with the Stars";
export const SHOW_SHORT = "DWTS";

/** Pre-written text under the invite link (wizard step 3 and Commissioner → Members). */
export function inviteMessage(leagueName: string, url: string): string {
  return `Join my ${SHOW_SHORT} fantasy league — ${leagueName}. Tap to sign in with Google and grab your seat: ${url}`;
}

import { BRAND, SHOW_NAME } from "@/lib/brand";

export const metadata = { title: `Terms · ${BRAND}` };

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p>Last updated September 13, 2026.</p>
      <p>
        {BRAND} is a free fantasy game played among friends. By signing in you agree to the few rules below.
      </p>

      <h2>The game</h2>
      <ul>
        <li>Leagues are private. You join one by invitation and play against the people in it.</li>
        <li>Results follow the television show. Eliminations and placements are entered from published show results and may be corrected.</li>
        <li>The commissioner of a league runs it: starting the draft, fixing rosters, removing members. Their calls stand within their league.</li>
        <li>No money changes hands through this site. Anything your league wagers among itself is its own business and not ours.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>One Google account per person. Don&apos;t pick for someone else or share your sign-in.</li>
        <li>Keep display names decent; everyone in your league sees them.</li>
        <li>You can delete your account at any time from the Account page.</li>
      </ul>

      <h2>Ours and theirs</h2>
      <p>
        {SHOW_NAME} and the names, likenesses, and photos of its cast belong to their owners. This site is a fan project, is not affiliated with the show
        or its network, and uses that material only to identify the couples you draft.
      </p>

      <h2>No promises</h2>
      <p>
        The site is provided as-is, for fun. It may be unavailable, it may have bugs, and a season may end differently than the standings say if a
        result was entered wrong. We do our best to fix mistakes quickly. We are not liable for anything that follows from using the site.
      </p>

      <h2>Changes</h2>
      <p>If these terms change in a way that matters, the date above changes and your commissioner will hear about it.</p>
    </>
  );
}

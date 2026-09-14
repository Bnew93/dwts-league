import { BRAND, SHOW_NAME } from "@/lib/brand";

export const metadata = { title: `Privacy · ${BRAND}` };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p>Last updated September 13, 2026.</p>
      <p>
        {BRAND} is a small fantasy game for friends who watch {SHOW_NAME}. This page says what we keep about you and why. It is written to be read, not
        skimmed past.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Google sign-in.</b> When you sign in we receive your Google account&apos;s name, email address, and profile photo. We use them to identify you
          to the other people in your league. We do not receive your password.
        </li>
        <li>
          <b>What you do in the game.</b> Leagues you create or join, draft picks, replacement picks, and settings you change. We keep a log of these
          actions (who did what, when) so leagues can be run fairly and so we can see whether the site is being used.
        </li>
        <li>
          <b>Technical basics.</b> Our hosting providers keep standard server logs (IP address, browser, pages requested) for a limited time to keep the
          service running and secure.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell or rent your information.</li>
        <li>We do not show ads or use advertising trackers.</li>
        <li>We do not read your Gmail, contacts, or anything beyond the basic profile Google shares at sign-in.</li>
      </ul>

      <h2>Who can see what</h2>
      <p>
        Members of a league see each other&apos;s display names, photos, rosters, and standings. Invite links are private to whoever holds them; anyone
        with a valid link can join a league that still has open seats. The site operator can see all leagues in order to run the service.
      </p>

      <h2>Where it lives</h2>
      <p>
        Data is stored with Supabase (database and sign-in) and the site is served by Vercel. Both are in the United States. Cookies are used only to
        keep you signed in and to carry an invite link through sign-in.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Go to <b>Account → Delete account</b>. Your sign-in and name are removed right away. Draft and roster history stays behind as &ldquo;Departed
        user&rdquo; so the seasons of the leagues you played in still add up.
      </p>

      <h2>Questions</h2>
      <p>Ask your league commissioner, who can reach the site operator.</p>
    </>
  );
}

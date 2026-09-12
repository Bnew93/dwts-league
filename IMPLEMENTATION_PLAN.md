# DWTS Fantasy League — Implementation Plan

Handoff spec for Claude Code. Work the phases in order; each has a Definition of Done. Do not start a phase until the previous DoD is met.

---

## 0. Context and hard constraints

| Item | Value |
|---|---|
| Show | Dancing with the Stars, Season 35 (ABC / Disney+) |
| Premiere | Tue Sept 15 + Wed Sept 16, 2026, 8 PM ET; then Tuesdays 8 PM ET |
| First elimination (expected) | Week 2 — Tue Sept 22, 2026 (week 1 historically has no elimination; verify) |
| Cast | 14 celebrity/pro couples (already published) |
| League size | ≤ 4 users |
| Draft deadline | Draft room live by **Sun Sept 13**; draft completed before **Sept 15 8 PM ET** |
| Results ingestion live by | **Wed Sept 23** (morning after first elimination) |

Priority order if time runs out: **Auth + Draft → Roster/Standings → Results ingestion → Replacement picks → Polish.**

---

## 1. Game rules (source of truth — encode these exactly)

### 1.1 Draft
- One league, one draft, held once before the season.
- **Snake draft.** Round 1 order is randomized by the commissioner at draft start (seeded RNG, stored). Even rounds reverse.
- Each pick = one couple. Rounds = `ROSTER_SIZE = floor(couple_count / user_count)` — for Season 35 that is **14 ÷ 4 = 3 rounds → 12 drafted, 2 leftovers**. Undrafted couples go to the **Leftovers pool**. If `couple_count mod user_count = 0` there are no leftovers and the entire Leftovers/replacement feature (§1.3) is hidden.
- **No pre-draft queues.** **Pick timer:** `PICK_SECONDS` (default 60). On expiry, auto-pick the available couple with the lowest `cast_order` (the order on the ABC cast reveal; commissioner can edit).
- Pick flow: user selects a couple → confirmation modal → pick is committed server-side (atomic; reject if not their turn or couple taken) → broadcast to room.
- Draft states: `pending → live → complete`. Once `complete`, the draft UI is hidden everywhere and the app opens on Standings.

### 1.2 Season progression
- Each show week, the couple(s) the show eliminates are marked `eliminated` with `elimination_week` and `placement`. Withdrawals (injury, etc.) are treated as eliminations at the week they leave.
- A user's roster is their **bracket**: couples drop off as they are eliminated. Nothing else changes rosters except replacement picks (1.3).
- Weeks may have **0, 1, or 2+ eliminations**; the finale assigns final placements to every remaining couple at once (winner = placement 1).

### 1.3 Replacement picks (Leftovers pool)
- When a user loses a couple, they receive a **replacement claim**. Claims are queued in elimination order.
- Same-night multiple eliminations: order by the show's announced elimination order; if unknown, the user with the **later** original round-1 draft slot picks first. Commissioner can reorder.
- Claims are fulfilled in queue order: user picks any couple from Leftovers. Deadline = `next_episode_air_time − 1 hour`. Missed deadline → auto-pick the leftover with the highest cumulative judges' score to date (ties → lowest `cast_order`).
- A replacement couple joins the roster immediately and is eligible for future replacement claims if it is later eliminated.
- When Leftovers is empty, claims are still created but marked `void` (no pick available). Lost couples are simply gone.

### 1.4 Standings and winner
Two independent tiers:
- **Tier 1 — Grand Champion:** the user whose roster contains the Mirrorball winner (placement 1) at season end. Exactly one user; displayed as a separate banner/trophy, not a leaderboard rank.
- **Tier 2 — Podium (1st / 2nd / 3rd):** ranked by **Survival Points**: each couple on a roster earns 1 point for every show week it survives while on that roster (replacement couples start earning the week they are picked; a couple eliminated in week N earns points for weeks < N). Tiebreak: number of active couples, then best placement among the user's couples, then earlier round-1 draft slot.
- The Grand Champion can also hold a podium spot; the two tiers do not exclude each other.
- Standings page shows: podium rank, user, survival points, active couples, best remaining couple, eliminated couples (greyed, with week); Grand Champion banner appears once placement 1 is recorded.

### 1.5 Roles
- `commissioner` (one user): start draft, edit league settings, run/override results, reorder claims.
- `member`: everything else.

---

## 2. Architecture

```
Browser ──> Next.js 15 (App Router, TS) on Vercel
              ├─ Server Actions: draft picks, replacement picks, admin overrides
              ├─ Supabase Auth (Google OAuth only)
              └─ Supabase Realtime: draft room channel (turn, timer, picks)
Supabase Postgres (RLS on) ──> pg_cron ──> pg_net ──> Edge Function `ingest-results`
                                                        └─ fetches Wikipedia S35 page, parses cast + status table,
                                                           diffs vs DB, writes eliminations/scores, creates claims
```

- **Why no separate API service:** ≤4 users, no long-running compute except ingestion (which lives in an Edge Function with a 150 s wall clock — plenty). Server Actions keep it one deployable.
- **Timer authority:** the server. `draft_state.turn_started_at` + `PICK_SECONDS` is the truth; clients render countdown from it; a pg_cron job (every 15 s while draft is `live`) runs `expire_overdue_pick()` to auto-pick. Do not trust client timers.
- **Ingestion source:** Wikipedia `Dancing_with_the_Stars_(American_TV_series)_season_35`, fetched via the MediaWiki Parse API (`action=parse&prop=text&format=json`). Parse the **couples table** (Celebrity / Notability / Professional / Status columns). Status cell examples: `Eliminated 1st on September 22, 2026`, `Withdrew on …`, `Third place on …`, `Runner-up on …`, `Winner on …`. Also parse the **weekly scores** section for judges' totals (used only for auto-pick tiebreaks and display; non-fatal if parsing fails).
- **Ingestion is idempotent**: every run upserts couples by normalized celebrity name, computes a diff, and writes `results_events` only for changes. Every run logs to `ingest_runs` (status, diff summary, raw hash). A parse failure never writes partial state.
- **Manual override always available** (admin page) — assume the scraper will break at least once per season.

---

## 3. Data model (Supabase migrations)

```sql
-- identity
profiles(id uuid pk references auth.users, display_name text, avatar_url text, role text check (role in ('commissioner','member')) default 'member', created_at)

-- league / settings (single row for now, but keyed for future seasons)
leagues(id uuid pk, name text, season int default 35, roster_size int default 3, pick_seconds int default 60,
        draft_status text check in ('pending','live','complete') default 'pending',
        draft_order uuid[] , draft_rng_seed text, current_pick int default 0,
        turn_started_at timestamptz, created_at)
league_members(league_id fk, user_id fk profiles, joined_at, primary key(league_id,user_id))

-- show data
couples(id uuid pk, league_id fk, season int, celebrity text, celebrity_key text unique(season,celebrity_key), professional text,
        notability text, cast_order int, status text check in ('active','eliminated','withdrew','finalist'),
        elimination_week int, elimination_date date, placement int, updated_at)
episodes(id uuid pk, season int, week int, air_date date, air_time timestamptz, title text, has_elimination bool)
judge_scores(couple_id fk, week int, total numeric, detail jsonb, primary key(couple_id, week))

-- draft
draft_picks(id uuid pk, league_id fk, round int, pick_no int, user_id fk, couple_id fk unique, auto bool default false, made_at timestamptz)

-- rosters (append-only ledger; current roster is derived)
roster_events(id uuid pk, league_id fk, user_id fk, couple_id fk,
              event text check in ('drafted','replacement','eliminated','withdrew'),
              week int, source text check in ('draft','claim','ingest','admin'), created_at)

-- replacement claims
replacement_claims(id uuid pk, league_id fk, user_id fk, lost_couple_id fk, queue_pos int,
                   status text check in ('pending','fulfilled','void','expired') default 'pending',
                   picked_couple_id fk null, deadline timestamptz, created_at, resolved_at)

-- ingestion
ingest_runs(id uuid pk, started_at, finished_at, status text, source_url text, content_hash text, diff jsonb, error text)
results_events(id uuid pk, run_id fk, couple_id fk, change jsonb, created_at)
```

Views / functions (Postgres, not app code):
- `v_current_rosters` — derived from `roster_events` (drafted/replacement minus eliminated/withdrew).
- `v_standings` — survival points, active count, best placement, per user.
- `fn_make_pick(league_id, user_id, couple_id)` — SECURITY DEFINER; validates turn + availability in one transaction; advances `current_pick`; sets `turn_started_at`; marks draft `complete` after last pick and writes `roster_events`.
- `fn_expire_overdue_pick()` — called by pg_cron; performs auto-pick per 1.1.
- `fn_apply_results(diff jsonb)` — applies an ingestion diff: updates `couples`, writes `roster_events`, creates `replacement_claims`, computes deadlines from `episodes`.
- `fn_fulfill_claim(claim_id, user_id, couple_id)` — validates queue head + leftover availability.
- `fn_expire_claims()` — pg_cron; auto-picks or voids per 1.3.

RLS: members can read everything in their league; write only via the SECURITY DEFINER functions above and their own `profiles` row. Commissioner-only tables/functions gated by `profiles.role`.

---

## 4. Phases

### Phase 0 — Scaffold (target: Fri Sept 11)
1. `npx create-next-app@latest dwts-league --ts --app --tailwind --eslint`; add `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `date-fns-tz`, `lucide-react`.
2. Supabase client helpers: `lib/supabase/server.ts`, `client.ts`, `middleware.ts` (session refresh).
3. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `INGEST_SECRET`, `WIKI_SEASON_PAGE`.
4. Supabase CLI linked to the project; migrations folder in repo; `supabase db push` is the only way schema changes reach the DB.
5. Migration 0001: everything in §3 + RLS + views + functions.
6. Auth: Google OAuth only (Supabase Auth Google provider; client ID/secret supplied by Bill — see §7). Login page has a single "Continue with Google" button. Profile row auto-created via trigger on `auth.users` insert, `display_name` defaulted from Google name, editable at `/profile`. Restrict sign-ups to an allowlist of the 4 members' emails (`league_members` seeded by commissioner; unlisted Google accounts are signed out with a "not in this league" message).
7. Seed: `scripts/seed-episodes.ts` inserts weeks 1–11 with Tuesday 8 PM ET air times starting Sept 15 (week 1 has two air dates; store both; week 1 `has_elimination=false`). Commissioner can edit later. `scripts/seed-members.ts` reads `seed/members.json` (`[{ "email": "...", "display_name": "...", "commissioner": true|false }]`) and populates `league_members` + the sign-in allowlist.

**DoD:** Deployed to Vercel preview. Two test users can log in and see an empty dashboard. Migrations apply cleanly from zero.

### Phase 1 — Cast import + Draft room (target: Sun Sept 13)
1. Build the Wikipedia parser first as a pure function `parseSeasonPage(html) → { couples[], scores[] }` with fixture tests (save the current page HTML to `fixtures/s35-preseason.html`). It is reused by Phase 3.
2. `scripts/import-cast.ts` runs the parser once and upserts the 14 couples with `status='active'`. Verify count = 14 and pairings match the ABC cast reveal.
3. League admin page (commissioner): set `roster_size`, `pick_seconds`, add members (by email), **Start Draft** button (randomizes order with a stored seed, sets `live`, `turn_started_at=now()`).
4. Draft room `/draft`:
   - Left: available couples (photo placeholder, celeb, pro, notability), search/filter.
   - Center: on-the-clock banner (user, countdown from server time), pick history board (rounds × users grid).
   - Right: my roster so far + Leftovers preview (couples that will be undrafted if the board plays out).
   - Pick → confirmation modal → `fn_make_pick` via Server Action → Realtime broadcast on `league:{id}` channel; all clients re-fetch draft state.
   - Subscribe to Postgres changes on `draft_picks` and `leagues` rather than custom messages where possible.
5. pg_cron: `expire_overdue_pick` every 15 s while any league is `live`.
6. On `complete`: `/draft` redirects to `/standings`; nav item removed.

**DoD:** 4 accounts complete a full 3-round draft on the preview deployment including at least one timer auto-pick; `roster_events` has 12 `drafted` rows; Leftovers pool shows 2 couples.

### Phase 2 — Rosters, Standings, Bracket view (target: Wed Sept 16)
1. `/standings` (home after draft): leaderboard from `v_standings`; each row expands to that user's roster with status chips.
2. `/team` (my roster): active couples, eliminated couples with week/placement, pending replacement claim card (Phase 4 wires it up).
3. `/bracket`: season view — columns = weeks; each couple is a lane that ends at its elimination week; colored by owner; Leftovers in grey. This is the "overall bracket elimination and win progression" view.
4. `/couples/[id]`: status history, weekly judges' scores (chart), owner history.
5. Mobile-first layout; this will mostly be used on phones on Tuesday nights.

**DoD:** With seeded fake eliminations (via admin override, Phase 3 step 1), all three views reflect the change without a refresh trigger beyond page load.

### Phase 3 — Automated results ingestion (target: Sat Sept 19; must be live Wed Sept 23)
1. **Admin override first** (`/admin/results`): commissioner can mark a couple eliminated/withdrew for week N, set placement, undo. Calls `fn_apply_results` with a hand-built diff. This is the fallback and also the test harness for Phase 2.
2. Edge Function `ingest-results` (Deno): fetch page → `parseSeasonPage` → build diff vs `couples` → if diff non-empty call `fn_apply_results` → write `ingest_runs`. Auth via `INGEST_SECRET` header. Returns diff summary.
3. Diff rules: only transitions `active → eliminated|withdrew|finalist` and placement assignments are applied automatically. Any transition that would *un-eliminate* a couple is flagged and **not** applied (logged as `needs_review`) — Wikipedia vandalism guard.
4. Schedule (pg_cron + pg_net → Edge Function): Wednesdays 06:00, 09:00, 12:00, 18:00 ET; Thursdays 09:00 ET catch-up. Skip if `episodes` says no episode aired in the last 48 h.
5. Admin page shows last 10 `ingest_runs` with diff, a **Run now** button, and `needs_review` items with Apply/Dismiss.
6. Judges' scores: parse weekly totals into `judge_scores`; non-fatal.

**DoD:** Replay test: point `WIKI_SEASON_PAGE` at a saved Season 34 fixture set (pre-season, week 3, finale snapshots) and confirm ingestion produces the correct sequence of `results_events` and final placements with zero manual steps. Then run live against S35 preseason page → diff must be empty.
*Fixture note:* the live S34 page only shows its final state. Build the pre-season and mid-season fixtures from page history via the MediaWiki API (`action=parse&oldid=<revision>`); pick revisions dated ~Sept 15 2025, ~Oct 7 2025, and post-finale Dec 2025 from the page's revision list.

### Phase 4 — Replacement picks (target: Mon Sept 21)
1. `fn_apply_results` already creates `replacement_claims` with `queue_pos` and `deadline` (from next `episodes.air_time − 1h`).
2. `/team` shows the claim card when the user is at the head of the queue: Leftovers list → confirm → `fn_fulfill_claim` → `roster_events(replacement)`.
3. Users behind in the queue see "Waiting on {name}". Commissioner can reorder/void claims on `/admin/claims`.
4. pg_cron `expire_claims` hourly.
5. Email notification (Supabase Auth SMTP or Resend) when a claim opens — optional but cheap; do it if Phase 3 finished on time.

**DoD:** Simulate a double elimination via admin override; two claims queue correctly; first fulfills, second auto-picks on expiry; empty-pool case voids cleanly.

### Phase 5 — Polish (rolling)
- Finale handling: when all remaining couples get placements in one run, mark season `complete` and show champion banner on `/standings`.
- Realtime on `/standings` and `/team` so Tuesday-night watchers see updates land.
- Season archive: everything is keyed by `season`; nothing hard-codes 35 except the default.

---

## 5. Testing & ops
- Unit tests: parser (fixtures), draft order math (snake), standings math (survival points), claim ordering.
- Integration: Supabase local (`supabase start`) for function tests; one Playwright flow for the draft.
- Ingestion alerting: if an `ingest_runs` row has `status='error'` or a Wednesday passes with no successful run, email the commissioner (Edge Function checks its own last-success).
- Backups: Supabase daily backups are on by default; additionally export `roster_events` + `couples` as JSON to the repo after the draft (immutable record of the draft).

---

## 6. Decisions (resolved by Bill, Sept 11)
1. Scoring is two-tier: Grand Champion (Mirrorball owner) + survival-points podium (§1.4).
2. 4 users; `ROSTER_SIZE = floor(14/4) = 3`; Leftovers pool exists only when the division leaves a remainder (§1.1).
3. No pre-draft queues; timer expiry auto-picks by `cast_order` (§1.1).
4. Google sign-in only, allowlisted to league members (§4 Phase 0).
5. Same-night elimination claim ordering: default in §1.3 stands (show's announced order, else later round-1 slot picks first) unless Bill changes it.

## 7. Infrastructure checklist (Bill, before Phase 0)
- [x] Supabase project `dwts-league` in org Newhart — created Sept 11. Ref `kuuvuywwiaoakdpnbqch`, URL `https://kuuvuywwiaoakdpnbqch.supabase.co`, region us-east-1. Publishable key `sb_publishable_8x6u3-FlSsud4jly28gLTA_n6musKvT` (use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Service role key: Dashboard → Project Settings → API Keys.
- [ ] Google Cloud Console → OAuth 2.0 Client ID (Web). Authorized redirect URI: `https://kuuvuywwiaoakdpnbqch.supabase.co/auth/v1/callback`. Paste client ID/secret into Supabase Auth → Providers → Google.
- [ ] GitHub repo `dwts-league`; `CLAUDE.md` + `IMPLEMENTATION_PLAN.md` at root.
- [ ] Vercel project linked to the repo; env vars from Phase 0 step 3 set for Preview + Production; add the Vercel URL(s) to Supabase Auth → URL Configuration (site URL + redirect list).
- [ ] Local: `supabase login && supabase link --project-ref <ref>` so Claude Code can `db push`.
- [ ] `pg_cron` and `pg_net` extensions: either enable in the dashboard (Database → Extensions) or have migration 0001 run `create extension if not exists pg_cron; create extension if not exists pg_net;` — Claude Code's choice, but 0001 must not assume they exist without doing one of these.
- [ ] Send the other three members' Gmail addresses to the commissioner seed (Phase 0 step 7).

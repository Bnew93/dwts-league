# Phase 1.5 — Multi-League Refactor

Companion to `IMPLEMENTATION_PLAN.md`. Insert between Phase 2 and Phase 3. Read §1 (rules) and §3 (data model) of the main plan first; this document changes §3 and adds features. Where the two conflict, this document wins.

**Hard deadline:** cutover complete before the first elimination (Tue Sept 22, 2026, 8 PM ET). Target: cutover Wed Sept 16 – Thu Sept 17. A second league must be able to create, invite, and draft by Sun Sept 20.

**Non-negotiable:** League 1's completed draft (12 `draft_picks`, 12 `roster_events`, 4 members) must survive the migration byte-for-byte in meaning. Verify before and after (§7).

---

## 1. Role model

Two independent layers. Never conflate them.

| Layer | Where | Values | Set by |
|---|---|---|---|
| League role | `league_members.role` | `commissioner` \| `member` | League creation (creator = commissioner); transferable via `fn_transfer_commissioner` |
| Platform role | `profiles.is_platform_admin boolean default false` | true/false | Migration only, keyed to Bill's `auth.users.id`. No UI path sets it. |

- `profiles.role` is **removed**.
- Exactly one commissioner per league (partial unique index on `(league_id) where role='commissioner'`).
- Platform admin can **read** everything. Platform-admin **writes** go through `fn_admin_*` functions that insert an `audit_log` row. No direct table writes from the admin UI.
- Platform admin is not implicitly a member of any league. To act as commissioner in a league, Bill joins it like anyone else.

Rename throughout the UI: league-level "Admin" → **"Commissioner"**. Platform-level dashboard is **"Admin"** and is visible only when `is_platform_admin`.

---

## 2. Schema changes (migration 0002)

### 2.1 Show data becomes season-scoped (shared across leagues)
```sql
alter table couples drop column league_id;   -- keep unique(season, celebrity_key)
alter table episodes drop column league_id;  -- if present
```
`draft_picks`, `roster_events`, `replacement_claims` already carry `league_id` + `couple_id`; unchanged.

### 2.2 Leagues
```sql
alter table leagues
  add column slug text unique not null,            -- backfill league 1 first (e.g. 'og')
  add column created_by uuid references profiles(id),
  add column status text check (status in ('setup','drafting','active','complete')) default 'setup',
  add column member_cap int not null check (member_cap between 2 and 14),   -- set at creation; editable while status='setup'
  add column member_count_locked int,              -- set at draft start; drives roster_size
  add column created_at timestamptz default now();
-- draft_status ('pending','live','complete') is superseded by status; migrate values then drop draft_status.
```
Status mapping: `pending→setup`, `live→drafting`, `complete→active`; `complete` (league) is set when all couples in the season have placements.

### 2.3 Members
```sql
alter table league_members
  add column role text check (role in ('commissioner','member')) not null default 'member',
  add column joined_via uuid references league_invites(id);
create unique index one_commissioner_per_league on league_members(league_id) where role='commissioner';
```
Backfill: Bill's row in league 1 → `commissioner`.

### 2.4 Invites (link only for the POC; email invites deferred)
```sql
create table league_invites(
  id uuid pk default gen_random_uuid(),
  league_id uuid references leagues(id) on delete cascade,
  token text unique not null,           -- 32 bytes base64url, generated server-side
  created_by uuid references profiles(id),
  expires_at timestamptz,               -- null = no expiry
  max_uses int,                         -- null = unlimited (cap still applies)
  use_count int default 0,
  revoked_at timestamptz,
  created_at timestamptz default now()
);
create unique index one_active_invite_per_league on league_invites(league_id) where revoked_at is null;
```
- One active link per league; regenerate revokes the previous. Shared to group chats via copy or native share sheet. Anyone who follows it and signs in with Google joins, subject to the cap.
- `fn_join_league` rejects when `count(league_members) >= member_cap` with "League is full".
- **Deferred:** email invites (`kind`, `email`, `accepted_by` columns; Resend). Leave the table shape extensible — add columns later, don't redesign.

### 2.5 Activity + audit
```sql
create table activity_log(
  id bigint generated always as identity pk,
  user_id uuid references profiles(id),
  league_id uuid references leagues(id),
  action text not null,                 -- 'login','league.create','league.join','draft.pick','claim.fulfill','page.view', ...
  meta jsonb,
  created_at timestamptz default now()
);
create index on activity_log(created_at);
create index on activity_log(league_id, created_at);

create table audit_log(
  id bigint generated always as identity pk,
  actor_id uuid references profiles(id),
  action text not null,
  target jsonb,                         -- {table, id}
  before jsonb, after jsonb,
  created_at timestamptz default now()
);
alter table profiles add column last_seen_at timestamptz;
alter table profiles add column is_platform_admin boolean not null default false;
alter table profiles add column disabled_at timestamptz;   -- platform admin only; middleware signs out disabled users
```
Every server action writes one `activity_log` row. Middleware bumps `last_seen_at` at most once per 10 minutes per user.

### 2.5a Future-platform hooks (cheap now, expensive later)
```sql
create table shows(id text pk, name text not null, active boolean default true);   -- one row: ('dwts','Dancing with the Stars')
alter table leagues add column show_id text not null default 'dwts' references shows(id);
alter table couples add column show_id text not null default 'dwts' references shows(id);
alter table episodes add column show_id text not null default 'dwts' references shows(id);
```
No behavior change; this avoids touching every table when a second show is added. Do **not** generalize the parser or rules yet.

Brand: all user-facing product strings (name, tagline, share-message copy, legal entity line) live in `lib/brand.ts`. The string "Fantasy Footwork" appears nowhere else in the codebase — not in DB objects, function names, or env var names.

### 2.6 Drop the allowlist
Remove the `seed/members.json` allowlist logic and any `allowed_emails` table. Sign-in with no memberships routes to `/leagues/new-or-join`.

### 2.7 Views
- `v_current_rosters`, `v_standings` — add `league_id` grouping if not already present.
- `v_admin_league_stats` — per league: member count, status, draft completed_at, last activity, picks made, claims pending.
- `v_admin_platform_stats` — totals: users, leagues by status, DAU/WAU/MAU from `activity_log`, drafts completed, last successful ingest run.

### 2.8 RLS
Replace allowlist policies with membership policies:
- `is_member(league_id)` = exists row in `league_members` for `auth.uid()`.
- `is_commissioner(league_id)` = same with `role='commissioner'`.
- `is_platform_admin()` = `profiles.is_platform_admin` for `auth.uid()`.
- Read: members of the league, or platform admin. `couples`/`episodes`/`judge_scores`: any authenticated user (public show data).
- Write: only via SECURITY DEFINER functions. `league_invites`: commissioner of that league. `activity_log`: insert-only by authenticated users for their own `user_id`.

---

## 3. Functions (new or changed)

- `fn_create_league(name, slug, member_cap)` → creates league (`setup`) with the cap, adds creator as commissioner (counts toward cap), creates the first link invite, logs activity. Slug validated `^[a-z0-9-]{3,32}$`, unique. Rejects if the user already has 3 leagues in `setup` (anti-spam). Returns derived preview: `roster_size = floor(couple_count / member_cap)`, `leftovers = couple_count mod member_cap`.
- `fn_update_league_settings(league_id, name?, member_cap?)` → commissioner only, status `setup` only; `member_cap` cannot drop below current member count.
- `fn_join_league(token)` → validates invite (not revoked, not expired, under max_uses), enforces `member_cap`, rejects if league status ≠ `setup` ("Draft has started"), inserts member, increments `use_count`, logs. Idempotent: an existing member following the link is just redirected.
- `fn_remove_member(league_id, user_id)` → commissioner only. Status `setup`: hard delete from `league_members`. Status `drafting`/`active`: not allowed — use `fn_leave_league` semantics via commissioner (`fn_commissioner_remove_active_member`) which writes `roster_events(event='departed')` and returns the couples to Leftovers; requires confirm dialog.
- `fn_regenerate_invite(league_id, expires_at, max_uses)` → commissioner only; revokes current link, creates new.
- `fn_start_draft(league_id)` → commissioner only; requires ≥2 members; if `member_count < member_cap`, the UI asks "Start with N of M? Roster size becomes floor(14/N)" and on confirm sets `member_cap = member_count`; sets `member_count_locked`, computes `roster_size`, randomizes order, revokes the active invite, status `drafting`.
- `fn_make_pick`, `fn_expire_overdue_pick` → already league-scoped; `fn_expire_overdue_pick` must iterate **all** leagues in `drafting`.
- `fn_apply_results(diff)` → now: update `couples` once, then **for each league in the season with status in (`active`,`drafting`)**: write `roster_events`, create `replacement_claims`. Idempotent per league.
- `fn_expire_claims()` → iterate all leagues.
- `fn_commissioner_override(league_id, couple_id, event, week)` → commissioner only; writes **league-scoped** `roster_events` only. Does **not** touch `couples`. Logs audit.
- `fn_transfer_commissioner(league_id, to_user_id)` → current commissioner only; both rows updated atomically.
- `fn_leave_league(league_id)` → member only (commissioner must transfer first); if league `active`, user's couples → `roster_events(event='departed')` and become Leftovers.
- `fn_delete_league(league_id)` → commissioner only; status must be `setup`.
- `fn_admin_*` (platform admin only): `fn_admin_set_couple_status`, `fn_admin_force_ingest_apply`, `fn_admin_revoke_invite`. Each writes `audit_log`.

---

## 4. Routes

```
/                          → if 1 membership: redirect to /l/[slug]; if >1: league picker; if 0: /leagues/new-or-join
/leagues/new               → 3-step wizard (see §4.1)
/join/[token]              → Google sign-in if needed → fn_join_league → redirect /l/[slug]
                             Token must survive the OAuth round-trip: on arrival, store it in a short-lived (15 min) httpOnly cookie
                             `ff_invite`, then start sign-in. `/auth/callback` reads the cookie, calls fn_join_league, clears it.
                             Do not pass the token through the OAuth `state` or `redirectTo` query — those are logged by Google/Supabase.
/l/[slug]                  → standings (home)
/l/[slug]/draft            → draft room (only while status='drafting'; else redirect)
/l/[slug]/team             → my roster + claims
/l/[slug]/bracket          → season lanes view
/l/[slug]/commissioner     → tabs: Members (seats: joined / open; remove; copy / share / regenerate / revoke invite link), Settings (name, cap while setup), Draft (start), Results (league-scoped overrides), Claims (queue reorder/void), Transfer, Delete
/admin                     → platform dashboard (is_platform_admin only; 404 otherwise, not 403)
/admin/leagues/[id]        → drill-in: members, activity, roster, audit rows
/admin/ingest              → ingest_runs, needs_review, run-now (moved from /admin/results)
/legal/privacy, /legal/terms
/account                   → display name, delete account
```
League switcher in the nav when memberships > 1.

### 4.1 League creation wizard (`/leagues/new`)
Single page, three steps, state kept client-side until the final submit (one `fn_create_league` call, then invites).

1. **Size.** "How many people are playing?" — stepper 2–14. Live preview beneath: "Each player drafts **3** couples · **2** go to the Leftovers pool" (recomputed from the current season's couple count). This is the cap.
2. **Name.** League name (slug auto-suggested, editable, availability checked on blur).
3. **Invite.** One action: **Create invite link**. Shows the share URL with a large "Copy link" button and, where `navigator.share` is available (feature-detect; mostly mobile), a "Share…" button that opens the native share sheet so it drops straight into iMessage / WhatsApp / group texts. On desktop show copy only — never a dead Share button. Pre-written message under it: "Join my DWTS fantasy league — {League}. Tap to sign in with Google and grab your seat: {url}". Skip is allowed; the link is always available on Commissioner → Members.
   *(Email invites deferred to a later phase.)*

Finish → `/l/[slug]/commissioner` Members tab showing "1 of N joined" with seats visualized as filled / open.

---

## 5. Admin dashboard (`/admin`)

Cards: total users · leagues by status · DAU / WAU / MAU (distinct `user_id` in `activity_log` over 1/7/30 days) · drafts completed · claims pending platform-wide · last ingest run status + time · couples remaining this season.

Table: all leagues from `v_admin_league_stats`, sortable, link to drill-in.

Charts (recharts, small): daily active users last 30 days; league creations per day.

Read-only except the `fn_admin_*` actions, each behind a confirm dialog and each producing an `audit_log` row visible on the same page.

---

## 6. Account deletion
`/account` → "Delete account" → confirm → `fn_delete_account()`: if user is commissioner of any league in `setup`/`drafting`, block with instruction to transfer first. Otherwise: `fn_leave_league` for each membership, anonymize `profiles` row (`display_name='Departed user'`, null email fields), then `auth.admin.deleteUser` from a server action with service role. `activity_log` rows retained with the anonymized profile id.

---

## 7. Cutover checklist

1. Free tier — no branching, and the org may be at its 2-project cap. Test locally instead: `supabase start`, restore the prod dump from step 2 into the local DB, apply 0002 there. Point a Vercel preview at the local stack via a tunnel if needed, or run the app locally against it.
2. Snapshot prod first: `pg_dump` of `leagues, league_members, draft_picks, roster_events, couples, episodes, profiles` → commit to `backups/pre-0002-<date>.sql`.
3. Record verification fingerprint on prod: `select count(*), md5(string_agg(couple_id::text||user_id::text||round::text, ',' order by pick_no)) from draft_picks;` and same for `roster_events`. Save the values.
4. Apply migration 0002 locally. Run the fingerprint queries; values must match.
5. Smoke test locally as each of the 4 league-1 users (or as 4 test accounts): standings, team, bracket render identically to prod.
6. Create a second league locally, join via invite from an incognito window, start and complete a 2-user draft, confirm `fn_apply_results` with a fake diff writes `roster_events` to **both** leagues.
7. Announce a 15-minute maintenance window to league 1 (any evening Sept 16–17, not Tuesday 8–10 PM ET).
8. `supabase db push` to prod. Re-run fingerprints. Deploy Vercel production with `fantasyfootwork.com` as the primary domain (§10). Redirect old routes (`/standings` → `/l/og`) for one season.
9. Set `is_platform_admin=true` for Bill's user id via migration 0003 (single `update`, committed to repo).
10. Tag the repo `v1.5.0`. Confirm the nightly backup workflow (§8) has produced its first dump.

Rollback: if fingerprints mismatch post-push, restore from `backups/pre-0002-*.sql` into a fresh schema and re-point; the window between push and verify is under five minutes.

---

## 8. Infrastructure (decided Sept 13: stay on free tiers)

**Bill:**
- [ ] Buy `fantasyfootwork.com` at Hostinger (domain only, WHOIS privacy). Add to Vercel; switch Hostinger nameservers to Vercel's. Wait for SSL.
- [ ] Supabase Auth → URL Configuration: Site URL `https://fantasyfootwork.com`; redirect list = `https://fantasyfootwork.com/auth/callback`, `https://*.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`.
- [ ] Google Cloud Console → OAuth consent screen: app name "Fantasy Footwork", homepage `https://fantasyfootwork.com`, privacy policy `https://fantasyfootwork.com/legal/privacy` (after §4 ships the page) → **Publish to Production**. Basic scopes only; no verification review. This removes the manual test-user list and is required for invite links to work for anyone.
- [ ] Vercel env: `NEXT_PUBLIC_APP_URL=https://fantasyfootwork.com` (Production); preview deployments leave it unset and fall back to `VERCEL_URL`.
- [ ] Add a `SUPABASE_DB_URL` secret to the GitHub repo for the backup workflow below.

**Claude Code (in Phase 1.5 scope, compensating for free-tier gaps):**
- `.github/workflows/backup.yml` — nightly `pg_dump --data-only --schema=public` via the pooler connection string, gzip, commit to a private `fantasyfootwork-backups` repo (or upload as a workflow artifact with 90-day retention if a second repo is unwanted). Fail loudly (workflow failure email) if the dump is empty or smaller than the previous one by >50%.
- `.github/workflows/keepalive.yml` — daily authenticated request to a trivial RPC (`select 1` via PostgREST) so the free project never idles 7 days mid-season.
- Both workflows documented in `CLAUDE.md` under Commands.

**Deferred until needed:** Supabase Pro (pausing + managed backups), Vercel Pro (commercial use / team seats), Resend (email invites, claim notifications).

---

## 10. Domain and routing

- Primary domain `fantasyfootwork.com`; `www` redirects to apex (301).
- `*.vercel.app` production URL redirects to `fantasyfootwork.com` (Vercel domain settings → redirect), so no old link, bookmark, or shared invite survives on the deployment URL.
- Preview deployments stay on their `*.vercel.app` URLs (needed for testing; excluded from the redirect).
- All generated URLs (invite links, share messages, OAuth redirectTo) build from `NEXT_PUBLIC_APP_URL`, never from `window.location`.
- League-1 legacy routes (`/standings`, `/team`, `/bracket`, `/draft`) → 308 to `/l/og/...` for one season, then removed.
- `robots.txt`: disallow `/l/`, `/join/`, `/admin`; allow `/`, `/legal/*`. There is nothing to index yet.

---

## 9. Definition of Done
- League 1 fingerprints match pre/post migration; all 4 users confirm their roster is intact.
- A brand-new Google account can: follow the invite link → sign in → land in the league → see the draft room once started. An existing member following the link is redirected, not duplicated.
- Cap enforced: with `member_cap=4` and 4 members, a 5th join attempt via link is refused with "League is full". Commissioner can remove a `setup`-status member and the seat reopens. A revoked link shows "This invite is no longer valid".
- Starting a draft with fewer members than the cap prompts the confirm and locks `member_cap` to the actual count; roster size on the draft board matches `floor(14/N)`.
- Two leagues in `active` status both receive `roster_events` from a single `fn_apply_results` call.
- `/admin` renders for Bill and returns 404 for every other user (tested with a member account).
- `activity_log` receives rows for login, join, pick, and claim actions.
- No `league_id` remains on `couples` or `episodes`; no reference to `seed/members.json` remains in the repo.
- Visiting the `*.vercel.app` production URL lands on `fantasyfootwork.com`; a generated invite link begins with `https://fantasyfootwork.com/join/`.
- Google sign-in completes from `fantasyfootwork.com` in an incognito window with a Google account that has never been a test user.
- `grep -ri "fantasy footwork" --exclude=lib/brand.ts` returns nothing outside `brand.ts`, `legal/*`, and the README.
- Backup workflow has run once and produced a non-empty dump; keepalive workflow has run once successfully.

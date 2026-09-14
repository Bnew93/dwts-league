# CLAUDE.md — DWTS Fantasy League

Read `IMPLEMENTATION_PLAN.md` first. It is the spec. Sections 1 (rules) and 3 (data model) are authoritative; if code and spec disagree, the spec wins unless Bill says otherwise.

`PHASE_1_5_MULTI_LEAGUE.md` runs between Phase 2 and Phase 3 and supersedes §3 of the main plan where they conflict. Product name is **Fantasy Footwork**; the domain is `fantasyfootwork.com`. The brand string lives only in `lib/brand.ts`.

## Working agreement
- Work one phase at a time, in order. Before starting a phase, restate its Definition of Done and list the files you expect to touch. After finishing, run the DoD checks and report results before moving on.
- Never change the schema except through a new migration file in `supabase/migrations/`. Apply it with the Supabase MCP `apply_migration` tool (project ref `kuuvuywwiaoakdpnbqch`) using the same name as the file, so the file and the DB's migration history stay in lockstep. (Bill chose this over the Supabase CLI on Sept 12 and reconfirmed on Sept 13.) Ad-hoc SQL is allowed only for reading and for seeding reference data (episodes), never for roster state.
- Before a migration that touches roster tables, snapshot the data to `backups/` (`npm run snapshot -- <label>` with a service-role key, or via read-only SQL) and put a fingerprint check inside the migration so it rolls back on any change to `draft_picks` / `roster_events` (see 0013).
- All roster-affecting writes go through the Postgres functions (`fn_make_pick`, `fn_apply_results`, `fn_fulfill_claim`, `fn_expire_*`, `fn_commissioner_override`, `fn_depart_member`). Never write to `roster_events`, `draft_picks`, or `couples.status` directly from app code.
- Timer and turn authority is the server (`leagues.turn_started_at`). Client timers are display only.
- The Wikipedia parser is a pure function with fixture tests. Change the parser only with a new fixture that demonstrates the case.
- Ingestion must be idempotent and must never apply a transition that un-eliminates a couple automatically (flag as `needs_review`).
- Keep every feature keyed by `season` (and `show_id`); do not hard-code 35 outside defaults. `fn_current_season()` finds the season with show data.
- Mobile-first. Assume phone use on Tuesday nights.

## Multi-league model (Phase 1.5, live since Sept 13)
- `couples` / `episodes` are shared show data keyed by `(show_id, season)`; every league in a season draws from the same pool. `draft_picks` is unique per `(league_id, couple_id)`.
- `leagues.status`: `setup → drafting → active → complete`. `member_cap` is the seat count (commissioner included and drafting by default); `member_count_locked` and `roster_size` are fixed at draft start from the *player* count.
- League role is `league_members.role` (`commissioner` | `member`, exactly one commissioner). Platform role is `profiles.is_platform_admin`, set only by migration (0014 = Bill). `profiles.role` no longer exists.
- League 1 is slug `og` (cap 5, 4 drafting seats, roster 4). Its `is_player=false` commissioner is legacy; new leagues do not expose that toggle.
- Membership comes from invite links (`league_invites`, one active per league). There is no allowlist.
- `fn_apply_results(diff)` updates `couples` once and fans out roster events + claims to every league in the season. Only the platform admin (or the service role) may call it; commissioners get league-scoped `fn_commissioner_override`.
- Routes: `/l/[slug]/*` for league pages, `/leagues/new` wizard, `/join/[token]`, `/admin/*` (platform, 404 for non-admins), `/account`, `/legal/*`. Legacy `/standings`, `/team`, `/bracket`, `/draft`, `/couples/:id` 308 to `/l/og/...` for this season (see `next.config.ts`).
- All generated URLs come from `lib/url.ts` (`NEXT_PUBLIC_APP_URL`, falling back to `VERCEL_URL`), never `window.location`.
- Every server action logs one `activity_log` row (`lib/activity.ts` or inside the SQL function). Platform-admin and commissioner writes also leave an `audit_log` row.

## Stack
Next.js 15 (App Router, TypeScript, Tailwind) on Vercel · Supabase (Auth, Postgres, Realtime, Edge Functions, pg_cron/pg_net) · Deno for Edge Functions.

## Commands
- `npm run dev` — local app
- Migrations: write `supabase/migrations/NNNN_name.sql`, apply via MCP `apply_migration` (no local Supabase CLI)
- Edge Functions: deploy via MCP `deploy_edge_function`
- `npm test` — unit tests (parser, draft math, standings)
- `npm run seed:episodes` — reference data (add `-- --sql` to print SQL instead)
- `npm run import-cast` — one-time cast import (Phase 1); season-scoped, no league
- `npm run snapshot -- <label>` — dump every public table to `backups/<label>.json` (needs `SUPABASE_SERVICE_ROLE_KEY`)
- `.github/workflows/backup.yml` — nightly `pg_dump --data-only --schema=public` → 90-day artifact `db-dump`; fails if empty or >50% smaller than the last one. Needs repo secret `SUPABASE_DB_PASSWORD` (raw Postgres password; host/user are fixed in the workflow).
- `.github/workflows/keepalive.yml` — daily PostgREST ping (`fn_current_season`) so the free project never idles. Needs repo variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Season 35 facts (verified Sept 12 from Wikipedia)
- **16 couples**, not 14 as the plan assumed. League 1 drafted 16 with `roster_size 4` (0 leftovers, replacement feature hidden). A new 4-seat league also gets 4 each; a 5-seat league gets 3 each with 1 leftover.
- Wikipedia cast table uses a `rowspan` "Participating" Status cell across all rows pre-season; the parser must carry rowspans down.
- Fixture: `fixtures/s35-preseason.html` (revision in `fixtures/s35-preseason.meta.txt`).

## Env
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never shipped to client; used for account deletion), `NEXT_PUBLIC_APP_URL` (production only), `INGEST_SECRET`, `WIKI_SEASON_PAGE`.

## Dates that matter
Premiere Sept 15/16 2026 · first expected elimination Sept 22 · ingestion must be live Sept 23.

## When unsure
Stop and ask. A wrong roster write on Tuesday night is worse than a delay.

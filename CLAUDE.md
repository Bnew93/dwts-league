# CLAUDE.md — DWTS Fantasy League

Read `IMPLEMENTATION_PLAN.md` first. It is the spec. Sections 1 (rules) and 3 (data model) are authoritative; if code and spec disagree, the spec wins unless Bill says otherwise.

## Working agreement
- Work one phase at a time, in order. Before starting a phase, restate its Definition of Done and list the files you expect to touch. After finishing, run the DoD checks and report results before moving on.
- Never change the schema except through a new migration file in `supabase/migrations/`. Apply it with the Supabase MCP `apply_migration` tool (project ref `kuuvuywwiaoakdpnbqch`) using the same name as the file, so the file and the DB's migration history stay in lockstep. (Bill chose this over the Supabase CLI on Sept 12 to keep setup light.) Ad-hoc SQL is allowed only for reading and for seeding reference data (episodes, allowlist), never for roster state.
- All roster-affecting writes go through the Postgres functions (`fn_make_pick`, `fn_apply_results`, `fn_fulfill_claim`, `fn_expire_*`). Never write to `roster_events`, `draft_picks`, or `couples.status` directly from app code.
- Timer and turn authority is the server (`leagues.turn_started_at`). Client timers are display only.
- The Wikipedia parser is a pure function with fixture tests. Change the parser only with a new fixture that demonstrates the case.
- Ingestion must be idempotent and must never apply a transition that un-eliminates a couple automatically (flag as `needs_review`).
- Keep every feature keyed by `season`; do not hard-code 35 outside defaults.
- Mobile-first. Assume phone use on Tuesday nights.

## Stack
Next.js 15 (App Router, TypeScript, Tailwind) on Vercel · Supabase (Auth, Postgres, Realtime, Edge Functions, pg_cron/pg_net) · Deno for Edge Functions.

## Commands
- `npm run dev` — local app
- Migrations: write `supabase/migrations/NNNN_name.sql`, apply via MCP `apply_migration` (no local Supabase CLI)
- Edge Functions: deploy via MCP `deploy_edge_function`
- `npm test` — unit tests (parser, draft math, standings)
- `npm run seed:episodes` / `npm run seed:members` — reference data (add `-- --sql` to print SQL instead)
- `npm run import-cast` — one-time cast import (Phase 1)

## Season 35 facts (verified Sept 12 from Wikipedia)
- **16 couples**, not 14 as the plan assumed. With 4 users: `roster_size 4` → 16 drafted, 0 leftovers (replacement feature hidden); `roster_size 3` → 12 drafted, 4 leftovers.
- Wikipedia cast table uses a `rowspan` "Participating" Status cell across all rows pre-season; the parser must carry rowspans down.
- Fixture: `fixtures/s35-preseason.html` (revision in `fixtures/s35-preseason.meta.txt`).

## Env
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never shipped to client), `INGEST_SECRET`, `WIKI_SEASON_PAGE`.

## Dates that matter
Premiere Sept 15/16 2026 · first expected elimination Sept 22 · ingestion must be live Sept 23.

## When unsure
Stop and ask. A wrong roster write on Tuesday night is worse than a delay.

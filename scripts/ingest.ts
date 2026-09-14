/**
 * Results ingestion CLI (Phase 3). Runs from the GitHub Action on the Wednesday schedule and by
 * hand. Fetches the season's Wikipedia page, diffs it against the database, and applies through
 * fn_apply_results, which updates every league in the season at once.
 *
 *   npm run ingest -- --dry-run              # print what would happen; no database writes
 *   npm run ingest -- --force                # run even if no episode aired in the last 48h
 *   npm run ingest -- --fixture fixtures/s34-final.html --season 34 --dry-run
 *   INGEST_MODE=review npm run ingest        # never apply; park diffs for /admin/ingest (default)
 *   INGEST_MODE=apply  npm run ingest        # apply the safe part of the diff automatically
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WIKI_SEASON_PAGE, optional SEASON,
 * SHOW_ID, INGEST_MODE. Exit code 1 on an error run so the workflow emails.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runIngest, type IngestMode } from "../lib/ingest/run";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const dry = process.argv.includes("--dry-run");
  const envMode = (process.env.INGEST_MODE ?? "review") as IngestMode;
  const mode: IngestMode = dry ? "dry" : envMode === "apply" ? "apply" : "review";
  const fixture = arg("--fixture");
  const showId = process.env.SHOW_ID ?? "dwts";
  const season = Number(arg("--season") ?? process.env.SEASON ?? 35);
  const page = fixture ?? process.env.WIKI_SEASON_PAGE ?? "Dancing_with_the_Stars_(American_TV_series)_season_35";

  const summary = await runIngest({
    supabase,
    showId,
    season,
    page,
    mode,
    force: process.argv.includes("--force") || Boolean(fixture),
    html: fixture ? readFileSync(fixture, "utf8") : undefined,
  });

  console.log(`mode=${mode} season=${season} status=${summary.status} run=${summary.runId ?? "-"}`);
  console.log(`applied=${summary.applied} claims=${summary.claims} review=${summary.review} scores=${summary.scores}`);
  for (const it of summary.diff.apply) console.log(`  apply : ${it.celebrity} → ${it.status} wk${it.elimination_week ?? "-"} place ${it.placement ?? "-"} (chart ${it.chart_placement ?? "-"})`);
  for (const it of summary.diff.review) console.log(`  review: ${it.celebrity} → ${it.status} — ${it.reason}`);
  for (const n of summary.notes) console.log(`  note  : ${n}`);
  if (summary.status === "error") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

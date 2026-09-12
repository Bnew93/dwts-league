/**
 * One-time cast import (Phase 1). Parses the season page (live or a fixture)
 * and upserts couples for the league with status 'active'.
 *
 *   npx tsx scripts/import-cast.ts --sql [--fixture fixtures/s35-preseason.html]
 *   npm run import-cast            (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * Refuses to change status/placement of an existing couple — that is
 * ingestion's job (fn_apply_results). Only names/notability/cast_order upsert.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseSeasonPage } from "../lib/wiki/parse";

const SEASON = Number(process.env.SEASON ?? 35);
const PAGE = process.env.WIKI_SEASON_PAGE ?? "Dancing_with_the_Stars_(American_TV_series)_season_35";

async function loadHtml(): Promise<string> {
  const fi = process.argv.indexOf("--fixture");
  if (fi > 0) return readFileSync(process.argv[fi + 1], "utf8");
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE)}&prop=text&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": "dwts-league/0.1 (billnewhart19@gmail.com)" } });
  const json = (await res.json()) as { parse?: { text: string }; error?: unknown };
  if (!json.parse) throw new Error(`wiki error: ${JSON.stringify(json.error)}`);
  return json.parse.text;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const html = await loadHtml();
  const { couples, warnings } = parseSeasonPage(html);
  if (warnings.length) console.error("warnings:", warnings);
  if (couples.length < 8) throw new Error(`only ${couples.length} couples parsed; refusing`);
  const notActive = couples.filter((c) => c.status !== "active");
  if (notActive.length) console.error(`note: ${notActive.length} couples are not 'active' on the page; import still writes them as active`);

  if (process.argv.includes("--sql")) {
    const vals = couples
      .map(
        (c) =>
          `((select id from public.leagues where season = ${SEASON} limit 1), ${SEASON}, ${q(c.celebrity)}, ${q(c.celebrityKey)}, ${q(c.professional)}, ${q(c.notability)}, ${c.castOrder})`,
      )
      .join(",\n  ");
    console.log(`insert into public.couples (league_id, season, celebrity, celebrity_key, professional, notability, cast_order) values
  ${vals}
on conflict (league_id, celebrity_key) do update
  set celebrity = excluded.celebrity, professional = excluded.professional,
      notability = excluded.notability, cast_order = excluded.cast_order, updated_at = now();
select count(*) as couples from public.couples where season = ${SEASON};`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing (or use --sql)");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: league, error } = await sb.from("leagues").select("id").eq("season", SEASON).limit(1).single();
  if (error) throw error;
  const up = await sb.from("couples").upsert(
    couples.map((c) => ({
      league_id: league.id,
      season: SEASON,
      celebrity: c.celebrity,
      celebrity_key: c.celebrityKey,
      professional: c.professional,
      notability: c.notability,
      cast_order: c.castOrder,
    })),
    { onConflict: "league_id,celebrity_key" },
  );
  if (up.error) throw up.error;
  console.log(`Upserted ${couples.length} couples for season ${SEASON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

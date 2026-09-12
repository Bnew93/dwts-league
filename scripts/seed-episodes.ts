/**
 * Seeds Season 35 episodes: weeks 1–11, Tuesdays 8 PM ET starting Sept 15 2026.
 * Week 1 has two air dates (Tue Sept 15 + Wed Sept 16) and no elimination.
 * Idempotent: deletes and re-inserts the season's rows.
 *
 * Run: npm run seed:episodes   (needs SUPABASE_SERVICE_ROLE_KEY in .env.local)
 * The same rows can be produced as SQL with: npx tsx scripts/seed-episodes.ts --sql
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import { addWeeks, formatISO } from "date-fns";

const SEASON = 35;
const ET = "America/New_York";
const FIRST_TUESDAY = "2026-09-15";
const WEEKS = 11;

type Ep = { season: number; week: number; air_date: string; air_time: string; title: string; has_elimination: boolean };

export function buildEpisodes(): Ep[] {
  const rows: Ep[] = [];
  const base = new Date(`${FIRST_TUESDAY}T00:00:00`);
  for (let w = 1; w <= WEEKS; w++) {
    const tue = addWeeks(base, w - 1);
    const dates = w === 1 ? [tue, new Date(tue.getTime() + 86400000)] : [tue];
    for (const d of dates) {
      const day = formatISO(d, { representation: "date" });
      rows.push({
        season: SEASON,
        week: w,
        air_date: day,
        air_time: fromZonedTime(`${day}T20:00:00`, ET).toISOString(),
        title: w === 1 ? `Premiere Night ${dates.indexOf(d) + 1}` : w === WEEKS ? "Finale" : `Week ${w}`,
        has_elimination: w !== 1,
      });
    }
  }
  return rows;
}

function toSql(rows: Ep[]) {
  const vals = rows
    .map((r) => `(${r.season}, ${r.week}, '${r.air_date}', '${r.air_time}', '${r.title}', ${r.has_elimination})`)
    .join(",\n  ");
  return `delete from public.episodes where season = ${SEASON};\ninsert into public.episodes (season, week, air_date, air_time, title, has_elimination) values\n  ${vals};`;
}

async function main() {
  const rows = buildEpisodes();
  if (process.argv.includes("--sql")) {
    console.log(toSql(rows));
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing (or use --sql)");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const del = await sb.from("episodes").delete().eq("season", SEASON);
  if (del.error) throw del.error;
  const ins = await sb.from("episodes").insert(rows);
  if (ins.error) throw ins.error;
  console.log(`Seeded ${rows.length} episode rows for season ${SEASON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

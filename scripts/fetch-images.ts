/**
 * Prints SQL that stores the official couple photos on `couples.image_url`.
 * Source of truth: seed/couple-images.json (celebrity_key → URL), curated by hand
 * from the GMA Season 35 cast gallery. Edit the JSON, re-run, apply the SQL.
 *
 *   npx tsx scripts/fetch-images.ts > /tmp/images.sql
 */
import { readFileSync } from "node:fs";

const SEASON = Number(process.env.SEASON ?? 35);
const map = JSON.parse(readFileSync("seed/couple-images.json", "utf8")) as Record<string, string>;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = Object.entries(map)
  .filter(([k]) => !k.startsWith("_"))
  .map(([k, url]) => `  (${q(k)}, ${q(url)})`)
  .join(",\n");
console.log(`update public.couples c set image_url = v.url from (values\n${rows}\n) as v(key, url) where c.season = ${SEASON} and c.celebrity_key = v.key;`);

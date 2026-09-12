/**
 * Looks up Wikipedia page thumbnails for every couple (celebrity + pro) and prints
 * SQL that stores the URLs on `couples`. Run after import-cast.
 *
 *   npx tsx scripts/fetch-images.ts --fixture fixtures/s35-preseason.html > /tmp/images.sql
 *
 * Images are served from upload.wikimedia.org; a missing thumbnail leaves the column null
 * and the UI falls back to an initials avatar.
 */
import { readFileSync } from "node:fs";
import { parseSeasonPage } from "../lib/wiki/parse";

const UA = "dwts-league/0.1 (billnewhart19@gmail.com)";
const SEASON = Number(process.env.SEASON ?? 35);

async function thumbnails(titles: string[], size = 480): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pilicense=any&pithumbsize=${size}` +
      `&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(batch.join("|"))}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const json = (await res.json()) as {
      query?: { pages?: { title: string; thumbnail?: { source: string } }[]; redirects?: { from: string; to: string }[]; normalized?: { from: string; to: string }[] };
    };
    const back = new Map<string, string>(); // resolved title → requested title
    for (const n of json.query?.normalized ?? []) back.set(n.to, n.from);
    for (const r of json.query?.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from);
    for (const p of json.query?.pages ?? []) {
      if (!p.thumbnail) continue;
      out.set(back.get(p.title) ?? p.title, p.thumbnail.source);
    }
  }
  return out;
}

const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);

async function main() {
  const fi = process.argv.indexOf("--fixture");
  if (fi < 0) throw new Error("pass --fixture <html>");
  const { couples } = parseSeasonPage(readFileSync(process.argv[fi + 1], "utf8"));
  const titles = Array.from(new Set(couples.flatMap((c) => [c.celebrityWiki, c.professionalWiki]).filter(Boolean))) as string[];
  const thumbs = await thumbnails(titles);
  const rows = couples.map((c) => ({
    key: c.celebrityKey,
    celeb: c.celebrityWiki ? thumbs.get(c.celebrityWiki) ?? null : null,
    pro: c.professionalWiki ? thumbs.get(c.professionalWiki) ?? null : null,
  }));
  const missing = rows.filter((r) => !r.celeb || !r.pro);
  if (missing.length) console.error("missing:", missing.map((m) => `${m.key}${m.celeb ? "" : " (celeb)"}${m.pro ? "" : " (pro)"}`).join(", "));
  console.log(
    rows
      .map(
        (r) =>
          `update public.couples set celebrity_image_url = ${q(r.celeb)}, pro_image_url = ${q(r.pro)} where season = ${SEASON} and celebrity_key = ${q(r.key)};`,
      )
      .join("\n"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

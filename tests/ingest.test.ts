import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSeasonPage, parseChartPlacements, parseOrdinal } from "../lib/wiki/parse";
import { buildDiff, applyInMemory, acceptablePlacements, MAX_AUTO_CHANGES, type DbCouple, type EpisodeLite } from "../lib/ingest/core";

const load = (f: string) => readFileSync(`fixtures/${f}.html`, "utf8");
const pre = parseSeasonPage(load("s34-preseason"));
const wk4 = parseSeasonPage(load("s34-week4"));
const wk6 = parseSeasonPage(load("s34-week6"));
const fin = parseSeasonPage(load("s34-final"));

/** Season 34: Tuesdays from Sept 16 2025, weeks 1–11 (finale Nov 25). */
const S34: EpisodeLite[] = Array.from({ length: 11 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 8, 16 + 7 * i));
  return { week: i + 1, air_date: d.toISOString().slice(0, 10) };
});

/** Database rows as the cast import would create them: everyone active. */
function seed(): DbCouple[] {
  return pre.couples.map((c, i) => ({
    id: `id-${i + 1}`,
    celebrity: c.celebrity,
    celebrity_key: c.celebrityKey,
    status: "active",
    elimination_week: null,
    elimination_date: null,
    placement: null,
  }));
}

test("chart placements parse: blank pre-season, filled once out, ordinal helper", () => {
  assert.equal(parseOrdinal("13th"), 13);
  assert.equal(parseOrdinal("1st"), 1);
  assert.equal(parseOrdinal(""), null);
  assert.ok(pre.placements.length === 14 && pre.placements.every((p) => p.placement === null));
  const w = [] as string[];
  const p4 = parseChartPlacements(load("s34-week4"), w);
  assert.equal(p4.find((p) => p.label === "Hilaria & Gleb")?.placement, 11);
  assert.equal(p4.find((p) => p.label === "Baron & Britt")?.placement, 14); // editor wrote 14th for the tie
  assert.equal(fin.placements.find((p) => p.label === "Robert & Witney")?.placement, 1);
  assert.deepEqual(w, []);
});

test("acceptablePlacements tolerates tie conventions", () => {
  const baron = wk4.couples.find((c) => c.celebrity === "Baron Davis")!;
  assert.deepEqual(acceptablePlacements(baron, 14), [13, 14]);
  const lauren = wk4.couples.find((c) => c.celebrity === "Lauren Jauregui")!;
  assert.deepEqual(acceptablePlacements(lauren, 14), [12]);
  const robert = fin.couples.find((c) => c.celebrity === "Robert Irwin")!;
  assert.deepEqual(acceptablePlacements(robert, 14), [1]);
});

test("replay S34: pre-season → week 4 → week 6 → finale, no manual steps", () => {
  let db = seed();

  // pre-season page against a fresh import: nothing to do
  const d0 = buildDiff(pre, db, S34);
  assert.deepEqual(d0.apply, []);
  assert.deepEqual(d0.review, []);

  // after week 4: double elimination in week 2, then one each in weeks 3 and 4, in that order
  const d1 = buildDiff(wk4, db, S34);
  assert.deepEqual(d1.review, []);
  assert.deepEqual(
    d1.apply.map((i) => [i.celebrity, i.status, i.elimination_week, i.placement]),
    [
      ["Baron Davis", "eliminated", 2, 13],
      ["Corey Feldman", "eliminated", 2, 13],
      ["Lauren Jauregui", "eliminated", 3, 12],
      ["Hilaria Baldwin", "eliminated", 4, 11],
    ],
  );
  assert.ok(d1.apply.length <= MAX_AUTO_CHANGES);
  db = applyInMemory(db, d1.apply);

  // same page again: idempotent
  const d1b = buildDiff(wk4, db, S34);
  assert.deepEqual(d1b.apply, []);
  assert.deepEqual(d1b.review, []);

  // after week 6: week 5 had no elimination; Scott went in week 6
  const d2 = buildDiff(wk6, db, S34);
  assert.deepEqual(d2.review, []);
  assert.deepEqual(d2.apply.map((i) => [i.celebrity, i.elimination_week, i.placement]), [["Scott Hoying", 6, 10]]);
  db = applyInMemory(db, d2.apply);

  // finale: four more eliminations plus five placements — the finale exemption lets it through
  const d3 = buildDiff(fin, db, S34);
  assert.deepEqual(d3.review, []);
  assert.equal(d3.apply.length, 9);
  const by = (n: string) => d3.apply.find((i) => i.celebrity === n)!;
  assert.deepEqual([by("Jen Affleck").elimination_week, by("Jen Affleck").placement], [7, 9]);
  assert.deepEqual([by("Whitney Leavitt").elimination_week, by("Whitney Leavitt").placement], [10, 6]);
  assert.deepEqual([by("Robert Irwin").status, by("Robert Irwin").placement, by("Robert Irwin").elimination_week], ["finalist", 1, 11]);
  assert.equal(by("Alix Earle").placement, 2);
  assert.equal(by("Elaine Hendrix").placement, 5);
  db = applyInMemory(db, d3.apply);
  assert.ok(db.every((c) => c.placement != null), "every couple placed after the finale");
  assert.equal(db.filter((c) => c.placement === 1).length, 1);

  // and once more: nothing left to do
  const d4 = buildDiff(fin, db, S34);
  assert.deepEqual(d4.apply, []);
  assert.deepEqual(d4.review, []);
});

test("un-eliminating a couple is parked, never applied", () => {
  let db = seed();
  db = applyInMemory(db, buildDiff(wk4, db, S34).apply);
  db = applyInMemory(db, buildDiff(wk6, db, S34).apply);
  assert.equal(db.filter((c) => c.status === "eliminated").length, 5);
  // the page regresses to the pre-season version (vandalism / revert)
  const d = buildDiff(pre, db, S34);
  assert.deepEqual(d.apply, []);
  assert.equal(d.review.length, 5);
  assert.ok(d.review.every((i) => /un-eliminate/.test(i.reason ?? "")));
});

test("cast table and chart must agree", () => {
  const db = seed();
  const tampered = { ...wk4, placements: wk4.placements.map((p) => (p.label === "Hilaria & Gleb" ? { ...p, placement: 9 } : p)) };
  const d = buildDiff(tampered, db, S34);
  assert.equal(d.apply.length, 3);
  assert.equal(d.review.length, 1);
  assert.match(d.review[0].reason ?? "", /chart says 9/);
  // chart row missing entirely
  const missing = { ...wk4, placements: wk4.placements.filter((p) => p.label !== "Hilaria & Gleb") };
  assert.match(buildDiff(missing, db, S34).review[0].reason ?? "", /no scoring-chart row/);
});

test("an elimination date with no episode is parked", () => {
  const db = seed();
  const noWeek3 = S34.filter((e) => e.week !== 3);
  const d = buildDiff(wk4, db, noWeek3);
  assert.equal(d.apply.length, 3);
  assert.equal(d.review.length, 1);
  assert.equal(d.review[0].celebrity, "Lauren Jauregui");
  assert.match(d.review[0].reason ?? "", /no episode on 2025-09-30/);
});

test("too many changes at once are parked unless it is the finale", () => {
  const db = seed();
  const d = buildDiff(wk6, db, S34); // 5 eliminations from a clean slate
  assert.equal(d.apply.length, 0);
  assert.equal(d.review.length, 5);
  assert.match(d.review[0].reason ?? "", /5 changes/);
});

test("S35 pre-season page against the current cast: empty diff", () => {
  const s35 = parseSeasonPage(load("s35-preseason"));
  const db: DbCouple[] = s35.couples.map((c, i) => ({
    id: `s35-${i}`,
    celebrity: c.celebrity,
    celebrity_key: c.celebrityKey,
    status: "active",
    elimination_week: null,
    elimination_date: null,
    placement: null,
  }));
  const d = buildDiff(s35, db, []);
  assert.deepEqual(d.apply, []);
  assert.deepEqual(d.review, []);
  assert.deepEqual(d.notes, []);
});

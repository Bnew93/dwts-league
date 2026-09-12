import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSeasonPage,
  parseStatus,
  parseScoreCell,
  matchScoreToCouple,
  tableToGrid,
} from "../lib/wiki/parse";

const s35 = readFileSync("fixtures/s35-preseason.html", "utf8");
const s34 = readFileSync("fixtures/s34-final.html", "utf8");

test("S35 pre-season: 16 couples, all active, in reveal order", () => {
  const { couples, warnings } = parseSeasonPage(s35);
  assert.equal(couples.length, 16);
  assert.ok(couples.every((c) => c.status === "active"), "all active");
  assert.ok(couples.every((c) => c.placement === null));
  assert.equal(couples[0].celebrity, "Tatyana Ali");
  assert.equal(couples[0].professional, "Jan Ravnik");
  assert.equal(couples[0].castOrder, 1);
  assert.equal(couples[15].celebrity, "Connor Wood");
  assert.equal(couples[15].professional, "Rylee Arnold");
  assert.equal(couples[15].castOrder, 16);
  // rowspan "Participating" carried down to every row
  assert.ok(couples.every((c) => c.statusText === "Participating"), "status carried by rowspan");
  assert.equal(couples.find((c) => c.celebrity === "Harry Shum Jr.")?.celebrityKey, "harry-shum-jr");
  assert.ok(!warnings.includes("cast table not found"));
});

test("S35 pre-season: notability text keeps italics content and ampersands", () => {
  const { couples } = parseSeasonPage(s35);
  assert.equal(couples[1].notability, "The Bachelorette runner-up");
  assert.equal(couples[0].notability, "Television actress & singer");
});

test("S34 final: statuses, dates, placements", () => {
  const { couples } = parseSeasonPage(s34);
  assert.equal(couples.length, 14);
  const by = (n: string) => couples.find((c) => c.celebrity === n)!;

  // shared rowspan cell: double elimination night
  const baron = by("Baron Davis");
  const corey = by("Corey Feldman");
  assert.equal(baron.status, "eliminated");
  assert.deepEqual(baron.eliminationOrdinals, [1, 2]);
  assert.equal(baron.eliminationDate, "2025-09-23");
  assert.equal(corey.status, "eliminated");
  assert.equal(corey.eliminationDate, "2025-09-23");
  assert.equal(baron.placement, 13); // 14 − 2 + 1, tie
  assert.equal(corey.placement, 13);

  const lauren = by("Lauren Jauregui");
  assert.deepEqual(lauren.eliminationOrdinals, [3]);
  assert.equal(lauren.eliminationDate, "2025-09-30");
  assert.equal(lauren.placement, 12);

  // replacement pro in week 9 — keep the original pro
  assert.equal(by("Andy Richter").professional, "Emma Slater");

  assert.equal(by("Robert Irwin").status, "finalist");
  assert.equal(by("Robert Irwin").placement, 1);
  assert.equal(by("Alix Earle").placement, 2);
  assert.equal(by("Jordan Chiles").placement, 3);
  assert.equal(by("Dylan Efron").placement, 4);
  assert.equal(by("Elaine Hendrix").placement, 5);
  assert.equal(by("Elaine Hendrix").eliminationDate, "2025-11-25");
});

test("parseStatus handles the known label shapes", () => {
  assert.equal(parseStatus("Participating").status, "active");
  assert.equal(parseStatus("").status, "active");
  assert.equal(parseStatus("Withdrew on October 1, 2026").status, "withdrew");
  assert.equal(parseStatus("Withdrew on October 1, 2026").eliminationDate, "2026-10-01");
  assert.deepEqual(parseStatus("Eliminated 1st & 2nd on September 23, 2025").eliminationOrdinals, [1, 2]);
  assert.equal(parseStatus("Winners on November 25, 2025").labelPlacement, 1);
  assert.equal(parseStatus("Runners-up on November 25, 2025").labelPlacement, 2);
  assert.equal(parseStatus("Runner-up on November 25, 2025").labelPlacement, 2);
  assert.equal(parseStatus("Third place on November 25, 2025").labelPlacement, 3);
  assert.equal(parseStatus("Fifth place on November 25, 2025").labelPlacement, 5);
});

test("parseScoreCell", () => {
  assert.equal(parseScoreCell("15"), 15);
  assert.equal(parseScoreCell("15†"), 15);
  assert.equal(parseScoreCell("38+3=41"), 41);
  assert.equal(parseScoreCell("40+2=42†"), 42);
  assert.equal(parseScoreCell("29+30+30=89"), 89);
  assert.equal(parseScoreCell(""), null);
  assert.equal(parseScoreCell("—"), null);
});

test("S34 final: weekly scores parse and match couples", () => {
  const { couples, scores } = parseSeasonPage(s34);
  const robert = scores.filter((s) => s.label === "Robert & Witney");
  assert.ok(robert.length >= 10, `got ${robert.length}`);
  assert.equal(robert.find((s) => s.week === 1)?.total, 15);
  assert.equal(robert.find((s) => s.week === 11)?.total, 89);
  // combined columns like "1+2" are ignored
  assert.ok(scores.every((s) => Number.isInteger(s.week)));
  const matched = scores.map((s) => matchScoreToCouple(s, couples));
  assert.ok(matched.every(Boolean), "every score row matches a couple");
  assert.equal(matchScoreToCouple(robert[0], couples)?.celebrity, "Robert Irwin");
});

test("S35 pre-season: scoring chart exists but has no numbers yet", () => {
  const { scores, warnings } = parseSeasonPage(s35);
  assert.equal(scores.length, 0);
  assert.ok(!warnings.includes("scoring chart not found"));
});

test("S35: score labels with initials still match (Conner L. / Connor W.)", () => {
  const { couples } = parseSeasonPage(s35);
  const a = matchScoreToCouple({ label: "Conner L. & Adele", celebrityFirst: "Conner", proFirst: "Adele", week: 1, total: 1, raw: "1" }, couples);
  const b = matchScoreToCouple({ label: "Connor W. & Rylee", celebrityFirst: "Connor", proFirst: "Rylee", week: 1, total: 1, raw: "1" }, couples);
  assert.equal(a?.celebrity, "Conner Leavitt");
  assert.equal(b?.celebrity, "Connor Wood");
  // two Ezras and two Jennas resolve by the pair
  const c = matchScoreToCouple({ label: "Julia & Ezra", celebrityFirst: "Julia", proFirst: "Ezra", week: 1, total: 1, raw: "1" }, couples);
  const d = matchScoreToCouple({ label: "Jenna & Val", celebrityFirst: "Jenna", proFirst: "Val", week: 1, total: 1, raw: "1" }, couples);
  assert.equal(c?.celebrity, "Julia Stiles");
  assert.equal(d?.celebrity, "Jenna Dewan");
});

test("tableToGrid carries rowspan and colspan", () => {
  const grid = tableToGrid(
    `<table><tr><th rowspan="2">A</th><th colspan="2">B</th></tr><tr><td>c</td><td>d</td></tr></table>`,
  );
  assert.deepEqual(grid.map((r) => r.map((c) => c.text)), [["A", "B", "B"], ["A", "c", "d"]]);
});

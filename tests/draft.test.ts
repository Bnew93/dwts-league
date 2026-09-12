import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOwner, buildBoard, roundOf, secondsLeft, leftoverCount } from "../lib/draft";

const order = ["A", "B", "C", "D"];

test("snake order: 4 users, 4 rounds", () => {
  const seq = Array.from({ length: 16 }, (_, i) => pickOwner(order, i + 1)).join("");
  assert.equal(seq, "ABCD" + "DCBA" + "ABCD" + "DCBA");
});

test("roundOf", () => {
  assert.equal(roundOf(1, 4), 1);
  assert.equal(roundOf(4, 4), 1);
  assert.equal(roundOf(5, 4), 2);
  assert.equal(roundOf(16, 4), 4);
});

test("buildBoard", () => {
  const board = buildBoard(order, 2);
  assert.equal(board.length, 2);
  assert.deepEqual(board[0].map((c) => c.userId), ["A", "B", "C", "D"]);
  assert.deepEqual(board[1].map((c) => c.userId), ["D", "C", "B", "A"]);
  assert.deepEqual(board[1].map((c) => c.pickNo), [5, 6, 7, 8]);
});

test("secondsLeft", () => {
  const start = new Date("2026-09-13T00:00:00Z").toISOString();
  const t0 = new Date("2026-09-13T00:00:00Z").getTime();
  assert.equal(secondsLeft(start, 60, t0), 60);
  assert.equal(secondsLeft(start, 60, t0 + 59_500), 1);
  assert.equal(secondsLeft(start, 60, t0 + 61_000), 0);
  assert.equal(secondsLeft(null, 60, t0), 0);
});

test("leftoverCount", () => {
  assert.equal(leftoverCount(16, 4, 4), 0);
  assert.equal(leftoverCount(16, 4, 3), 4);
  assert.equal(leftoverCount(14, 4, 3), 2);
});

import assert from "node:assert/strict";
import test from "node:test";

import { scoreChunks } from "../src/scorer.js";

test("relevant chunk scores higher than irrelevant for the same query", () => {
  const chunks = [
    { id: "a", text: "Refunds are available within 30 days. After 45 days contact support.", source: "policy" },
    { id: "b", text: "Packages ship in three business days via standard carrier.", source: "shipping" },
    { id: "c", text: "Our cafeteria menu changes weekly with new salads.", source: "menu" },
  ];
  const ranked = scoreChunks("refund after 45 days", chunks);
  assert.equal(ranked[0].id, "a");
  assert.ok(ranked[0].score > 0);
  // Irrelevant chunks score 0 (no query terms).
  const last = ranked[ranked.length - 1];
  assert.ok(last.score <= ranked[0].score);
});

test("empty input returns empty array", () => {
  assert.deepEqual(scoreChunks("anything", []), []);
});

test("empty query yields zero scores", () => {
  const chunks = [{ id: "a", text: "hello world" }];
  const ranked = scoreChunks("", chunks);
  assert.equal(ranked[0].score, 0);
});

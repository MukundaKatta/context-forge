import assert from "node:assert/strict";
import test from "node:test";

import { packToBudget } from "../src/packer.js";

test("packing respects budget", () => {
  const chunks = [
    { id: "a", text: "x".repeat(400), tokens: 100, score: 0.9 },
    { id: "b", text: "y".repeat(400), tokens: 100, score: 0.8 },
    { id: "c", text: "z".repeat(400), tokens: 100, score: 0.7 },
    { id: "d", text: "w".repeat(400), tokens: 100, score: 0.6 },
  ];
  const result = packToBudget(chunks, { budgetTokens: 250 });
  assert.ok(result.used_tokens <= 250);
  assert.equal(result.kept.length, 2);
  assert.equal(result.kept[0].id, "a");
  assert.equal(result.kept[1].id, "b");
});

test("first dropped chunk recorded with reason", () => {
  const chunks = [
    { id: "a", text: "x".repeat(400), tokens: 200 },
    { id: "b", text: "y".repeat(400), tokens: 200 },
    { id: "c", text: "z".repeat(400), tokens: 200 },
  ];
  const result = packToBudget(chunks, { budgetTokens: 250 });
  assert.equal(result.kept.length, 1);
  assert.equal(result.dropped.length, 2);
  assert.equal(result.dropped[0].id, "b");
  assert.equal(result.dropped[0].reason, "budget_exceeded");
});

test("perChunkMin filters tiny chunks", () => {
  const chunks = [
    { id: "tiny", text: "ok", tokens: 5 },
    { id: "good", text: "x".repeat(200), tokens: 50 },
  ];
  const result = packToBudget(chunks, { budgetTokens: 200, perChunkMin: 20 });
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].id, "good");
  assert.equal(result.dropped[0].id, "tiny");
  assert.equal(result.dropped[0].reason, "below_min_tokens");
});

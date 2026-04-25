import assert from "node:assert/strict";
import test from "node:test";

import { diversify } from "../src/diversity.js";

test("MMR drops near-duplicates: distinct chunk picked before duplicate", () => {
  const chunks = [
    { id: "dup1", text: "refund policy thirty days return window money back guarantee", score: 0.9 },
    { id: "dup2", text: "refund policy thirty days return window money back guarantee", score: 0.85 },
    { id: "diff", text: "shipping carrier handling tracking package transit time", score: 0.6 },
  ];
  const ordered = diversify(chunks, { lambda: 0.5 });
  // First pick is the highest relevance.
  assert.equal(ordered[0].id, "dup1");
  // Second pick should be the diverse one, not the near-duplicate.
  assert.equal(ordered[1].id, "diff");
  assert.equal(ordered[2].id, "dup2");
});

test("empty input returns []", () => {
  assert.deepEqual(diversify([]), []);
});

test("lambda=1.0 reduces to pure relevance ordering", () => {
  const chunks = [
    { id: "a", text: "alpha beta gamma", score: 0.5 },
    { id: "b", text: "alpha beta gamma delta", score: 0.9 },
    { id: "c", text: "kappa lambda mu", score: 0.7 },
  ];
  const ordered = diversify(chunks, { lambda: 1.0 });
  assert.deepEqual(ordered.map((c) => c.id), ["b", "c", "a"]);
});

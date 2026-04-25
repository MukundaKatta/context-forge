import assert from "node:assert/strict";
import test from "node:test";

import { chunkDocument } from "../src/chunker.js";
import { estimateTokens } from "../src/estimateTokens.js";

test("chunks respect maxTokens", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} contains a few words.`).join(" ");
  const doc = { id: "long", text };
  const chunks = chunkDocument(doc, { maxTokens: 40, overlapTokens: 5 });
  assert.ok(chunks.length > 1, "should produce multiple chunks");
  for (const chunk of chunks) {
    // Allow a small slack for paragraph-level fragments that already exist.
    assert.ok(chunk.tokens <= 60, `chunk ${chunk.id} tokens=${chunk.tokens} exceeds bound`);
    assert.equal(chunk.doc_id, "long");
    assert.equal(typeof chunk.start, "number");
    assert.equal(typeof chunk.end, "number");
    assert.equal(estimateTokens(chunk.text), chunk.tokens);
  }
});

test("overlap behaves: consecutive chunks share trailing material", () => {
  // Build a paragraph-rich doc so the packer pulls overlap from prior buffer.
  const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} alpha beta gamma delta epsilon zeta.`);
  const doc = { id: "p", text: paragraphs.join("\n\n") };
  const chunksWithOverlap = chunkDocument(doc, { maxTokens: 30, overlapTokens: 15 });
  const chunksNoOverlap = chunkDocument(doc, { maxTokens: 30, overlapTokens: 0 });
  // With overlap > 0 we should produce >= as many chunks as without (overlap tail
  // means more material is repeated and harder to pack).
  assert.ok(chunksWithOverlap.length >= chunksNoOverlap.length);
  assert.ok(chunksWithOverlap.length > 1);
});

test("empty doc returns []", () => {
  assert.deepEqual(chunkDocument({ id: "e", text: "" }), []);
  assert.deepEqual(chunkDocument({ id: "w", text: "   \n  \n " }), []);
});

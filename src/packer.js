import { estimateTokens } from "./estimateTokens.js";

// Greedy budget packer. Walk chunks in the order provided (already sorted by
// the caller — typically by relevance or MMR), accept each one if it fits, and
// record dropped chunks with a reason so the caller can show what was cut.
export function packToBudget(chunks, options = {}) {
  const budgetTokens = options.budgetTokens ?? 1200;
  const perChunkMin = options.perChunkMin ?? 20;
  const kept = [];
  const dropped = [];
  let used = 0;

  for (const chunk of chunks) {
    const tokens = chunk.tokens ?? estimateTokens(chunk.text);
    if (tokens < perChunkMin) {
      dropped.push({ id: chunk.id, reason: "below_min_tokens" });
      continue;
    }
    if (used + tokens > budgetTokens) {
      dropped.push({ id: chunk.id, reason: "budget_exceeded" });
      continue;
    }
    kept.push({ ...chunk, tokens });
    used += tokens;
  }

  return { kept, dropped, used_tokens: used };
}

export default packToBudget;

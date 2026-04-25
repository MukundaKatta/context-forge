import { tokenize } from "./scorer.js";

// Maximal Marginal Relevance: pick the chunk that maximizes
//   lambda * relevance - (1 - lambda) * max_jaccard_to_already_picked.
// lambda close to 1 favors pure relevance; closer to 0 favors diversity.

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

export function diversify(scoredChunks, options = {}) {
  const lambda = options.lambda ?? 0.7;
  if (!scoredChunks.length) return [];

  const tokenSets = scoredChunks.map((chunk) => new Set(tokenize(chunk.text)));
  const remaining = scoredChunks.map((chunk, index) => ({ chunk, index }));
  const selected = [];

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.chunk.score ?? 0;
      let maxSim = 0;
      for (const picked of selected) {
        const sim = jaccard(tokenSets[candidate.index], tokenSets[picked.index]);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * relevance - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIndex = i;
      }
    }
    const chosen = remaining.splice(bestIndex, 1)[0];
    selected.push(chosen);
  }

  return selected.map((entry) => entry.chunk);
}

export default diversify;

// Pure-JS BM25. k1=1.5, b=0.75 are the canonical Robertson/Sparck-Jones defaults.
// Tokenization: lowercase, /\w+/g (matches word characters) — keeps it dependency-free
// and consistent with the diversity module so similarity and relevance share a vocabulary.

const K1 = 1.5;
const B = 0.75;

export function tokenize(text) {
  const matches = String(text ?? "").toLowerCase().match(/\w+/g);
  return matches ?? [];
}

function termFrequencies(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1);
  return map;
}

export function scoreChunks(query, chunks) {
  const queryTokens = Array.from(new Set(tokenize(query)));
  const docs = chunks.map((chunk) => ({
    chunk,
    tokens: tokenize(chunk.text),
  }));
  if (!docs.length) return [];

  const docLengths = docs.map((d) => d.tokens.length);
  const avgDocLength = docLengths.reduce((sum, len) => sum + len, 0) / docs.length || 1;

  // Document frequency per query term.
  const df = new Map();
  for (const term of queryTokens) {
    let count = 0;
    for (const doc of docs) {
      if (doc.tokens.includes(term)) count++;
    }
    df.set(term, count);
  }

  const N = docs.length;
  const idf = new Map();
  for (const term of queryTokens) {
    const n = df.get(term) ?? 0;
    // Robertson IDF with +1 smoothing to avoid negative IDF for very common terms.
    const value = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    idf.set(term, value);
  }

  const scored = docs.map(({ chunk, tokens }, index) => {
    const tf = termFrequencies(tokens);
    const docLen = docLengths[index];
    let score = 0;
    for (const term of queryTokens) {
      const termFreq = tf.get(term) ?? 0;
      if (!termFreq) continue;
      const numerator = termFreq * (K1 + 1);
      const denominator = termFreq + K1 * (1 - B + B * (docLen / avgDocLength));
      score += (idf.get(term) ?? 0) * (numerator / denominator);
    }
    return { ...chunk, score };
  });

  // Stable sort by score desc — preserve insertion order for ties.
  return scored
    .map((chunk, index) => ({ chunk, index }))
    .sort((a, b) => b.chunk.score - a.chunk.score || a.index - b.index)
    .map((entry) => entry.chunk);
}

export default scoreChunks;

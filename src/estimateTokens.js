// Heuristic token estimator: ceil(chars / 4).
// Picked the chars/4 heuristic because it matches OpenAI's rough tokenizer guidance
// for English text and produces stable estimates across markdown, code, and prose
// without a runtime dependency. The whitespace-aware variant (words * 1.3) tends to
// underestimate code and dense punctuation, so we stick with chars/4 throughout.
export function estimateTokens(text) {
  const string = String(text ?? "");
  if (!string.length) return 0;
  return Math.ceil(string.length / 4);
}

export default estimateTokens;

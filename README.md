# @mukundakatta/context-forge

`context-forge` is a zero-dependency context engineering toolkit for RAG and agent prompts.

It chunks documents, scores relevance, applies diversity-aware packing, flags prompt-injection risk, and emits citation-ready context blocks that fit a budget.

## Install

```bash
npm install -g @mukundakatta/context-forge
```

## CLI

```bash
ctxforge pack --query "refund after 45 days" --budget 1200 docs/policy.md docs/faq.md
```

## Library

```js
import { packContext } from "@mukundakatta/context-forge";

const packed = packContext({
  query: "refund after 45 days",
  documents: [{ id: "policy", text: "Refunds are available within 30 days." }],
  budgetTokens: 800
});
```

## Pipeline

```
documents
   |
   v
chunkDocument  ->  paragraph/sentence-aware splits with token overlap
   |
   v
scoreChunks    ->  BM25 (k1=1.5, b=0.75) over /\w+/g tokens
   |
   v
diversify      ->  MMR with Jaccard similarity (lambda default 0.7)
   |
   v
scanInjection  ->  prompt-injection + exfiltration risk findings
   |
   v
packToBudget   ->  greedy pack under budgetTokens, drops tracked
   |
   v
{ blocks, used_tokens, dropped, risks, citations }
```

## Programmatic API

All exports come from `@mukundakatta/context-forge`:

- `packContext({ query, documents, budgetTokens, options })` - run the full pipeline and return packed blocks, token usage, dropped chunks, risk findings, and citations.
- `chunkDocument(doc, { maxTokens, overlapTokens })` - paragraph/sentence-aware splitter that emits `{ id, doc_id, source, text, start, end, tokens }` chunks.
- `scoreChunks(query, chunks)` - BM25 ranker; returns chunks with a `score` field, stable-sorted descending.
- `diversify(scoredChunks, { lambda })` - MMR re-ranker that balances relevance and diversity via Jaccard similarity.
- `scanInjection(text)` - returns `{ kind, severity, snippet, index }` findings for prompt-injection and exfiltration patterns.
- `packToBudget(chunks, { budgetTokens, perChunkMin })` - greedy budget packer; returns `{ kept, dropped, used_tokens }`.
- `estimateTokens(text)` - heuristic token estimator (`ceil(chars / 4)`).

The result of `packContext` has shape:

```js
{
  blocks: [{ id, text, source, score, tokens }],
  used_tokens: 0,
  dropped: [{ id, reason }],
  risks: [{ id, kind, severity, snippet, index }],
  citations: { [block_id]: { source, span: [start, end] } }
}
```


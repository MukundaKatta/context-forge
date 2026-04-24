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


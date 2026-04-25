import { estimateTokens } from "./estimateTokens.js";
import { chunkDocument } from "./chunker.js";
import { scoreChunks } from "./scorer.js";
import { diversify } from "./diversity.js";
import { scanInjection } from "./inject.js";
import { packToBudget } from "./packer.js";

// packContext: chunk -> score -> diversify -> risk-scan -> pack to budget.
// Returns blocks ready for prompting plus structured citations and risks for
// downstream UI/audit.
export function packContext(opts = {}) {
  const {
    query = "",
    documents = [],
    budgetTokens = 1200,
    options = {},
  } = opts;

  const chunkOptions = {
    maxTokens: options.maxTokens ?? 200,
    overlapTokens: options.overlapTokens ?? 20,
  };
  const lambda = options.lambda ?? 0.7;
  const perChunkMin = options.perChunkMin ?? 20;

  // 1. Chunk every document.
  const chunks = documents.flatMap((doc) => chunkDocument(doc, chunkOptions));

  // 2. Score against the query (BM25). Stable sort by score desc.
  const scored = scoreChunks(query, chunks);

  // 3. Diversify with MMR.
  const diversified = diversify(scored, { lambda });

  // 4. Pack greedily to the token budget.
  const { kept, dropped, used_tokens } = packToBudget(diversified, {
    budgetTokens,
    perChunkMin,
  });

  // 5. Risk scan kept blocks (and surface findings on dropped-but-flagged input
  //    only via the kept output to keep the contract focused).
  const risks = [];
  const blocks = kept.map((chunk) => {
    const findings = scanInjection(chunk.text);
    for (const finding of findings) {
      risks.push({ id: chunk.id, ...finding });
    }
    return {
      id: chunk.id,
      text: chunk.text,
      source: chunk.source,
      score: chunk.score ?? 0,
      tokens: chunk.tokens,
    };
  });

  // 6. Citations keyed by block id with span pointing back to source offsets.
  const citations = {};
  for (const chunk of kept) {
    citations[chunk.id] = {
      source: chunk.source,
      span: [chunk.start ?? 0, chunk.end ?? (chunk.start ?? 0) + (chunk.text?.length ?? 0)],
    };
  }

  return {
    blocks,
    used_tokens,
    dropped,
    risks,
    citations,
  };
}

// Legacy aliases — keep older callers/tests working without re-exporting the
// long-deprecated implementation.
export const riskScan = scanInjection;
export function rankChunks({ query, chunks }) {
  return scoreChunks(query, chunks);
}
export function renderContextBlock(blocks) {
  return blocks
    .map((block, index) => {
      const id = block.id ?? `block-${index}`;
      const source = block.source ?? block.sourceId ?? "unknown";
      return `<context index="${index + 1}" id="${id}" source="${source}">\n${block.text}\n</context>`;
    })
    .join("\n\n");
}

export {
  chunkDocument,
  scoreChunks,
  diversify,
  scanInjection,
  packToBudget,
  estimateTokens,
};

export default packContext;

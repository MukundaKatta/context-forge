const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /system prompt/i,
  /developer message/i,
  /reveal.*(secret|token|key|password)/i,
  /exfiltrate|send.*credentials|copy.*api key/i,
  /you are now|act as|new instructions/i,
  /do not tell the user/i,
];

function packContext({ query, documents, budgetTokens = 2000, maxChunks = 12, diversity = 0.35 }) {
  const chunks = documents.flatMap((document) => chunkDocument(document));
  const ranked = rankChunks({ query, chunks, diversity });
  const selected = [];
  let usedTokens = 0;

  for (const chunk of ranked) {
    if (selected.length >= maxChunks) break;
    if (usedTokens + chunk.tokens > budgetTokens) continue;
    selected.push(chunk);
    usedTokens += chunk.tokens;
  }

  const ordered = edgePin(selected);
  return {
    query,
    budgetTokens,
    usedTokens,
    chunks: ordered,
    warnings: ordered.flatMap((chunk) => chunk.risks.map((risk) => ({ sourceId: chunk.sourceId, chunkId: chunk.id, ...risk }))),
    prompt: renderContextBlock(ordered),
  };
}

function chunkDocument(document, options = {}) {
  const maxTokens = options.maxTokens ?? 220;
  const overlap = options.overlap ?? 40;
  const sections = splitSections(document.text ?? "");
  const chunks = [];
  let counter = 0;

  for (const section of sections) {
    const words = section.text.match(/\S+/g) ?? [];
    const step = Math.max(1, maxTokens - overlap);
    for (let start = 0; start < words.length || (words.length === 0 && start === 0); start += step) {
      const slice = words.slice(start, start + maxTokens);
      if (!slice.length) break;
      const text = slice.join(" ");
      chunks.push(makeChunk({ document, section, text, counter: counter++ }));
      if (start + maxTokens >= words.length) break;
    }
  }

  return chunks;
}

function rankChunks({ query, chunks, diversity = 0.35 }) {
  const queryTokens = tokenize(query);
  const scored = chunks.map((chunk) => ({
    ...chunk,
    relevance: relevanceScore(queryTokens, chunk),
  }));

  const selected = [];
  const remaining = [...scored];
  while (remaining.length) {
    remaining.sort((left, right) => mmrScore(right, selected, diversity) - mmrScore(left, selected, diversity));
    selected.push(remaining.shift());
  }
  return selected;
}

function riskScan(text) {
  const risks = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      risks.push({ type: "prompt_injection", severity: "high", pattern: pattern.source });
    }
  }
  const secretHits = text.match(/\b(?:sk-[a-zA-Z0-9_-]{12,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,})\b/g) ?? [];
  for (const secret of secretHits) {
    risks.push({ type: "secret_like_value", severity: "critical", sample: `${secret.slice(0, 6)}...` });
  }
  return risks;
}

function renderContextBlock(chunks) {
  return chunks
    .map((chunk, index) => {
      const risk = chunk.risks.length ? `\nRisk: ${chunk.risks.map((item) => `${item.severity}:${item.type}`).join(", ")}` : "";
      return `<context index="${index + 1}" source_id="${escapeAttr(chunk.sourceId)}" chunk_id="${escapeAttr(chunk.id)}">\n${chunk.text}${risk}\n</context>`;
    })
    .join("\n\n");
}

function splitSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let heading = "Untitled";
  let buffer = [];

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) && buffer.length) {
      sections.push({ heading, text: buffer.join("\n").trim() });
      heading = line.replace(/^#{1,6}\s+/, "").trim();
      buffer = [];
    } else if (/^#{1,6}\s+/.test(line)) {
      heading = line.replace(/^#{1,6}\s+/, "").trim();
    } else {
      buffer.push(line);
    }
  }
  if (buffer.join("").trim()) sections.push({ heading, text: buffer.join("\n").trim() });
  return sections.length ? sections : [{ heading, text }];
}

function makeChunk({ document, section, text, counter }) {
  const sourceId = String(document.id ?? document.path ?? "document");
  return {
    id: `${sourceId}#${counter}`,
    sourceId,
    title: document.title ?? section.heading,
    heading: section.heading,
    text,
    tokens: estimateTokens(text),
    terms: tokenize(`${section.heading} ${text}`),
    risks: riskScan(text),
  };
}

function relevanceScore(queryTokens, chunk) {
  if (!queryTokens.length) return 0;
  const chunkCounts = countTerms(chunk.terms);
  let score = 0;
  for (const token of queryTokens) {
    if (chunkCounts.has(token)) score += 1 + Math.log(1 + chunkCounts.get(token));
  }
  const headingBoost = queryTokens.some((token) => tokenize(chunk.heading).includes(token)) ? 0.5 : 0;
  const riskPenalty = chunk.risks.some((risk) => risk.severity === "critical") ? 0.6 : chunk.risks.length ? 0.2 : 0;
  return Math.max(0, score / Math.sqrt(chunk.terms.length || 1) + headingBoost - riskPenalty);
}

function mmrScore(chunk, selected, diversity) {
  if (!selected.length) return chunk.relevance;
  const maxSimilarity = Math.max(...selected.map((item) => jaccard(chunk.terms, item.terms)));
  return (1 - diversity) * chunk.relevance - diversity * maxSimilarity;
}

function edgePin(chunks) {
  const sorted = [...chunks].sort((left, right) => right.relevance - left.relevance);
  const front = [];
  const back = [];
  sorted.forEach((chunk, index) => {
    if (index % 2 === 0) front.push(chunk);
    else back.unshift(chunk);
  });
  return [...front, ...back];
}

function estimateTokens(text) {
  return Math.ceil((text.match(/\S+/g) ?? []).length * 1.33);
}

function tokenize(text) {
  return String(text).toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [];
}

function countTerms(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export {
  chunkDocument,
  estimateTokens,
  packContext,
  rankChunks,
  renderContextBlock,
  riskScan,
};


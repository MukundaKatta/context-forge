import { estimateTokens } from "./estimateTokens.js";

// Split first on blank-line paragraphs, then on sentence boundaries inside
// paragraphs that exceed a chunk on their own. This keeps semantic edges aligned
// with markdown/prose structure while still respecting the token budget.
function splitParagraphs(text) {
  return String(text ?? "")
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(paragraph) {
  // Split on terminal punctuation followed by whitespace; preserve the punctuation
  // so the chunk text reads naturally when reassembled.
  const parts = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (parts && parts.length > 1) return parts.map((s) => s.trim()).filter(Boolean);
  return [paragraph];
}

function locateSpan(haystack, needle, startFrom) {
  if (!needle) return [startFrom, startFrom];
  const index = haystack.indexOf(needle, startFrom);
  if (index === -1) return [startFrom, startFrom + needle.length];
  return [index, index + needle.length];
}

export function chunkDocument(doc, options = {}) {
  const maxTokens = options.maxTokens ?? 200;
  const overlapTokens = Math.max(0, options.overlapTokens ?? 20);
  const text = String(doc?.text ?? "");
  const docId = String(doc?.id ?? doc?.path ?? "doc");
  const source = doc?.source ?? doc?.path ?? doc?.id ?? docId;
  if (!text.trim()) return [];

  // First pass: paragraphs. If a paragraph fits, keep it as one unit; if not,
  // recurse into sentences. We then pack units sequentially under maxTokens.
  const units = [];
  for (const paragraph of splitParagraphs(text)) {
    if (estimateTokens(paragraph) <= maxTokens) {
      units.push(paragraph);
    } else {
      for (const sentence of splitSentences(paragraph)) {
        if (estimateTokens(sentence) <= maxTokens) {
          units.push(sentence);
        } else {
          // Fall back to word-level splitting when a single sentence is too large.
          const words = sentence.split(/\s+/);
          let buffer = [];
          for (const word of words) {
            const candidate = buffer.length ? `${buffer.join(" ")} ${word}` : word;
            if (estimateTokens(candidate) > maxTokens && buffer.length) {
              units.push(buffer.join(" "));
              buffer = [word];
            } else {
              buffer.push(word);
            }
          }
          if (buffer.length) units.push(buffer.join(" "));
        }
      }
    }
  }

  // Pack units greedily into chunks under maxTokens, with token-level overlap.
  const chunks = [];
  let cursor = 0;
  let buffer = [];
  let bufferTokens = 0;
  let counter = 0;

  const flush = () => {
    if (!buffer.length) return;
    const chunkText = buffer.join("\n\n");
    const [start, end] = locateSpan(text, chunkText.split("\n\n")[0], cursor);
    // The end position is computed against the last unit so spans cover all units.
    const lastUnit = buffer[buffer.length - 1];
    const lastIndex = text.indexOf(lastUnit, start);
    const finalEnd = lastIndex === -1 ? end : lastIndex + lastUnit.length;
    const id = `${docId}#${counter++}`;
    chunks.push({
      id,
      doc_id: docId,
      source,
      text: chunkText,
      start,
      end: finalEnd,
      tokens: estimateTokens(chunkText),
    });
    cursor = finalEnd;
  };

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    if (bufferTokens + unitTokens > maxTokens && buffer.length) {
      flush();
      // Build overlap from tail of previous buffer.
      if (overlapTokens > 0) {
        const tail = [];
        let tailTokens = 0;
        for (let i = buffer.length - 1; i >= 0; i--) {
          const t = estimateTokens(buffer[i]);
          if (tailTokens + t > overlapTokens) break;
          tail.unshift(buffer[i]);
          tailTokens += t;
        }
        buffer = tail;
        bufferTokens = tailTokens;
      } else {
        buffer = [];
        bufferTokens = 0;
      }
    }
    buffer.push(unit);
    bufferTokens += unitTokens;
  }
  flush();

  return chunks;
}

export default chunkDocument;

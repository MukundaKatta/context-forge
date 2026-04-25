// Prompt-injection and exfiltration risk scanner.
// Each rule documents its own severity. We scan the raw text once per rule and
// surface findings with index + snippet so callers can highlight the offending
// region. Patterns intentionally favor high-precision matches; expand carefully
// to avoid false positives on legitimate documentation.

const ZERO_WIDTH_CHARS = /[​‌‍﻿]/g;

const RULES = [
  {
    kind: "ignore_instructions",
    severity: "high",
    pattern: /ignore\s+(all|previous|prior|above)\s+instructions/gi,
  },
  {
    kind: "system_prefix",
    severity: "high",
    pattern: /^system:\s/gim,
  },
  {
    kind: "you_are_now",
    severity: "med",
    pattern: /you\s+are\s+now\b/gi,
  },
  {
    kind: "role_tag",
    severity: "high",
    pattern: /<\|system\|>|<\|assistant\|>|<\|user\|>|\[INST\]|###\s*system\b/gi,
  },
  {
    kind: "exfil_curl",
    severity: "high",
    pattern: /\bcurl\s+[^\s|]*https?:\/\//gi,
  },
  {
    kind: "exfil_wget",
    severity: "high",
    pattern: /\bwget\s+[^\s|]*https?:\/\//gi,
  },
  {
    kind: "exfil_base64",
    severity: "med",
    pattern: /\bbase64\s+-d\b/gi,
  },
];

function snippetAround(text, index, length, padding = 24) {
  const start = Math.max(0, index - padding);
  const end = Math.min(text.length, index + length + padding);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function findAll(text, pattern, kind, severity, findings) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    findings.push({
      kind,
      severity,
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
    });
    if (match.index === pattern.lastIndex) pattern.lastIndex++;
  }
}

function detectSuspiciousUrls(text, findings) {
  // Match http(s) URLs and flag long randomized subdomains (e.g. 24+ hex chars).
  const urlPattern = /https?:\/\/([^\s/?#]+)/gi;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const host = match[1];
    const labels = host.split(".");
    if (labels.length < 3) continue;
    const subdomain = labels[0];
    const longRandom = subdomain.length >= 16 && /^[a-z0-9]+$/i.test(subdomain) && /\d/.test(subdomain);
    if (longRandom) {
      findings.push({
        kind: "suspicious_url",
        severity: "med",
        snippet: snippetAround(text, match.index, match[0].length),
        index: match.index,
      });
    }
  }
}

function detectZeroWidth(text, findings) {
  ZERO_WIDTH_CHARS.lastIndex = 0;
  let match;
  while ((match = ZERO_WIDTH_CHARS.exec(text)) !== null) {
    findings.push({
      kind: "zero_width_char",
      severity: "low",
      snippet: snippetAround(text, match.index, 1),
      index: match.index,
    });
  }
}

export function scanInjection(text) {
  const string = String(text ?? "");
  if (!string) return [];
  const findings = [];
  for (const rule of RULES) {
    findAll(string, rule.pattern, rule.kind, rule.severity, findings);
  }
  detectZeroWidth(string, findings);
  detectSuspiciousUrls(string, findings);
  // Sort by index so consumers see findings in document order.
  findings.sort((a, b) => a.index - b.index);
  return findings;
}

export default scanInjection;

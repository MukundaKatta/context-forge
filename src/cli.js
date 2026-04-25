#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { packContext } from "./index.js";

// Hand-rolled argv parser. Recognizes the documented flags and treats anything
// that isn't a flag (or a flag's value) as a positional file path.
function parseArgs(argv) {
  const out = {
    command: null,
    query: null,
    budget: 1200,
    lambda: 0.7,
    maxTokens: 200,
    out: null,
    json: false,
    files: [],
  };

  if (!argv.length) return out;

  // First positional non-flag token is the command.
  let i = 0;
  if (!argv[0].startsWith("--") && !argv[0].startsWith("-")) {
    out.command = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--json") {
      out.json = true;
      continue;
    }
    if (arg === "--query") {
      out.query = argv[++i];
      continue;
    }
    if (arg === "--budget") {
      out.budget = Number(argv[++i]);
      continue;
    }
    if (arg === "--lambda") {
      out.lambda = Number(argv[++i]);
      continue;
    }
    if (arg === "--max-tokens") {
      out.maxTokens = Number(argv[++i]);
      continue;
    }
    if (arg === "--out") {
      out.out = argv[++i];
      continue;
    }
    if (arg.startsWith("--")) {
      // Unknown flag; consume its value if it doesn't look like a path.
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) i++;
      continue;
    }
    out.files.push(arg);
  }

  return out;
}

function printHelp() {
  const lines = [
    "Usage: ctxforge pack --query <q> --budget <n> [options] <file> [file...]",
    "",
    "Options:",
    "  --query <q>        Query text used to score chunks (required)",
    "  --budget <n>       Token budget for packed context (default: 1200)",
    "  --lambda <f>       MMR lambda, 0..1 (default: 0.7)",
    "  --max-tokens <n>   Max tokens per chunk (default: 200)",
    "  --out <path>       Write result to a file instead of stdout",
    "  --json             Emit full JSON result",
    "  -h, --help         Show this help",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function renderHuman(result) {
  const sections = [];
  for (const block of result.blocks) {
    sections.push(`[${block.id}] (source: ${block.source}, score: ${block.score.toFixed(3)}, tokens: ${block.tokens})`);
    sections.push(block.text);
    sections.push("");
  }

  if (result.risks.length) {
    sections.push("Risks:");
    for (const risk of result.risks) {
      sections.push(`  - ${risk.id} ${risk.severity.toUpperCase()} ${risk.kind}: ${risk.snippet}`);
    }
    sections.push("");
  }

  const total = result.blocks.length;
  sections.push(`Used ${result.used_tokens} / ${result.budgetTokens ?? "?"} tokens across ${total} blocks (${result.dropped.length} dropped).`);
  return sections.join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    printHelp();
    return args.command ? 0 : args.help ? 0 : 2;
  }
  if (args.command !== "pack") {
    process.stderr.write(`Unknown command: ${args.command}\n`);
    return 2;
  }
  if (!args.query) {
    process.stderr.write("Missing --query\n");
    return 2;
  }
  if (!args.files.length) {
    process.stderr.write("No input files given\n");
    return 2;
  }

  const documents = await Promise.all(
    args.files.map(async (file) => {
      const absPath = path.resolve(file);
      const text = await readFile(absPath, "utf8");
      return {
        id: path.basename(file),
        source: file,
        text,
      };
    }),
  );

  const result = packContext({
    query: args.query,
    documents,
    budgetTokens: args.budget,
    options: {
      lambda: args.lambda,
      maxTokens: args.maxTokens,
    },
  });
  result.budgetTokens = args.budget;

  const payload = args.json
    ? JSON.stringify(result, null, 2)
    : renderHuman(result);

  if (args.out) {
    await writeFile(args.out, `${payload}\n`, "utf8");
  } else {
    process.stdout.write(`${payload}\n`);
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((err) => {
    process.stderr.write(`${err.stack ?? err.message}\n`);
    process.exitCode = 1;
  });

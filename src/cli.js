#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { packContext } from "./index.js";

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (command !== "pack") {
    console.error(`Unknown command: ${command}`);
    return 2;
  }

  const query = readOption(args, "--query");
  if (!query) {
    console.error("Missing --query.");
    return 2;
  }

  const budgetTokens = Number(readOption(args, "--budget") ?? 2000);
  const format = readOption(args, "--format") ?? "prompt";
  const files = args.filter((arg, index) => !arg.startsWith("--") && !isOptionValue(args, index));
  const documents = await Promise.all(files.map(async (file) => ({
    id: path.basename(file),
    path: file,
    text: await readFile(file, "utf8"),
  })));

  const packed = packContext({ query, documents, budgetTokens });
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(packed, null, 2)}\n`);
  } else {
    process.stdout.write(`${packed.prompt}\n`);
  }
  return packed.warnings.some((warning) => warning.severity === "critical") ? 1 : 0;
}

function readOption(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function isOptionValue(args, index) {
  return index > 0 && args[index - 1].startsWith("--");
}

function printHelp() {
  console.log(`Usage: ctxforge pack --query <query> [--budget tokens] [--format prompt|json] <files...>

Ranks, risk-scans, and packs local documents into a citation-ready context block.`);
}

main().then((code) => {
  process.exitCode = code;
});


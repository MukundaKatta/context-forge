import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../src/cli.js");

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("CLI pack command prints content from input files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ctxforge-"));
  try {
    const policy = path.join(dir, "policy.md");
    const faq = path.join(dir, "faq.md");
    await writeFile(
      policy,
      "Refunds are available within 30 days of the purchase date for any reason. After 45 days, please contact our customer support team directly to discuss your options under the extended grace period for hardship cases.\n",
    );
    await writeFile(
      faq,
      "Q: When does shipping happen? A: Packages typically ship within three business days using our standard ground carrier service. Expedited overnight shipping is available for an additional fee at checkout for most domestic orders.\n",
    );

    const { code, stdout, stderr } = await runCli([
      "pack",
      "--query",
      "refund 45 days",
      "--budget",
      "200",
      policy,
      faq,
    ]);
    assert.equal(code, 0, `nonzero exit; stderr=${stderr}`);
    assert.match(stdout, /Refunds are available/);
    assert.match(stdout, /Used \d+/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI --json emits parseable JSON with documented fields", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ctxforge-"));
  try {
    const policy = path.join(dir, "policy.md");
    await writeFile(
      policy,
      "Refunds are available within 30 days of the purchase date for any reason. After 45 days, please contact our customer support team directly to discuss extended grace period options for hardship.\n",
    );
    const { code, stdout } = await runCli([
      "pack",
      "--query",
      "refund",
      "--budget",
      "200",
      "--json",
      policy,
    ]);
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed.blocks));
    assert.equal(typeof parsed.used_tokens, "number");
    assert.ok(Array.isArray(parsed.dropped));
    assert.ok(Array.isArray(parsed.risks));
    assert.equal(typeof parsed.citations, "object");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI prints help and exits 0 with --help", async () => {
  const { code, stdout } = await runCli(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /Usage: ctxforge pack/);
});

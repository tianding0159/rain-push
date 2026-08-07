#!/usr/bin/env node
// Round-A annotation via the OpenAI API (delivery mode B).
//
// Runs ON THE USER'S MACHINE. Reads the private round-a pack, sends each record to GPT using the
// SHARED prompt (gpt-prompt.mjs), and writes structured annotations to a gitignored file. The
// verbatim corpus goes ONLY to the OpenAI API over TLS from your machine — never to git, never to
// any public location.
//
// Privacy / safety choices:
//   - API key read from OPENAI_API_KEY env var. NEVER hardcoded, NEVER logged.
//   - store:false on every request → opt out of OpenAI-side retention where honored.
//   - --dry-run prints the exact prompts WITHOUT any network call, so you can inspect what would
//     be sent before sending anything.
//   - Resumable: skips records already present in the output file, so a crash/interrupt doesn't
//     re-send (and re-expose) everything.
//   - The raw corpus file is never opened here; text comes from the already-selected round-a pack.
//
// Usage:
//   node bin/annotate-openai.mjs --dry-run            # inspect prompts, no network
//   node bin/annotate-openai.mjs                      # real run (needs OPENAI_API_KEY)
//   node bin/annotate-openai.mjs --model gpt-4o --limit 3
//
// Output: private/pilot-50/round-a.gpt.json  (gitignored)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRawPath } from "../lib/raw-corpus.mjs";
import { systemPrompt, userPromptFor } from "../lib/gpt-prompt.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "..", "private", "pilot-50");
const OUT = join(DIR, "round-a.gpt.json");
const API_URL = "https://api.openai.com/v1/chat/completions";

function parseArgs(argv) {
  const a = { dryRun: false, model: "gpt-4o", limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") a.dryRun = true;
    else if (argv[i] === "--model") a.model = argv[++i];
    else if (argv[i] === "--limit") a.limit = Number(argv[++i]);
  }
  return a;
}

function loadExisting() {
  if (!existsSync(OUT)) return { annotations: [] };
  try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return { annotations: [] }; }
}

async function callOpenAI({ apiKey, model, sys, user }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false, // opt out of retention where honored
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Provenance guard: record raw hash before/after (we don't open it, but prove the run didn't).
  const rawPath = resolveRawPath()?.path;
  const preHash = rawPath ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  const roundA = JSON.parse(readFileSync(join(DIR, "round-a.private.json"), "utf8"));
  const forms = roundA.forms.slice(0, args.limit);
  const sys = systemPrompt();

  if (args.dryRun) {
    // Show the system prompt once + the first record's user prompt, plus a manifest. NO network.
    process.stdout.write("=== DRY RUN (no network) ===\n\n[SYSTEM]\n" + sys + "\n\n");
    if (forms[0]) process.stdout.write("[USER · " + forms[0].presentationId + "]\n" + userPromptFor(forms[0].presentationId, forms[0].text) + "\n\n");
    process.stdout.write(JSON.stringify({
      status: "DRY_RUN_OK",
      wouldSend: forms.length,
      model: args.model,
      store: false,
      apiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
      output: "private/pilot-50/round-a.gpt.json",
    }, null, 2) + "\n");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write("ERROR: OPENAI_API_KEY not set. Export it first:\n  export OPENAI_API_KEY=sk-...\n");
    process.exit(1);
  }

  const existing = loadExisting();
  const done = new Set((existing.annotations || []).map((a) => a.presentationId));
  const results = existing.annotations || [];

  let sent = 0, skipped = 0, failed = 0;
  for (const f of forms) {
    if (done.has(f.presentationId)) { skipped++; continue; }
    try {
      const ann = await callOpenAI({ apiKey, model: args.model, sys, user: userPromptFor(f.presentationId, f.text) });
      ann.presentationId = f.presentationId; // enforce the id regardless of model echo
      results.push(ann);
      sent++;
      // Persist after EACH record so an interruption never loses progress / never re-sends.
      writeFileSync(OUT, JSON.stringify({ model: args.model, annotations: results }, null, 2) + "\n");
      process.stderr.write(`ok ${f.presentationId} (${sent} sent)\n`);
    } catch (e) {
      failed++;
      process.stderr.write(`FAIL ${f.presentationId}: ${e.message}\n`);
    }
  }

  const postHash = rawPath ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  process.stdout.write(JSON.stringify({
    status: failed === 0 ? "GPT_ROUND_A_COMPLETE" : "GPT_ROUND_A_PARTIAL",
    model: args.model,
    sent, skipped, failed,
    total: results.length,
    output: "private/pilot-50/round-a.gpt.json",
    rawHashUnchanged: preHash === postHash,
  }, null, 2) + "\n");
}

main().catch((e) => { process.stderr.write("fatal: " + e.message + "\n"); process.exit(1); });

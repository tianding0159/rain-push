#!/usr/bin/env node
// CLI: validate a corpus against schemas + cross-record contract.
//
// Usage:
//   node runtime/v7/corpus/bin/validate.mjs \
//     --registry PATH --events PATH [--retrievals PATH] [--json]
// Exit codes (deterministic):
//   0  valid
//   1  contract/schema problems found (list printed; stable codes)
//   2  usage / IO error (no stack trace)

import { readJson, loadSchemas, IoError } from "../lib/io.mjs";
import { loadPolicy, PolicyError } from "../lib/source-policy.mjs";
import { validateCorpus } from "../lib/validator.mjs";

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--registry") args.registry = argv[++i];
    else if (a === "--events") args.events = argv[++i];
    else if (a === "--retrievals") args.retrievals = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.registry) throw new Error("--registry is required");
  if (!args.events) throw new Error("--events is required");
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`usage error: ${err.message}\n`);
    process.exit(2);
  }
  try {
    const policy = loadPolicy();
    const schemas = loadSchemas();
    const registry = readJson(args.registry);
    const events = readJson(args.events);
    const retrievals = args.retrievals ? readJson(args.retrievals) : [];
    const { valid, problems } = validateCorpus({
      schemas: { registry: schemas.registry, event: schemas.event, retrieval: schemas.retrieval },
      policy, registry,
      events: Array.isArray(events) ? events : events.events || [],
      retrievals: Array.isArray(retrievals) ? retrievals : retrievals.retrievals || [],
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ valid, problems }, null, 2)}\n`);
    } else if (valid) {
      process.stdout.write("corpus valid\n");
    } else {
      for (const p of problems) process.stdout.write(`${p.code}\t${p.recordId ?? "-"}\t${p.detail}\n`);
      process.stdout.write(`${problems.length} problem(s)\n`);
    }
    process.exit(valid ? 0 : 1);
  } catch (err) {
    if (err instanceof PolicyError || err instanceof IoError) {
      process.stderr.write(`${err.code}: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

main();

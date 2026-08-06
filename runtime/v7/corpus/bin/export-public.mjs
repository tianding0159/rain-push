#!/usr/bin/env node
// CLI: export a private corpus to the public derived set (no verbatim).
//
// Usage:
//   node runtime/v7/corpus/bin/export-public.mjs \
//     --registry PATH --events PATH [--out PATH] [--strict] [--json]
// --strict: fail (exit 1) on the first non-exportable (synthetic) event instead of skipping.
// With no --out the canonical JSON is printed to stdout. Exit codes: 0 ok, 1 strict refusal,
// 2 usage/IO error.

import { readJson, writeCanonicalJson, canonicalJson, IoError } from "../lib/io.mjs";
import { loadPolicy, PolicyError } from "../lib/source-policy.mjs";
import { exportCorpus, ExportError } from "../lib/export-public.mjs";

function parseArgs(argv) {
  const args = { json: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--registry") args.registry = argv[++i];
    else if (a === "--events") args.events = argv[++i];
    else if (a === "--out") args.out = argv[++i];
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
    const registry = readJson(args.registry);
    const eventsRaw = readJson(args.events);
    const events = Array.isArray(eventsRaw) ? eventsRaw : eventsRaw.events || [];
    const { events: exported, skipped } = exportCorpus({ events, registry, policy, strict: args.strict });
    if (args.out) writeCanonicalJson(args.out, exported);
    else process.stdout.write(canonicalJson(exported));
    if (args.json && args.out) process.stdout.write(canonicalJson({ exported: exported.length, skipped }));
    else if (!args.json && args.out) process.stdout.write(`exported ${exported.length}, skipped ${skipped.length}\n`);
    process.exit(0);
  } catch (err) {
    if (err instanceof ExportError) {
      process.stderr.write(`${err.code}: ${err.message}\n`);
      process.exit(1);
    }
    if (err instanceof PolicyError || err instanceof IoError) {
      process.stderr.write(`${err.code}: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

main();

#!/usr/bin/env node
// CLI: migrate a v0.1 corpus to v1 (registry + events).
//
// Usage:
//   node runtime/v7/corpus/bin/migrate.mjs --in PATH \
//     [--out-registry PATH] [--out-events PATH] [--json]
// With no --out-* paths it prints the result to stdout (deterministic canonical JSON) so it
// can be diffed / piped without writing files. Exit codes: 0 ok, 2 usage/IO error.

import { readJson, writeCanonicalJson, canonicalJson, IoError } from "../lib/io.mjs";
import { migrateCorpus } from "../lib/migrate.mjs";

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--in") args.in = argv[++i];
    else if (a === "--out-registry") args.outRegistry = argv[++i];
    else if (a === "--out-events") args.outEvents = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.in) throw new Error("--in is required");
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
    const v01 = readJson(args.in);
    const { registry, events, warnings } = migrateCorpus(v01);
    if (args.outRegistry) writeCanonicalJson(args.outRegistry, registry);
    if (args.outEvents) writeCanonicalJson(args.outEvents, events);
    if (!args.outRegistry && !args.outEvents) {
      process.stdout.write(canonicalJson({ registry, events, warnings }));
    } else if (args.json) {
      process.stdout.write(canonicalJson({ warnings }));
    } else {
      for (const w of warnings) process.stdout.write(`${w.code}\t${w.recordId ?? "-"}\t${w.detail}\n`);
      process.stdout.write(`migrated ${events.length} event(s), ${registry.sources.length} source(s), ${warnings.length} warning(s)\n`);
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof IoError) {
      process.stderr.write(`${err.code}: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

main();

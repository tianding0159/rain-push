#!/usr/bin/env node
// CLI: scan public artifacts for leaked private verbatim / private-only fields.
//
// Usage:
//   node runtime/v7/corpus/bin/privacy-scan.mjs \
//     --private PATH --public PATH [--public PATH ...] [--json]
// Exit codes (deterministic):
//   0  clean
//   1  leakage found (list printed; stable codes)
//   2  usage / IO error

import { readJson, IoError } from "../lib/io.mjs";
import { scanForLeaks } from "../lib/privacy-scan.mjs";

function parseArgs(argv) {
  const args = { json: false, public: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--private") args.private = argv[++i];
    else if (a === "--public") args.public.push(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.private) throw new Error("--private is required");
  if (args.public.length === 0) throw new Error("at least one --public is required");
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
    const priv = readJson(args.private);
    const privateEvents = Array.isArray(priv) ? priv : priv.events || [];
    const publicArtifacts = args.public.map((p) => ({ name: p, data: readJson(p) }));
    const { clean, findings } = scanForLeaks(privateEvents, publicArtifacts);
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ clean, findings }, null, 2)}\n`);
    } else if (clean) {
      process.stdout.write("no leakage\n");
    } else {
      for (const f of findings) process.stdout.write(`${f.code}\t${f.artifact}\t${f.path}\t${f.detail}\n`);
      process.stdout.write(`${findings.length} finding(s)\n`);
    }
    process.exit(clean ? 0 : 1);
  } catch (err) {
    if (err instanceof IoError) {
      process.stderr.write(`${err.code}: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

main();

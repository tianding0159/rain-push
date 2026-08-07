#!/usr/bin/env node
// P1-1C §2/§3 — generate the deterministic 200-record selection + holdout split.
//
// Reads the frozen 50-record selection-key (to pin PA-001..050 by hash) and the raw corpus, runs
// select200(), and writes:
//   PRIVATE (gitignored, carries text + hashes):
//     private/behavior-200/selection.private.json      full 200 records (text, buckets, split)
//     private/behavior-200/selection-key.private.json  presentationId ↔ hash ↔ split (answer key)
//   COMMITTED-SAFE (verbatim-free, no hashes):
//     behavior/discovery-200/selection-manifest.aggregate.json  counts + coverage + seeds
//
// The raw corpus is opened read-only; its sha256 is recorded pre/post to prove it was untouched.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { loadRawCorpus, resolveRawPath } from "../lib/raw-corpus.mjs";
import { select200 } from "../lib/select-200.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const ORIGINAL_KEY = join(V7, "private", "pilot-50", "selection-key.private.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200");
const OUT_COMMITTED = join(HERE, "..", "discovery-200");

function sha256File(p) { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
function writeJson(p, o) { writeFileSync(p, canonicalJson(o) + "\n"); }

function main() {
  if (!existsSync(ORIGINAL_KEY)) { process.stderr.write(`missing ${ORIGINAL_KEY}\n`); process.exit(1); }
  const resolved = resolveRawPath();
  if (!resolved) { process.stdout.write(canonicalJson({ status: "PROVENANCE_BLOCKED" }) + "\n"); process.exit(0); }
  const rawPath = resolved.path;
  const preHash = sha256File(rawPath);

  const loaded = loadRawCorpus();
  if (!loaded.present) { process.stdout.write(canonicalJson({ status: "PROVENANCE_BLOCKED" }) + "\n"); process.exit(0); }

  const originalKey = JSON.parse(readFileSync(ORIGINAL_KEY, "utf8")).key;
  const sel = select200(loaded.records, originalKey);
  if (!sel.ok) { process.stderr.write("SELECTION FAILED: " + JSON.stringify(sel) + "\n"); process.exit(1); }

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  const byPres = sel.records.slice().sort((a, b) => a.presentationId.localeCompare(b.presentationId));

  // ---- PRIVATE selection (text + buckets + split) ----
  writeJson(join(OUT_PRIVATE, "selection.private.json"), {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    stage: "P1-1C-200",
    corpus: { path: "private/tangtang-corpus-1051.raw.txt", sha256: preHash, lines: loaded.records.length },
    seeds: { selection: sel.selectionSeed, presentation: sel.presentationSeed, holdout: sel.holdoutSeed },
    counts: { total: sel.target, original: sel.originalCount, new: sel.newCount, discovery: sel.discoveryCount, holdout: sel.holdoutCount },
    coverage: sel.coverage,
    coverageNew: sel.coverageNew,
    records: byPres.map((r) => ({
      presentationId: r.presentationId,
      recordHash: r.hash,
      order: r.order,
      speaker: r.speaker,
      text: r.text,
      buckets: r.buckets,
      source: r.source,
      split: r.split,
      punct: r.punct,
    })),
  });

  // ---- PRIVATE selection-key (answer key: id ↔ hash ↔ split, NO text) ----
  writeJson(join(OUT_PRIVATE, "selection-key.private.json"), {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    warning: "DO NOT OPEN DURING ANNOTATION — de-anonymizes ids, reveals buckets + holdout split.",
    corpusSha256: preHash,
    seeds: { selection: sel.selectionSeed, presentation: sel.presentationSeed, holdout: sel.holdoutSeed },
    key: byPres.map((r) => ({
      presentationId: r.presentationId,
      recordHash: r.hash,
      sourceOrder: r.order,
      samplingBuckets: r.buckets,
      source: r.source,
      split: r.split,
    })),
    holdoutHashes: sel.holdoutHashes,
    discoveryHashes: sel.discoveryHashes,
  });

  // ---- COMMITTED-SAFE manifest (counts + coverage + seeds; NO text, NO hashes) ----
  writeJson(join(OUT_COMMITTED, "selection-manifest.aggregate.json"), {
    visibility: "committed_safe",
    verbatimFree: true,
    stage: "P1-1C-200",
    corpusSha256: preHash,
    corpusLines: loaded.records.length,
    seeds: { selection: sel.selectionSeed, presentation: sel.presentationSeed, holdout: sel.holdoutSeed },
    counts: { total: sel.target, original: sel.originalCount, new: sel.newCount, discovery: sel.discoveryCount, holdout: sel.holdoutCount },
    coverageTotal: sel.coverage,
    coverageNew: sel.coverageNew,
    invariants: {
      originalsPreserved: sel.originalCount === 50,
      newUnique: sel.newCount === 150,
      totalUnique: sel.target === 200,
      holdoutExcludesOriginals: true,
      discoverySupersetsOriginals: true,
    },
  });

  const postHash = sha256File(rawPath);
  process.stdout.write(canonicalJson({
    status: preHash === postHash ? "SELECTION_200_READY" : "RAW_CORPUS_MUTATED",
    corpusUnchanged: preHash === postHash,
    counts: { total: sel.target, original: sel.originalCount, new: sel.newCount, discovery: sel.discoveryCount, holdout: sel.holdoutCount },
    uniqueHashes: new Set(sel.records.map((r) => r.hash)).size,
    holdoutOnOriginal: sel.originals.some((o) => sel.holdoutHashes.includes(o.hash)),
    coverageNewNonZero: Object.values(sel.coverageNew).filter((v) => v > 0).length,
  }) + "\n");
}

main();

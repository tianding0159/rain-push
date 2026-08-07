#!/usr/bin/env node
// P1-1C §7-8 — run the counterexample engine over the 160 discovery/stability annotations.
// Emits private (link-bearing) + committed-safe (counts/densities only) outputs.
// Enforces guide freeze; NEVER reads the holdout.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { GRAMMAR_CANDIDATES, evaluateAll } from "../lib/counterexample.mjs";
import { enforceFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const ANN_160 = join(V7, "private", "behavior-200", "annotation.private.json");
const FREEZE = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200");
const OUT_COMMITTED = join(HERE, "..", "discovery-200");

function main() {
  for (const p of [ANN_160, FREEZE]) if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8"));
  const { ok, freezeCheck } = enforceFreeze(freeze);
  if (!ok) { process.stdout.write(canonicalJson({ status: "GUIDE_FREEZE_BROKEN", freezeCheck }) + "\n"); process.exit(2); }

  const annotations = JSON.parse(readFileSync(ANN_160, "utf8")).annotations;
  const results = evaluateAll(GRAMMAR_CANDIDATES, annotations);

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  writeFileSync(join(OUT_PRIVATE, "counterexamples.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", n: annotations.length, candidates: results,
  }) + "\n");

  // committed-safe: drop the link lists (they de-anonymize records), keep counts + densities.
  const safe = results.map(({ links, ...rest }) => rest);
  writeFileSync(join(OUT_COMMITTED, "counterexample-density.aggregate.json"), canonicalJson({
    visibility: "committed_safe", verbatimFree: true, stage: "P1-1C-200",
    guideFreezeVersion: freeze.guideFreezeVersion, n: annotations.length,
    candidates: safe,
  }) + "\n");

  process.stdout.write(canonicalJson({
    status: "COUNTEREXAMPLES_200_READY",
    summary: safe.map((c) => ({ id: c.candidateId, support: c.supportCount, trueCE: c.trueCounterexampleCount, competing: c.competingStrategyCount, ambiguous: c.ambiguousCount, eligible: c.eligibleOpportunityCount, ceDensity: c.counterexampleDensity, robustness: c.robustness })),
  }) + "\n");
}

main();

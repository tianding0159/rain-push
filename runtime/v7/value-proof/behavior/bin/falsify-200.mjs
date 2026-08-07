#!/usr/bin/env node
// P1-1C §9 — H1-H11 falsification: compare 50 vs 160 and emit revised formulations + boundaries.
// Enforces guide freeze; NEVER reads the holdout.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { runDiscovery } from "../lib/grammar-discovery.mjs";
import { falsifyHypotheses } from "../lib/hypothesis-falsification.mjs";
import { enforceFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const REFINED_50 = join(V7, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const ANN_160 = join(V7, "private", "behavior-200", "annotation.private.json");
const FREEZE = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200");
const OUT_COMMITTED = join(HERE, "..", "discovery-200");

function main() {
  for (const p of [REFINED_50, ANN_160, FREEZE]) if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8"));
  const { ok, freezeCheck } = enforceFreeze(freeze);
  if (!ok) { process.stdout.write(canonicalJson({ status: "GUIDE_FREEZE_BROKEN", freezeCheck }) + "\n"); process.exit(2); }

  const ann50 = JSON.parse(readFileSync(REFINED_50, "utf8")).annotations;
  const ann160 = JSON.parse(readFileSync(ANN_160, "utf8")).annotations;
  const disc50 = runDiscovery(ann50);
  const disc160 = runDiscovery(ann160);

  const { results, rollup } = falsifyHypotheses({ ann50, disc50, ann160, disc160 });

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  writeFileSync(join(OUT_PRIVATE, "hypotheses.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", n: ann160.length, results, rollup,
  }) + "\n");
  writeFileSync(join(OUT_COMMITTED, "hypothesis-falsification.aggregate.json"), canonicalJson({
    visibility: "committed_safe", verbatimFree: true, stage: "P1-1C-200",
    guideFreezeVersion: freeze.guideFreezeVersion,
    note: "Verdicts partly reflect the conservative heuristic annotator (see summary.aggregate.json instrumentShift). REJECTED/WEAKENED at 160 that align with pilot findings (esp. H3) are the credible ones; those newly weakened only at 160 may be instrument-driven.",
    results, rollup,
  }) + "\n");

  process.stdout.write(canonicalJson({
    status: "FALSIFICATION_200_READY",
    rollup,
    verdicts: results.map((r) => ({ id: r.id, verdict: r.verdict, rate50: r.support50.rate, rate160: r.support160.rate, trueCE: r.trueCounterexamples160, revised: !!r.revisedFormulation })),
  }) + "\n");
}

main();

#!/usr/bin/env node
// P1-1C §10-16 — context-conditioned behavior dimensions over the 160 discovery/stability set.
// Every dimension is split by annotation cohort (carried_50 vs heuristic_110) so the instrument-shift
// confound is visible per-dimension, not just as a global disclaimer.
// Enforces guide freeze; NEVER reads the holdout.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { analyzeDimensions } from "../lib/behavior-dimensions.mjs";
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
  const analysis = analyzeDimensions(annotations);

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  // The dimension analysis carries only controlled-vocabulary tokens + counts (no links, no hashes,
  // no verbatim text), so the private and committed forms are identical apart from the visibility tag.
  writeFileSync(join(OUT_PRIVATE, "dimensions.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", ...analysis,
  }) + "\n");
  writeFileSync(join(OUT_COMMITTED, "dimensions.aggregate.json"), canonicalJson({
    visibility: "committed_safe", verbatimFree: true, stage: "P1-1C-200",
    guideFreezeVersion: freeze.guideFreezeVersion,
    note: "Every dimension is split byCohort (carried_50 hand-authored vs heuristic_110). A cohortNote flags dimensions where the two instruments diverge by >= 0.25 — those 160-level numbers are instrument-sensitive, not clean character estimates. See summary.aggregate.json instrumentShift.",
    ...analysis,
  }) + "\n");

  const dims = analysis.dimensions;
  process.stdout.write(canonicalJson({
    status: "DIMENSIONS_200_READY",
    cohortSizes: analysis.cohortSizes,
    dimensionsWithCohortDivergence: Object.entries(dims).filter(([, d]) => d.cohortNote).map(([k]) => k),
    headline: {
      priors_domains: dims.characterPriors.conditionedByTriggerDomain.length,
      hairTriggerRate: dims.triggerSensitivityMatrix.hairTriggerRateAmongJudgeable,
      escalationRate: dims.intraMessageMomentum.escalationRateAmongMultiBeat,
      expectationRate: dims.expectedPartnerOperations.expectationRate,
      performanceRate: dims.performancePatterns.performanceRate,
      functionalMaskRate: dims.maskAnalysis.functionalMaskRateAmongReveals,
    },
  }) + "\n");
}

main();

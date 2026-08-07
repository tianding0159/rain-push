#!/usr/bin/env node
// P1-1C §6 — stability comparison: 50-record grammar vs 160-record discovery/stability grammar.
//
// Reads the refined-50 annotations and the 160 discovery annotations, runs discovery on each, and
// compares the 12 metric families + 2 scalar rates. Emits:
//   private/behavior-200/discovery-160.private.json   (full 160 discovery bundle, link-bearing)
//   private/behavior-200/stability.private.json        (per-key labels, link-bearing)
//   behavior/discovery-200/summary.aggregate.json      (verbatim-free: verdicts, spearman, overlap)
//
// Enforces guide freeze; NEVER reads the holdout file.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { runDiscovery } from "../lib/grammar-discovery.mjs";
import { compareStability } from "../lib/grammar-stability.mjs";
import { enforceFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const REFINED_50 = join(V7, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const ANN_160 = join(V7, "private", "behavior-200", "annotation.private.json");
const FREEZE = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200");
const OUT_COMMITTED = join(HERE, "..", "discovery-200");

function rates(anns) {
  const N = anns.length || 1;
  const single = anns.filter((a) => (a.behaviorActionSequence || []).length === 1).length;
  const multiFn = anns.filter((a) => ((a.interactionFunctions?.functions) || []).length > 1).length;
  return { singleActionRate: single / N, multiFunctionRate: multiFn / N };
}

function maskStrategyDist(anns) {
  const d = {};
  for (const a of anns) {
    if (a.maskAnalysis?.functionalMask && a.maskAnalysis.maskStrategy) {
      d[a.maskAnalysis.maskStrategy] = (d[a.maskAnalysis.maskStrategy] || 0) + 1;
    }
  }
  return d;
}

function stripPerKeyLinks(cmp) {
  // committed-safe view: keep labels + support + rank, drop nothing sensitive (no links here anyway),
  // but drop the full perKey to keep the aggregate lean; keep tally + top keys (keys are enum labels).
  const out = {};
  for (const [name, c] of Object.entries(cmp.families)) {
    out[name] = { verdict: c.verdict, spearman: c.spearman, overlapAtK: c.overlapAtK, k: c.k, sharedKeys: c.sharedKeys, keysBefore: c.keysBefore, keysAfter: c.keysAfter, tally: c.tally, topBefore: c.topBefore, topAfter: c.topAfter };
  }
  return out;
}

function main() {
  for (const p of [REFINED_50, ANN_160, FREEZE]) if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }

  const freeze = JSON.parse(readFileSync(FREEZE, "utf8"));
  const { ok, freezeCheck } = enforceFreeze(freeze);
  if (!ok) { process.stdout.write(canonicalJson({ status: "GUIDE_FREEZE_BROKEN", freezeCheck }) + "\n"); process.exit(2); }

  const ann50 = JSON.parse(readFileSync(REFINED_50, "utf8")).annotations;
  const ann160 = JSON.parse(readFileSync(ANN_160, "utf8")).annotations;

  const disc50 = runDiscovery(ann50);
  const disc160 = runDiscovery(ann160);

  const cmp = compareStability({
    disc50, disc160,
    n50: ann50.length, n160: ann160.length,
    rates50: rates(ann50), rates160: rates(ann160),
  });

  // mask-strategy distribution stability (metric 10) — computed from annotations directly.
  const msd50 = maskStrategyDist(ann50);
  const msd160 = maskStrategyDist(ann160);

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  writeFileSync(join(OUT_PRIVATE, "discovery-160.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", n: ann160.length, discovery: disc160,
  }) + "\n");
  writeFileSync(join(OUT_PRIVATE, "stability.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", ...cmp, maskStrategy: { before: msd50, after: msd160 },
  }) + "\n");

  const verdicts = Object.fromEntries(Object.entries(cmp.families).map(([k, v]) => [k, v.verdict]));

  // INSTRUMENT-SHIFT DIAGNOSTIC (critical, must not be buried):
  // the 50 carry-over records are HAND-AUTHORED; the 110 new records use the CONSERVATIVE HEURISTIC
  // annotator, which detects fewer actions/functions. The single-action rate rising and multi-
  // function rate falling are therefore ATTRIBUTABLE TO THE INSTRUMENT, not to 糖糖's behavior
  // changing. Every SHIFTED family is confounded by this. Comparing 50-hand vs 160-mixed measures
  // annotator sensitivity as much as grammar drift. This is a reason to HOLD, not to conclude the
  // grammar collapsed — and a reason the 1051 stage needs ONE consistent instrument.
  const heuristicShare = ann160.filter((a) => a.annotationProvenance === "heuristic_200").length / ann160.length;
  const instrumentShift = {
    confounded: true,
    reason: "50 carry-over records are hand-authored; 110 new records use the conservative heuristic annotator (lower action/function detection).",
    heuristicShareOf160: Math.round(heuristicShare * 1000) / 1000,
    singleActionRateDelta: cmp.rateMetrics.singleActionRate.delta,
    multiFunctionRateDelta: cmp.rateMetrics.multiFunctionRate.delta,
    interpretation: "SHIFTED verdicts below are NOT evidence the grammar collapsed; they are dominated by annotator-sensitivity difference. Treat 200-stage stability as INCONCLUSIVE pending a single-instrument re-annotation.",
  };
  writeFileSync(join(OUT_COMMITTED, "summary.aggregate.json"), canonicalJson({
    visibility: "committed_safe", verbatimFree: true, stage: "P1-1C-200",
    guideFreezeVersion: freeze.guideFreezeVersion, freezeStatus: freezeCheck.status,
    n50: ann50.length, n160: ann160.length,
    instrumentShift,
    familyVerdicts: verdicts,
    families: stripPerKeyLinks(cmp),
    rateMetrics: cmp.rateMetrics,
    maskStrategyDistribution: { before: msd50, after: msd160 },
  }) + "\n");

  const tallyRoll = { STABLE: 0, SHIFTED: 0, COLLAPSED: 0, NEWLY_EMERGED: 0 };
  for (const c of Object.values(cmp.families)) for (const k of Object.keys(tallyRoll)) tallyRoll[k] += c.tally[k];

  process.stdout.write(canonicalJson({
    status: "STABILITY_200_READY",
    familyVerdicts: verdicts,
    perKeyRollup: tallyRoll,
    rateMetrics: cmp.rateMetrics,
    instrumentShiftConfounded: instrumentShift.confounded,
  }) + "\n");
}

main();

import test from "node:test";
import assert from "node:assert/strict";

import { select200, carveHoldout, coverageOf, TARGET_TOTAL, ORIGINAL_COUNT, NEW_COUNT, HOLDOUT_COUNT, DISCOVERY_COUNT } from "../lib/select-200.mjs";
import { computeGuideFingerprint, checkFreeze, captureFreeze, FREEZE_STATUS } from "../lib/guide-freeze.mjs";
import { falsifyHypotheses, FALSIFICATION_VERDICT } from "../lib/hypothesis-falsification.mjs";
import {
  characterPriors, triggerSensitivityMatrix, intraMessageMomentum,
  expectedPartnerOperations, performancePatterns, maskAnalysis, analyzeDimensions, cohortOf, COHORT,
} from "../lib/behavior-dimensions.mjs";
import {
  validateOnHoldout, e3Survival, runHoldoutValidation,
  HOLDOUT_VERDICT, E3_VERDICT, MIN_UNIQUE_SUPPORT,
} from "../lib/holdout-validation.mjs";
import { assessGuideChurn, decideFullScaleGate, GUIDE_CHURN_VERDICT, FULL_SCALE_GATE } from "../lib/full-scale-gate.mjs";
import { runDiscovery } from "../lib/grammar-discovery.mjs";

// ------------------------------------------------------------------------------------------------
// fixtures: minimal annotation records in the refined shape, tolerant to both hand + heuristic paths.
// ------------------------------------------------------------------------------------------------
let SEQ = 0;
function rec(over = {}) {
  SEQ += 1;
  return {
    linkId: `link${SEQ.toString(16).padStart(4, "0")}`,
    presentationId: `PB-${SEQ}`,
    annotationProvenance: "heuristic_200",
    evidenceGrade: "E1",
    behaviorActionSequence: [],
    interactionFunctions: { functions: [] },
    drivingForceCandidates: [],
    triggerSensitivity: { domain: "no_external_trigger", observedTriggerIntensity: "minimal", inferredInternalActivation: "low", confidence: "weak_inference", requiresCrossCorpusSupport: true },
    affect: { primarySurface: { value: "neutral", confidence: "weak_inference" }, coexistenceType: "unknown" },
    expectedReply: { immediateReply: { classes: ["unknown"], confidence: "unknown" } },
    relationshipManagement: { present: false, operations: [] },
    maskAnalysis: { functionalMask: false, revealWithoutMask: false },
    metaSelfMonitoring: { tags: [] },
    reviewFlags: [],
    l1_observable: {},
    stateContext: { domains: [] },
    ...over,
  };
}
const acts = (...names) => ({ behaviorActionSequence: names.map((action, i) => ({ action, order: i + 1 })) });

// ================================================================================================
// §2/§3 — selection + holdout (coverage items 1-4)
// A synthetic corpus of 400 records (with .hash/.text/.order); the first 50 are the pinned originals,
// declared via an originalKey of { presentationId, recordHash } — mirroring the frozen selection-key.
// ================================================================================================
const CORPUS = Array.from({ length: 400 }, (_, i) => ({ hash: `h${i.toString(16).padStart(4, "0")}`, text: `sample text number ${i} ok`, order: i }));
const ORIGINAL_KEY = CORPUS.slice(0, ORIGINAL_COUNT).map((r, i) => ({ presentationId: "PA-" + String(i + 1).padStart(3, "0"), recordHash: r.hash }));
const ORIGINAL_HASHES = new Set(ORIGINAL_KEY.map((k) => k.recordHash));

test("1. select200 is deterministic and yields exactly 200 unique records", () => {
  const a = select200(CORPUS, ORIGINAL_KEY);
  const b = select200(CORPUS, ORIGINAL_KEY);
  assert.equal(a.ok, true);
  assert.equal(a.records.length, TARGET_TOTAL);
  assert.deepEqual(a.records.map((r) => r.hash), b.records.map((r) => r.hash));
  assert.equal(new Set(a.records.map((r) => r.hash)).size, TARGET_TOTAL);
});

test("2. all ORIGINAL_COUNT pilot records are preserved in the 200", () => {
  const a = select200(CORPUS, ORIGINAL_KEY);
  const chosen = new Set(a.records.map((r) => r.hash));
  for (const h of ORIGINAL_HASHES) assert.ok(chosen.has(h), `original ${h} missing`);
  assert.equal(a.originalCount, ORIGINAL_COUNT);
});

test("3. holdout is 40, excludes originals, and leaves a 160 discovery set", () => {
  const a = select200(CORPUS, ORIGINAL_KEY);
  assert.equal(a.holdoutCount, HOLDOUT_COUNT);
  assert.equal(a.discoveryCount, DISCOVERY_COUNT);
  const holdout = new Set(a.holdoutHashes);
  for (const h of ORIGINAL_HASHES) assert.ok(!holdout.has(h), "an original landed in the holdout");
  // holdout ∩ discovery = ∅
  const disc = new Set(a.discoveryHashes);
  for (const h of holdout) assert.ok(!disc.has(h), "holdout leaked into discovery");
});

test("4. carveHoldout is deterministic and coverageOf spans buckets", () => {
  const a = select200(CORPUS, ORIGINAL_KEY);
  const c1 = carveHoldout(a.newRecords);
  const c2 = carveHoldout(a.newRecords);
  assert.deepEqual([...c1.holdoutHashes].sort(), [...c2.holdoutHashes].sort());
  assert.equal(c1.holdoutHashes.size, HOLDOUT_COUNT);
  const cov = coverageOf(a.records);
  assert.ok(cov && typeof cov === "object");
  assert.ok(Object.values(cov).some((v) => v > 0), "coverage empty");
});

// ================================================================================================
// §4 — guide freeze (coverage items 5-7)
// ================================================================================================
test("5. guide fingerprint is stable across recomputation", () => {
  assert.equal(computeGuideFingerprint().fingerprint, computeGuideFingerprint().fingerprint);
});

test("6. checkFreeze reports UNCHANGED for the live guide", () => {
  const fr = captureFreeze();
  assert.equal(checkFreeze(fr).status, FREEZE_STATUS.UNCHANGED);
});

test("7. enum removal BREAKS, enum addition is ADDITIVE, unlocalized mismatch fails safe", () => {
  const fr = captureFreeze();
  const cur = computeGuideFingerprint();
  const key = Object.keys(cur.vocabEnums)[0];

  const removed = JSON.parse(JSON.stringify(cur));
  removed.perArtifact["policy/behavior-vocab.json"] = "removed".padEnd(64, "0");
  removed.fingerprint = "x";
  removed.vocabEnums[key] = removed.vocabEnums[key].slice(0, -1);
  assert.equal(checkFreeze(fr, removed).status, FREEZE_STATUS.BROKEN);

  const added = JSON.parse(JSON.stringify(cur));
  added.perArtifact["policy/behavior-vocab.json"] = "added".padEnd(64, "0");
  added.fingerprint = "y";
  added.vocabEnums[key] = [...added.vocabEnums[key], "__brand_new_value__"];
  assert.equal(checkFreeze(fr, added).status, FREEZE_STATUS.ADDITIVE);

  const ghost = JSON.parse(JSON.stringify(cur));
  ghost.fingerprint = "unlocalized_mismatch";
  assert.equal(checkFreeze(fr, ghost).status, FREEZE_STATUS.BROKEN);
});

// ================================================================================================
// §9 — falsification (coverage items 8-10)
// ================================================================================================
function grammarSet(n, builder) {
  return Array.from({ length: n }, (_, i) => builder(i));
}
test("8. falsifyHypotheses returns a verdict for every H1..H11 with a valid rollup", () => {
  const ann = grammarSet(20, () => rec({ ...acts("reveal", "self_devalue") }));
  const disc = runDiscovery(ann);
  const { results, rollup } = falsifyHypotheses({ ann50: ann, disc50: disc, ann160: ann, disc160: disc });
  assert.equal(results.length, 11);
  const total = Object.values(rollup).reduce((a, b) => a + b, 0);
  assert.equal(total, 11);
  for (const r of results) assert.ok(Object.values(FALSIFICATION_VERDICT).includes(r.verdict));
});

test("9. a WEAKENED/REJECTED hypothesis carries a revised formulation; SURVIVES does not", () => {
  const ann = grammarSet(20, () => rec({ ...acts("reveal") })); // reveal with no mask → H3 low rate
  const disc = runDiscovery(ann);
  const { results } = falsifyHypotheses({ ann50: ann, disc50: disc, ann160: ann, disc160: disc });
  for (const r of results) {
    if (r.verdict === FALSIFICATION_VERDICT.WEAKENED || r.verdict === FALSIFICATION_VERDICT.REJECTED) {
      assert.ok(r.revisedFormulation, `${r.id} weakened/rejected without a revised formulation`);
    }
    if (r.verdict === FALSIFICATION_VERDICT.SURVIVES) {
      assert.equal(r.revisedFormulation, null);
    }
  }
});

test("10. INSUFFICIENT is used when eligible opportunities are below threshold", () => {
  const ann = grammarSet(4, () => rec()); // tiny, mostly no eligible antecedents
  const disc = runDiscovery(ann);
  const { results } = falsifyHypotheses({ ann50: ann, disc50: disc, ann160: ann, disc160: disc });
  assert.ok(results.some((r) => r.verdict === FALSIFICATION_VERDICT.INSUFFICIENT));
});

// ================================================================================================
// §10-16 — dimensions + cohort split (coverage items 11-15)
// ================================================================================================
test("11. character priors are conditioned by trigger domain, not just flat", () => {
  const ann = [
    rec({ triggerSensitivity: { domain: "public_evaluation" }, drivingForceCandidates: [{ candidate: "need_for_recognition" }] }),
    rec({ triggerSensitivity: { domain: "public_evaluation" }, drivingForceCandidates: [{ candidate: "need_for_recognition" }] }),
    rec({ triggerSensitivity: { domain: "no_external_trigger" }, drivingForceCandidates: [{ candidate: "need_for_play" }] }),
  ];
  const cp = characterPriors(ann);
  const pub = cp.conditionedByTriggerDomain.find((d) => d.triggerDomain === "public_evaluation");
  assert.ok(pub);
  assert.equal(pub.topForces[0].force, "need_for_recognition");
});

test("12. trigger matrix isolates the hair-trigger cell and its low-low counter-cell", () => {
  const ann = [
    rec({ triggerSensitivity: { observedTriggerIntensity: "low", inferredInternalActivation: "high" } }),
    rec({ triggerSensitivity: { observedTriggerIntensity: "low", inferredInternalActivation: "low" } }),
  ];
  const m = triggerSensitivityMatrix(ann);
  assert.equal(m.hairTriggerCount, 1);
  assert.equal(m.lowObservedLowInferredCount, 1);
  assert.equal(m.hairTriggerRateAmongJudgeable, 0.5);
});

test("13. momentum classifies escalation-bearing arcs among multi-beat records only", () => {
  const ann = [
    rec({ ...acts("accuse", "demand") }),          // escalating
    rec({ ...acts("reveal", "justify") }),          // repairing
    rec({ ...acts("reveal") }),                      // single-beat, excluded
  ];
  const mm = intraMessageMomentum(ann);
  assert.equal(mm.multiBeatRecords, 2);
  assert.equal(mm.escalationBearingRecords, 1);
  assert.equal(mm.escalationRateAmongMultiBeat, 0.5);
});

test("14. functional mask rate uses reveal-bearing records as its denominator", () => {
  const ann = [
    rec({ ...acts("reveal"), maskAnalysis: { functionalMask: true, maskStrategy: "self_mockery" } }),
    rec({ ...acts("reveal"), maskAnalysis: { functionalMask: false, revealWithoutMask: true } }),
    rec({ ...acts("tease") }), // no reveal → not in denominator
  ];
  const m = maskAnalysis(ann);
  assert.equal(m.revealBearingRecords, 2);
  assert.equal(m.functionalMaskRecords, 1);
  assert.equal(m.functionalMaskRateAmongReveals, 0.5);
});

test("15. every dimension carries a byCohort split; divergence sets a cohortNote", () => {
  const ann = [
    rec({ annotationProvenance: "carried_from_refined_50", ...acts("reveal"), maskAnalysis: { functionalMask: true, maskStrategy: "humor" } }),
    rec({ annotationProvenance: "carried_from_refined_50", ...acts("reveal"), maskAnalysis: { functionalMask: true, maskStrategy: "humor" } }),
    rec({ annotationProvenance: "heuristic_200", ...acts("reveal"), maskAnalysis: { functionalMask: false, revealWithoutMask: true } }),
    rec({ annotationProvenance: "heuristic_200", ...acts("reveal"), maskAnalysis: { functionalMask: false, revealWithoutMask: true } }),
  ];
  const full = analyzeDimensions(ann);
  assert.equal(cohortOf(ann[0]), COHORT.CARRIED);
  assert.equal(cohortOf(ann[2]), COHORT.HEURISTIC);
  const m = full.dimensions.maskAnalysis;
  assert.ok(m.byCohort.carried_50 && m.byCohort.heuristic_110);
  assert.equal(m.byCohort.carried_50.functionalMaskRateAmongReveals, 1);
  assert.equal(m.byCohort.heuristic_110.functionalMaskRateAmongReveals, 0);
  assert.ok(m.cohortNote, "expected a cohortNote for a >=0.25 divergence");
});

// ================================================================================================
// §17-18 — holdout validation + E3 survival (coverage items 16-18)
// ================================================================================================
const CAND_ALWAYS = {
  id: "T_always",
  antecedent: () => true,
  consequent: (a) => a.__hit === true,
  competing: () => false,
};

test("16. holdout CONFIRMED vs REFUTED verdicts follow support/counterexample density", () => {
  const confirm = Array.from({ length: 10 }, () => rec({ __hit: true }));
  const refute = Array.from({ length: 10 }, () => rec({ __hit: false }));
  assert.equal(validateOnHoldout(CAND_ALWAYS, confirm).verdict, HOLDOUT_VERDICT.CONFIRMED);
  assert.equal(validateOnHoldout(CAND_ALWAYS, refute).verdict, HOLDOUT_VERDICT.REFUTED);
});

test("17. holdout ABSENT when the antecedent fires below the eligibility floor", () => {
  const cand = { id: "T_rare", antecedent: (a) => a.__rare === true, consequent: () => true, competing: () => false };
  const holdout = [rec({ __rare: true }), rec({ __rare: false }), rec({ __rare: false })];
  assert.equal(validateOnHoldout(cand, holdout).verdict, HOLDOUT_VERDICT.ABSENT);
});

test("18. E3 survives only with >=8 unique support, >=3 opportunities, holdout confirmed, not prior-dominated", () => {
  // strong, non-weak support records (E2, explicit confidence) so notPriorDominated holds
  const strong = Array.from({ length: MIN_UNIQUE_SUPPORT }, () => rec({
    __hit: true, evidenceGrade: "E2",
    triggerSensitivity: { domain: "exclusivity_threat", confidence: "explicit", requiresCrossCorpusSupport: false },
    affect: { primarySurface: { value: "fear", confidence: "explicit" } },
  }));
  const disc160 = strong;
  const holdoutRes = { verdict: HOLDOUT_VERDICT.CONFIRMED };
  const pass = e3Survival(CAND_ALWAYS, null, holdoutRes, disc160);
  assert.equal(pass.verdict, E3_VERDICT.SURVIVES);
  assert.deepEqual(pass.failedClauses, []);

  // drop below unique-support floor → NOT_MET naming the clause
  const few = strong.slice(0, 3);
  const fail = e3Survival(CAND_ALWAYS, null, holdoutRes, few);
  assert.equal(fail.verdict, E3_VERDICT.NOT_MET);
  assert.ok(fail.failedClauses.includes("hasMinUniqueSupport"));
});

test("19. anti-peeking: holdout scoring refuses without a pre-computed frozen grammar", () => {
  const r = runHoldoutValidation({ candidates: [CAND_ALWAYS], discovery160: [], holdout: [], frozenGrammar: null });
  assert.equal(r.status, "HOLDOUT_NOT_AUTHORIZED");
});

// ================================================================================================
// §19-20 — guide churn + 1051 gate (coverage items 20)
// ================================================================================================
test("20. guide stays STABLE on legit categories but the gate HOLDS under an instrument confound", () => {
  // legitimate no_external_trigger + a few real domains; escape-hatch (other/indeterminate) under budget
  const ann = [
    ...Array.from({ length: 80 }, () => rec({ triggerSensitivity: { domain: "no_external_trigger", confidence: "explicit" }, affect: { primarySurface: { confidence: "explicit" } } })),
    ...Array.from({ length: 10 }, () => rec({ triggerSensitivity: { domain: "other" } })),
  ];
  const churn = assessGuideChurn(ann, { freezeBroken: false });
  assert.equal(churn.verdict, GUIDE_CHURN_VERDICT.STABLE);
  assert.ok(churn.fallbackRate <= 0.2);

  const gate = decideFullScaleGate({
    guideChurn: churn,
    instrumentShift: { confounded: true, heuristicShareOf160: 0.69, singleActionRateDelta: 0.3, multiFunctionRateDelta: -0.2 },
    e3Rollup: { E3_CANDIDATE_SURVIVES: 2, E3_NOT_MET: 5 },
    survivors: ["GC4", "GC5"],
    falsificationRollup: { SURVIVES: 5, WEAKENED: 2, REJECTED: 3, INSUFFICIENT: 1 },
  });
  assert.equal(gate.decision, FULL_SCALE_GATE.HOLD);
  assert.ok(gate.blockers.some((b) => /INCONCLUSIVE|instrument/.test(b)));
  assert.ok(gate.remediation.length > 0);
});

test("21. broken freeze forces GUIDE_NOT_READY_FOR_1051 regardless of fallback rate", () => {
  const churn = assessGuideChurn([rec()], { freezeBroken: true });
  assert.equal(churn.verdict, GUIDE_CHURN_VERDICT.NOT_READY);
  assert.ok(churn.reasons.some((r) => /freeze/.test(r)));
});

test("22. gate PROCEEDS only when guide stable, no confound, and an E3 survivor exists", () => {
  const churn = assessGuideChurn([rec({ triggerSensitivity: { domain: "no_external_trigger", confidence: "explicit" }, affect: { primarySurface: { confidence: "explicit" } } })], { freezeBroken: false });
  const gate = decideFullScaleGate({
    guideChurn: churn,
    instrumentShift: { confounded: false },
    e3Rollup: { E3_CANDIDATE_SURVIVES: 1, E3_NOT_MET: 6 },
    survivors: ["GC5"],
    falsificationRollup: { SURVIVES: 6, WEAKENED: 1, REJECTED: 0, INSUFFICIENT: 4 },
  });
  assert.equal(gate.decision, FULL_SCALE_GATE.PROCEED);
  assert.equal(gate.blockers.length, 0);
});

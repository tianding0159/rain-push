// Tests for the REVISED Round-A annotation validator (revised-annotation.mjs) + descriptive stats /
// review-priority (round-a-stats.mjs). Every cross-field rule in REVISED_RULE_CODES has at least one
// test that fails if the rule is removed; the stats/priority tests pin the aggregation contract.
//
// Fixtures are SYNTHETIC and text-free (the schema makes `text` optional). We build a schema-valid
// base and mutate one field per test, so a failing assertion isolates exactly one rule.

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRevisedAnnotation,
  validateRevisedBatch,
  REVISED_RULE_CODES,
  restsOnPriorAlone,
  hasWrittenEvidence,
} from "../lib/revised-annotation.mjs";
import {
  reviewPriorityFor,
  computeReviewPriority,
  computeRoundAStats,
} from "../lib/round-a-stats.mjs";

// A schema-valid, rule-clean revised annotation. Kept deliberately minimal but legal so each test
// mutates exactly one thing. Mirrors the validSkeleton in gen-revised-round-a.mjs, plus one real
// driving-force candidate with proper prior/record separation and whatWouldChangeMyMind.
function baseAnnotation() {
  return {
    recordFormatVersion: 2,
    presentationId: "PA-TEST",
    annotator: "test",
    round: "A",
    modelSuggested: true,
    annotationNature: "model_assisted_research_annotation",
    l1_observable: { observableActs: ["(x)"], grammaticalForm: ["陈述句"], target: "partner" },
    behaviorActionSequence: [
      { action: "reveal", order: 1, confidence: "strongly_supported", textualEvidence: "ev" },
    ],
    interactionFunctions: { functions: [
      { function: "reduce_distance", role: "primary", confidence: "weak_inference", textualEvidence: "ev", contextDependency: "high" },
    ] },
    affect: { primarySurface: { value: "affection", confidence: "weak_inference" }, coexistenceType: "unknown" },
    drivingForceCandidates: [
      {
        candidate: "need_for_closeness",
        confidence: "weak_inference",
        evidence: "ev",
        alternativeExplanation: "alt",
        whatWouldChangeMyMind: "if X",
        contextDependency: "high",
        inferredFrom: ["explicit_text", "interaction_function"],
        priorContribution: "none",
        recordSpecificSupport: "weak",
      },
    ],
    triggerSensitivity: {
      domain: "other",
      observedTriggerIntensity: "unknown",
      inferredInternalActivation: "unknown",
      thresholdInterpretation: "unknown",
      confidence: "unknown",
      requiresCrossCorpusSupport: false,
    },
    relationshipManagement: { present: false, operations: [] },
    metaSelfMonitoring: { tags: [] },
    stateContext: { domains: [] },
    expectedReply: {
      immediateReply: { classes: ["reassure"], confidence: "weak_inference" },
      relationshipReply: { classes: [], confidence: "unknown" },
      longerTermReply: { classes: [], confidence: "unknown" },
      likelyUnsatisfyingReplyClasses: [],
    },
    evidenceGrade: "E1",
    reviewFlags: [],
    failureRiskNotes: [
      { id: "missing_context", note: "" },
      { id: "maybe_joke", note: "" },
      { id: "maybe_public_performance", note: "" },
      { id: "maybe_quoting", note: "" },
      { id: "maybe_plot_event", note: "" },
      { id: "alternative_reading", note: "" },
    ],
  };
}

function ruleCodes(res) {
  return res.ruleErrors.concat(res.ruleWarnings).map((r) => r.code);
}

// ---------------------------------------------------------------------------
// 0. The base fixture itself must be valid — otherwise every mutation test is
//    meaningless (a mutation could "pass" only because the base already failed).
// ---------------------------------------------------------------------------
test("base fixture is schema-valid and rule-clean", () => {
  const res = validateRevisedAnnotation(baseAnnotation());
  assert.equal(res.valid, true, JSON.stringify(res.schemaErrors.concat(res.ruleErrors)));
  assert.equal(res.ruleErrors.length, 0);
  assert.equal(res.ruleWarnings.length, 0);
});

// ---------------------------------------------------------------------------
// 1. Multi-function role caps (§3)
// ---------------------------------------------------------------------------
test("FUNCTION_PRIMARY_CAP: two primary functions is an error", () => {
  const a = baseAnnotation();
  a.interactionFunctions.functions = [
    { function: "reduce_distance", role: "primary", confidence: "weak_inference", textualEvidence: "e" },
    { function: "obtain_attention", role: "primary", confidence: "weak_inference", textualEvidence: "e" },
  ];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.FUNCTION_PRIMARY_CAP));
});

test("FUNCTION_SECONDARY_CAP: three secondary functions is an error", () => {
  const a = baseAnnotation();
  a.interactionFunctions.functions = [
    { function: "reduce_distance", role: "primary", confidence: "weak_inference", textualEvidence: "e" },
    { function: "obtain_attention", role: "secondary", confidence: "weak_inference", textualEvidence: "e" },
    { function: "solicit_validation", role: "secondary", confidence: "weak_inference", textualEvidence: "e" },
    { function: "test_availability", role: "secondary", confidence: "weak_inference", textualEvidence: "e" },
  ];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.FUNCTION_SECONDARY_CAP));
});

test("FUNCTION_SUPPORTING_CAP: four supporting functions is an error", () => {
  const a = baseAnnotation();
  a.interactionFunctions.functions = [
    { function: "reduce_distance", role: "primary", confidence: "weak_inference", textualEvidence: "e" },
    { function: "obtain_attention", role: "supporting", confidence: "weak_inference", textualEvidence: "e" },
    { function: "solicit_validation", role: "supporting", confidence: "weak_inference", textualEvidence: "e" },
    { function: "test_availability", role: "supporting", confidence: "weak_inference", textualEvidence: "e" },
    { function: "provoke_pursuit", role: "supporting", confidence: "weak_inference", textualEvidence: "e" },
  ];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.FUNCTION_SUPPORTING_CAP));
});

// ---------------------------------------------------------------------------
// 2. Action sequence: length cap + contiguous 1..N ordering (§2)
// ---------------------------------------------------------------------------
test("ACTION_SEQUENCE_TOO_LONG: more than 8 actions is an error", () => {
  const a = baseAnnotation();
  a.behaviorActionSequence = Array.from({ length: 9 }, (_, i) => ({
    action: "reveal", order: i + 1, confidence: "weak_inference", textualEvidence: "e",
  }));
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.ACTION_SEQUENCE_TOO_LONG));
});

test("ACTION_SEQUENCE_NONCONTIGUOUS: orders that are not a 1..N permutation error", () => {
  const a = baseAnnotation();
  a.behaviorActionSequence = [
    { action: "reveal", order: 1, confidence: "weak_inference", textualEvidence: "e" },
    { action: "tease", order: 3, confidence: "weak_inference", textualEvidence: "e" },
  ];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.ACTION_SEQUENCE_NONCONTIGUOUS));
});

// ---------------------------------------------------------------------------
// 3. Driving-force count + per-candidate discipline (§5/§6/§9/§16)
// ---------------------------------------------------------------------------
test("DRIVING_FORCE_TOO_MANY: more than 3 candidates is an error", () => {
  const a = baseAnnotation();
  const mk = (c) => ({
    candidate: c, confidence: "weak_inference", evidence: "e", alternativeExplanation: "a",
    whatWouldChangeMyMind: "x", contextDependency: "high",
    inferredFrom: ["explicit_text"], priorContribution: "none", recordSpecificSupport: "weak",
  });
  a.drivingForceCandidates = [
    mk("need_for_closeness"), mk("need_for_attention"), mk("need_for_control"), mk("need_for_recognition"),
  ];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.DRIVING_FORCE_TOO_MANY));
});

test("DRIVING_FORCE_NO_CHANGEMYMIND: missing whatWouldChangeMyMind is an error", () => {
  const a = baseAnnotation();
  a.drivingForceCandidates[0].whatWouldChangeMyMind = "";
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.DRIVING_FORCE_NO_CHANGEMYMIND));
});

test("DRIVING_FORCE_FROM_AFFECT_ONLY: affect_leak as sole source is an error (§9)", () => {
  const a = baseAnnotation();
  a.drivingForceCandidates[0].inferredFrom = ["affect_leak"];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.DRIVING_FORCE_FROM_AFFECT_ONLY));
});

test("CHARACTER_PRIOR_ALONE_EXPLICIT: explicit with no record support is an error (§6)", () => {
  const a = baseAnnotation();
  a.modelSuggested = false; // isolate this rule from MODEL_DRIVING_FORCE_EXPLICIT
  a.drivingForceCandidates[0].confidence = "explicit";
  a.drivingForceCandidates[0].recordSpecificSupport = "none";
  a.drivingForceCandidates[0].priorContribution = "strong";
  a.drivingForceCandidates[0].inferredFrom = ["character_prior", "explicit_text"];
  a.reviewFlags = ["character_prior_used"];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.CHARACTER_PRIOR_ALONE_EXPLICIT));
});

test("MODEL_DRIVING_FORCE_EXPLICIT: modelSuggested candidate at explicit is an error (§16)", () => {
  const a = baseAnnotation();
  a.modelSuggested = true;
  a.drivingForceCandidates[0].confidence = "explicit";
  a.drivingForceCandidates[0].recordSpecificSupport = "strong"; // avoid CHARACTER_PRIOR_ALONE_EXPLICIT
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.MODEL_DRIVING_FORCE_EXPLICIT));
});

test("PRIOR_ONLY_SUPPORT: strong confidence resting on prior alone warns (§6)", () => {
  const a = baseAnnotation();
  a.modelSuggested = false; // so strongly_supported is allowed for a non-model candidate
  a.drivingForceCandidates[0].confidence = "strongly_supported";
  a.drivingForceCandidates[0].recordSpecificSupport = "none";
  a.drivingForceCandidates[0].priorContribution = "moderate";
  a.drivingForceCandidates[0].inferredFrom = ["character_prior", "explicit_text"];
  a.reviewFlags = ["character_prior_used"];
  const res = validateRevisedAnnotation(a);
  // warning-only → still schema/rule VALID
  assert.equal(res.valid, true, JSON.stringify(res.ruleErrors));
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.PRIOR_ONLY_SUPPORT));
});

test("CHARACTER_PRIOR_NOT_FLAGGED: using character_prior without the reviewFlag warns (§17)", () => {
  const a = baseAnnotation();
  a.drivingForceCandidates[0].inferredFrom = ["explicit_text", "character_prior"];
  a.reviewFlags = []; // deliberately omit character_prior_used
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, true, JSON.stringify(res.ruleErrors));
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.CHARACTER_PRIOR_NOT_FLAGGED));
});

// ---------------------------------------------------------------------------
// 4. Trigger sensitivity (§7/§8/§18)
// ---------------------------------------------------------------------------
test("TRIGGER_LOW_WITHOUT_PRIOR: characteristically_low needs requiresCrossCorpusSupport (§8)", () => {
  const a = baseAnnotation();
  a.triggerSensitivity.thresholdInterpretation = "characteristically_low";
  a.triggerSensitivity.requiresCrossCorpusSupport = false;
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.TRIGGER_LOW_WITHOUT_PRIOR));
});

test("LOW_TRIGGER_HIGH_ACTIVATION_NOT_FLAGGED: low trigger + high activation must be flagged (§7)", () => {
  const a = baseAnnotation();
  a.triggerSensitivity.observedTriggerIntensity = "low";
  a.triggerSensitivity.inferredInternalActivation = "high";
  a.reviewFlags = []; // omit the flag
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, true, JSON.stringify(res.ruleErrors)); // warning-only
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.LOW_TRIGGER_HIGH_ACTIVATION_NOT_FLAGGED));
});

test("low trigger + high activation WITH the flag produces no warning", () => {
  const a = baseAnnotation();
  a.triggerSensitivity.observedTriggerIntensity = "low";
  a.triggerSensitivity.inferredInternalActivation = "high";
  a.reviewFlags = ["low_trigger_high_activation_candidate"];
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, true);
  assert.ok(!ruleCodes(res).includes(REVISED_RULE_CODES.LOW_TRIGGER_HIGH_ACTIVATION_NOT_FLAGGED));
});

// ---------------------------------------------------------------------------
// 5. Single-record grade discipline (§16)
// ---------------------------------------------------------------------------
test("SINGLE_RECORD_E3_E4: E3 on a single record is an error", () => {
  const a = baseAnnotation();
  a.evidenceGrade = "E3";
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  // schema enumFrom roundAGrades also rejects E3; assert the RULE fires specifically.
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.SINGLE_RECORD_E3_E4));
});

test("E2_WITHOUT_EVIDENCE: E2 with no written evidence anywhere is an error", () => {
  const a = baseAnnotation();
  a.evidenceGrade = "E2";
  // strip every textual evidence string
  a.behaviorActionSequence.forEach((x) => { x.textualEvidence = ""; });
  a.interactionFunctions.functions.forEach((x) => { x.textualEvidence = ""; });
  a.drivingForceCandidates.forEach((x) => { x.evidence = ""; });
  a.triggerSensitivity.evidence = "";
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.E2_WITHOUT_EVIDENCE));
});

// ---------------------------------------------------------------------------
// 6. Relationship management never defaults true (§12)
// ---------------------------------------------------------------------------
test("REL_MGMT_ABSENT_WITH_OPS: operations listed while present!=true is an error", () => {
  const a = baseAnnotation();
  a.relationshipManagement = { present: false, operations: ["test_bond"] };
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, false);
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.REL_MGMT_ABSENT_WITH_OPS));
});

test("REL_MGMT_PRESENT_NO_OPS: present true with no operations warns", () => {
  const a = baseAnnotation();
  a.relationshipManagement = { present: true, operations: [], confidence: "weak_inference", evidence: "e" };
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, true, JSON.stringify(res.ruleErrors)); // warning-only
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.REL_MGMT_PRESENT_NO_OPS));
});

// ---------------------------------------------------------------------------
// 7. Meta self-monitoring not defaulted (§13)
// ---------------------------------------------------------------------------
test("META_TAG_WITHOUT_EVIDENCE: a substantive tag without evidence warns", () => {
  const a = baseAnnotation();
  a.metaSelfMonitoring = { tags: ["self_observation"] }; // no evidence
  const res = validateRevisedAnnotation(a);
  assert.equal(res.valid, true, JSON.stringify(res.ruleErrors)); // warning-only
  assert.ok(ruleCodes(res).includes(REVISED_RULE_CODES.META_TAG_WITHOUT_EVIDENCE));
});

// ---------------------------------------------------------------------------
// 8. Exported helpers
// ---------------------------------------------------------------------------
test("restsOnPriorAlone: true only when recordSpecificSupport=none and prior contributes", () => {
  assert.equal(restsOnPriorAlone({ recordSpecificSupport: "none", priorContribution: "moderate" }), true);
  assert.equal(restsOnPriorAlone({ recordSpecificSupport: "weak", priorContribution: "moderate" }), false);
  assert.equal(restsOnPriorAlone({ recordSpecificSupport: "none", priorContribution: "none" }), false);
});

test("hasWrittenEvidence: detects evidence in any of action/function/df/trigger, false when all empty", () => {
  const a = baseAnnotation();
  assert.equal(hasWrittenEvidence(a), true);
  a.behaviorActionSequence.forEach((x) => { x.textualEvidence = ""; });
  a.interactionFunctions.functions.forEach((x) => { x.textualEvidence = ""; });
  a.drivingForceCandidates.forEach((x) => { x.evidence = ""; });
  a.triggerSensitivity.evidence = "";
  assert.equal(hasWrittenEvidence(a), false);
});

// ---------------------------------------------------------------------------
// 9. Review priority bucketing (§17) — P1 dominates P2; no flags → P3
// ---------------------------------------------------------------------------
test("reviewPriorityFor: a P1 flag wins even when a P2 flag is also present", () => {
  const a = baseAnnotation();
  a.reviewFlags = ["action_sequence_uncertain", "character_prior_used"]; // P2 + P1
  const { priority, reasons } = reviewPriorityFor(a);
  assert.equal(priority, "P1");
  assert.deepEqual(reasons, ["character_prior_used"]);
});

test("reviewPriorityFor: only a P2 flag → P2; no flags → P3", () => {
  const p2 = baseAnnotation(); p2.reviewFlags = ["action_sequence_uncertain"];
  assert.equal(reviewPriorityFor(p2).priority, "P2");
  const p3 = baseAnnotation(); p3.reviewFlags = [];
  assert.equal(reviewPriorityFor(p3).priority, "P3");
});

test("computeReviewPriority: buckets + counts are consistent and sorted", () => {
  const a1 = baseAnnotation(); a1.presentationId = "PA-002"; a1.reviewFlags = ["character_prior_used"];
  const a2 = baseAnnotation(); a2.presentationId = "PA-001"; a2.reviewFlags = ["character_prior_used"];
  const a3 = baseAnnotation(); a3.presentationId = "PA-003"; a3.reviewFlags = ["action_sequence_uncertain"];
  const a4 = baseAnnotation(); a4.presentationId = "PA-004"; a4.reviewFlags = [];
  const pr = computeReviewPriority([a1, a2, a3, a4]);
  assert.deepEqual(pr.counts, { P1: 2, P2: 1, P3: 1 });
  assert.deepEqual(pr.P1.map((x) => x.presentationId), ["PA-001", "PA-002"]); // sorted
});

// ---------------------------------------------------------------------------
// 10. Descriptive stats (§15/§16) — provisional base rate + strong-stat gate
// ---------------------------------------------------------------------------
test("computeRoundAStats: base rate is provisional and n matches input", () => {
  const stats = computeRoundAStats([baseAnnotation(), baseAnnotation()]);
  assert.equal(stats.n, 2);
  assert.equal(stats.baseRateStatus, "provisional");
});

test("computeRoundAStats: weak_inference driving force excluded from strong frequency (§16 gate)", () => {
  const a = baseAnnotation(); // sole driving force is weak_inference
  const stats = computeRoundAStats([a]);
  assert.equal(stats.drivingForceFrequency.need_for_closeness, 1);
  assert.equal(stats.drivingForceStrongFrequency.need_for_closeness, undefined);
});

test("computeRoundAStats: prior-only strong candidate is excluded from strong frequency", () => {
  const a = baseAnnotation();
  a.modelSuggested = false;
  a.drivingForceCandidates[0].confidence = "strongly_supported";
  a.drivingForceCandidates[0].recordSpecificSupport = "none";
  a.drivingForceCandidates[0].priorContribution = "moderate";
  a.drivingForceCandidates[0].inferredFrom = ["character_prior", "explicit_text"];
  a.reviewFlags = ["character_prior_used"];
  const stats = computeRoundAStats([a]);
  // counted in overall frequency but NOT in the strong tally (restsOnPriorAlone gate)
  assert.equal(stats.drivingForceFrequency.need_for_closeness, 1);
  assert.equal(stats.drivingForceStrongFrequency.need_for_closeness, undefined);
});

test("computeRoundAStats: lowTriggerHighActivation candidates are collected by id", () => {
  const a = baseAnnotation();
  a.presentationId = "PA-042";
  a.triggerSensitivity.observedTriggerIntensity = "low";
  a.triggerSensitivity.inferredInternalActivation = "high";
  a.reviewFlags = ["low_trigger_high_activation_candidate"];
  const stats = computeRoundAStats([a]);
  assert.deepEqual(stats.lowTriggerHighActivationCandidates, ["PA-042"]);
});

// ---------------------------------------------------------------------------
// 11. Batch validation contract
// ---------------------------------------------------------------------------
test("validateRevisedBatch: reports valid/invalid counts and per-record ids", () => {
  const good = baseAnnotation(); good.presentationId = "PA-OK";
  const bad = baseAnnotation(); bad.presentationId = "PA-BAD";
  bad.evidenceGrade = "E2";
  bad.behaviorActionSequence.forEach((x) => { x.textualEvidence = ""; });
  bad.interactionFunctions.functions.forEach((x) => { x.textualEvidence = ""; });
  bad.drivingForceCandidates.forEach((x) => { x.evidence = ""; });
  const batch = validateRevisedBatch([good, bad]);
  assert.equal(batch.total, 2);
  assert.equal(batch.valid, 1);
  assert.equal(batch.invalid, 1);
  const badResult = batch.results.find((r) => r.presentationId === "PA-BAD");
  assert.equal(badResult.valid, false);
});

// Descriptive statistics + review prioritization for the revised Round-A pass (directive §20/§17).
//
// Consumes a batch of revised annotations and emits DESCRIPTIVE-ONLY aggregates: frequencies, rates,
// and distributions. It never produces E3/E4, never asserts a proven regularity, and marks every base
// rate `provisional`. Crucially the output is VERBATIM-FREE — it contains counts and labels only, never
// the utterance text or per-record evidence strings — so the summary is safe to commit while the
// annotations themselves stay in the gitignored private instance.
//
// Strong-stat gate (§16): `weak_inference` and `unknown` inferences are counted for visibility but
// excluded from the *strong* tallies, so weak inferences cannot masquerade as findings.

import { STRONG_STAT_CONFIDENCES, restsOnPriorAlone } from "./revised-annotation.mjs";

function inc(map, key) {
  map[key] = (map[key] || 0) + 1;
}
// Return a plain object sorted by key for deterministic, canonical output.
function sortedCounts(map) {
  const out = {};
  for (const k of Object.keys(map).sort()) out[k] = map[k];
  return out;
}

// P1/P2/P3 priority for one record (directive §17 tiers).
const P1_FLAGS = [
  "multi_function_overlap",
  "driving_force_uncertain",
  "persona_surface_uncertain",
  "character_prior_used",
  "low_trigger_high_activation_candidate",
  "adult_context_ambiguous",
  "dark_context_ambiguous",
  "drug_context_ambiguous",
];
const P2_FLAGS = ["expected_reply_uncertain", "action_sequence_uncertain"];

export function reviewPriorityFor(ann) {
  const flags = ann.reviewFlags || [];
  const p1 = flags.filter((f) => P1_FLAGS.includes(f));
  if (p1.length > 0) return { priority: "P1", reasons: p1.slice().sort() };
  const p2 = flags.filter((f) => P2_FLAGS.includes(f));
  if (p2.length > 0) return { priority: "P2", reasons: p2.slice().sort() };
  return { priority: "P3", reasons: [] };
}

export function computeRoundAStats(annotations) {
  const n = annotations.length;
  const actionFreq = {};
  const actionSeqLengths = [];
  const functionFreq = {};
  const functionRoleFreq = { primary: 0, secondary: 0, supporting: 0 };
  const drivingForceFreq = {};
  const drivingForceStrongFreq = {}; // strongly_supported/explicit only
  const priorContribDist = {};
  const recordSupportDist = {};
  const triggerDomainDist = {};
  const thresholdDist = {};
  const coexistenceDist = {};
  const immediateReplyFreq = {};
  const relationshipReplyFreq = {};
  const longerTermReplyFreq = {};
  const unsatisfyingReplyFreq = {};
  const reviewFlagFreq = {};
  const gradeDist = {};
  const metaTagFreq = {};
  const relOpsFreq = {};
  const stateDomainFreq = {};

  let multiFunctionRecords = 0;
  let relMgmtRecords = 0;
  let selfMonitorRecords = 0;
  let unknownInferences = 0;
  let totalInferences = 0;
  const lowTriggerHighActivation = [];

  for (const ann of annotations) {
    // actions
    const seq = ann.behaviorActionSequence || [];
    actionSeqLengths.push(seq.length);
    for (const a of seq) inc(actionFreq, a.action);

    // functions
    const fns = ann.interactionFunctions?.functions || [];
    for (const f of fns) {
      inc(functionFreq, f.function);
      if (f.role in functionRoleFreq) functionRoleFreq[f.role]++;
    }
    if (fns.length > 1) multiFunctionRecords++;

    // affect coexistence
    if (ann.affect?.coexistenceType) inc(coexistenceDist, ann.affect.coexistenceType);

    // driving forces
    for (const c of ann.drivingForceCandidates || []) {
      inc(drivingForceFreq, c.candidate);
      totalInferences++;
      if (c.confidence === "unknown") unknownInferences++;
      if (STRONG_STAT_CONFIDENCES.includes(c.confidence) && !restsOnPriorAlone(c)) inc(drivingForceStrongFreq, c.candidate);
      if (c.priorContribution) inc(priorContribDist, c.priorContribution);
      if (c.recordSpecificSupport) inc(recordSupportDist, c.recordSpecificSupport);
    }

    // trigger
    const ts = ann.triggerSensitivity;
    if (ts?.domain) inc(triggerDomainDist, ts.domain);
    if (ts?.thresholdInterpretation) inc(thresholdDist, ts.thresholdInterpretation);
    if (ts && ["minimal", "low"].includes(ts.observedTriggerIntensity) && ts.inferredInternalActivation === "high") {
      lowTriggerHighActivation.push(ann.presentationId);
    }

    // relationship management
    const rm = ann.relationshipManagement;
    if (rm?.present === true) {
      relMgmtRecords++;
      for (const op of rm.operations || []) inc(relOpsFreq, op);
    }

    // meta self-monitoring
    const metaTags = (ann.metaSelfMonitoring?.tags || []).filter((t) => t !== "none" && t !== "unknown");
    if (metaTags.length > 0) selfMonitorRecords++;
    for (const t of metaTags) inc(metaTagFreq, t);

    // state context
    for (const d of ann.stateContext?.domains || []) if (d !== "none") inc(stateDomainFreq, d);

    // expected reply layers
    for (const c of ann.expectedReply?.immediateReply?.classes || []) inc(immediateReplyFreq, c);
    for (const c of ann.expectedReply?.relationshipReply?.classes || []) inc(relationshipReplyFreq, c);
    for (const c of ann.expectedReply?.longerTermReply?.classes || []) inc(longerTermReplyFreq, c);
    for (const c of ann.expectedReply?.likelyUnsatisfyingReplyClasses || []) inc(unsatisfyingReplyFreq, c);

    // review flags + grade
    for (const f of ann.reviewFlags || []) inc(reviewFlagFreq, f);
    if (ann.evidenceGrade) inc(gradeDist, ann.evidenceGrade);
  }

  const avgSeqLen = actionSeqLengths.length ? actionSeqLengths.reduce((a, b) => a + b, 0) / actionSeqLengths.length : 0;

  return {
    n,
    baseRateStatus: "provisional", // §15 — never a frozen production constant at pilot scale
    actionFrequency: sortedCounts(actionFreq),
    actionSequenceLength: {
      min: actionSeqLengths.length ? Math.min(...actionSeqLengths) : 0,
      max: actionSeqLengths.length ? Math.max(...actionSeqLengths) : 0,
      mean: Number(avgSeqLen.toFixed(3)),
    },
    multiFunctionRate: n ? Number((multiFunctionRecords / n).toFixed(3)) : 0,
    interactionFunctionFrequency: sortedCounts(functionFreq),
    interactionFunctionRoleFrequency: sortedCounts(functionRoleFreq),
    drivingForceFrequency: sortedCounts(drivingForceFreq),
    drivingForceStrongFrequency: sortedCounts(drivingForceStrongFreq),
    priorContributionDistribution: sortedCounts(priorContribDist),
    recordSpecificSupportDistribution: sortedCounts(recordSupportDist),
    triggerDomainDistribution: sortedCounts(triggerDomainDist),
    thresholdInterpretationDistribution: sortedCounts(thresholdDist),
    lowTriggerHighActivationCandidates: lowTriggerHighActivation.slice().sort(),
    relationshipManagementRate: n ? Number((relMgmtRecords / n).toFixed(3)) : 0,
    relationshipOperationFrequency: sortedCounts(relOpsFreq),
    selfMonitoringRate: n ? Number((selfMonitorRecords / n).toFixed(3)) : 0,
    metaTagFrequency: sortedCounts(metaTagFreq),
    stateDomainFrequency: sortedCounts(stateDomainFreq),
    affectCoexistenceDistribution: sortedCounts(coexistenceDist),
    expectedReply: {
      immediate: sortedCounts(immediateReplyFreq),
      relationship: sortedCounts(relationshipReplyFreq),
      longerTerm: sortedCounts(longerTermReplyFreq),
      likelyUnsatisfying: sortedCounts(unsatisfyingReplyFreq),
    },
    reviewFlagFrequency: sortedCounts(reviewFlagFreq),
    evidenceGradeDistribution: sortedCounts(gradeDist),
    unknownRate: totalInferences ? Number((unknownInferences / totalInferences).toFixed(3)) : 0,
  };
}

// Rank records into P1/P2/P3 buckets (deterministic order by presentationId within a bucket).
export function computeReviewPriority(annotations) {
  const buckets = { P1: [], P2: [], P3: [] };
  for (const ann of annotations) {
    const { priority, reasons } = reviewPriorityFor(ann);
    buckets[priority].push({ presentationId: ann.presentationId, reasons });
  }
  for (const k of Object.keys(buckets)) buckets[k].sort((a, b) => a.presentationId.localeCompare(b.presentationId));
  return {
    P1: buckets.P1,
    P2: buckets.P2,
    P3: buckets.P3,
    counts: { P1: buckets.P1.length, P2: buckets.P2.length, P3: buckets.P3.length },
  };
}

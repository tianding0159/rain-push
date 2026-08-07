// P1-1E — validate a set of Instrument A annotations against the identity manifest, and fingerprint
// them. "Validation" here = the annotations live inside the frozen protocol's decision space: every
// enum-bearing field draws only from the manifest's rule vocabularies, confidences use the frozen
// confidence vocabulary, and a Round-A pass assigns only Round-A grades. This proves the original 50
// (and later the new 150) are the SAME instrument, without re-annotating them.

import { createHash } from "node:crypto";
import { ruleVocabularies } from "./instrument-a-manifest.mjs";

function sha(s) { return createHash("sha256").update(s).digest("hex"); }

const actionsOf = (r) => (r.behaviorActionSequence || []).map((s) => s.action).filter(Boolean);
const actionConfs = (r) => (r.behaviorActionSequence || []).map((s) => s.confidence).filter(Boolean);
const functionsOf = (r) => (r.interactionFunctions?.functions || []).map((f) => (typeof f === "string" ? f : f.function)).filter(Boolean);
const drivingOf = (r) => (r.drivingForceCandidates || []).map((c) => (typeof c === "string" ? c : c.candidate)).filter(Boolean);
const drivingPriors = (r) => (r.drivingForceCandidates || []).map((c) => c.priorContribution).filter(Boolean);
const triggerDomainOf = (r) => r.triggerSensitivity?.domain;
const triggerConfOf = (r) => r.triggerSensitivity?.confidence;
const relOpsOf = (r) => (r.relationshipManagement?.operations || []).filter(Boolean);
const metaTagsOf = (r) => (r.metaSelfMonitoring?.tags || []).filter(Boolean);
const maskStrategyOf = (r) => r.maskAnalysis?.maskStrategy;
const gradeOf = (r) => r.evidenceGrade;
const reviewFlagsOf = (r) => (r.reviewFlags || []).map((f) => (typeof f === "string" ? f : f.flag || f.id)).filter(Boolean);

// Check a multiset of values against an allowed set; return offending values.
function outside(values, allowedArr) {
  if (!allowedArr) return [];
  const allowed = new Set(allowedArr);
  return [...new Set(values)].filter((v) => !allowed.has(v));
}

export function validateAnnotations(records, { base } = {}) {
  const rv = ruleVocabularies(base);
  const violations = [];
  const add = (id, field, bad) => { if (bad.length) violations.push({ id, field, offending: bad }); };

  for (const r of records) {
    const id = r.presentationId || r.linkId;
    add(id, "behaviorActionSequence.action", outside(actionsOf(r), rv.behaviorActions));
    add(id, "behaviorActionSequence.confidence", outside(actionConfs(r), rv.confidenceVocabulary));
    add(id, "interactionFunctions", outside(functionsOf(r), rv.interactionFunctions));
    add(id, "drivingForceCandidates", outside(drivingOf(r), rv.drivingForces));
    add(id, "drivingForce.priorContribution", outside(drivingPriors(r), rv.priorRules.priorStrengths));
    add(id, "triggerSensitivity.domain", outside([triggerDomainOf(r)].filter(Boolean), rv.triggerDomains));
    add(id, "triggerSensitivity.confidence", outside([triggerConfOf(r)].filter(Boolean), rv.confidenceVocabulary));
    add(id, "relationshipManagement.operations", outside(relOpsOf(r), rv.relationshipOperations));
    add(id, "metaSelfMonitoring.tags", outside(metaTagsOf(r), rv.metaSelfMonitoring));
    add(id, "maskAnalysis.maskStrategy", outside([maskStrategyOf(r)].filter(Boolean), rv.maskRules.maskStrategy));
    add(id, "reviewFlags", outside(reviewFlagsOf(r), rv.reviewFlagRules));
    // Round-A pass: grades must be within roundAGrades (E0-E2). E3/E4 are not assignable in a single-record pass.
    add(id, "evidenceGrade", outside([gradeOf(r)].filter(Boolean), rv.evidenceGradeRules.roundAGrades));
  }

  return {
    n: records.length,
    valid: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

// Deterministic fingerprint of an annotation set — order-independent per record, so a reordering of
// the array does not change the fingerprint but any field change does. Uses the SAME field projection
// the study consumes (not raw text) so it certifies the annotation content, not incidental metadata.
export function fingerprintAnnotations(records) {
  const perRecord = records.map((r) => {
    const proj = {
      id: r.presentationId || r.linkId,
      actions: actionsOf(r),
      actionConfs: actionConfs(r),
      functions: functionsOf(r),
      driving: drivingOf(r),
      drivingPriors: drivingPriors(r),
      triggerDomain: triggerDomainOf(r) || null,
      triggerConf: triggerConfOf(r) || null,
      relPresent: !!r.relationshipManagement?.present,
      relOps: relOpsOf(r),
      meta: metaTagsOf(r),
      mask: !!r.maskAnalysis?.functionalMask,
      maskStrategy: maskStrategyOf(r) || null,
      expected: (r.expectedReply?.immediateReply?.classes || []).filter(Boolean),
      grade: gradeOf(r) || null,
      affect: r.affect?.primarySurface?.value || null,
      affectConf: r.affect?.primarySurface?.confidence || null,
    };
    return { id: proj.id, hash: sha(JSON.stringify(proj)) };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const combined = sha(perRecord.map((x) => `${x.id}:${x.hash}`).join("\n"));
  return { n: records.length, combined, perRecord };
}

// P1-1C §19-20 — guide-churn assessment + the 1051 full-scale gate.
//
// §19 asks: did the FROZEN annotation guide's VOCABULARY fit the broader corpus, or did the instrument
// have to fall back to escape-hatch tokens (`other`/`indeterminate`) because no frozen category fit?
// This is strictly a guide-VOCABULARY-fit question. `no_external_trigger` is NOT an escape hatch — it
// is a real category, and §2 deliberately added mundane/ordinary text that legitimately has no trigger;
// counting it as fallback would punish the corpus for being broad.
//
// The separate weak_inference rate (how often affect/trigger could not be COMMITTED from a single
// record) is a CORPUS + INSTRUMENT property, not a guide-vocabulary defect: a single-sided corpus is
// inherently hard to commit, and the conservative heuristic under-commits by design. It is therefore
// reported as a diagnostic here and fed to the §20 readiness gate, NOT used to fail the guide itself.
//
//   GUIDE_STABLE_FOR_FULL_SCALE   : escape-hatch rate within budget and freeze intact — vocab fits
//   GUIDE_NOT_READY_FOR_1051      : escape-hatch rate too high (vocab gap) OR the freeze was broken
//
// §20 is the gate. It does NOT rubber-stamp: it HOLDS unless every precondition is met. The dominant
// reality of this run is the instrument-shift confound (50 hand-authored vs 110 heuristic), which makes
// 200-stage stability INCONCLUSIVE. An inconclusive stability read is, by itself, a HOLD — you cannot
// certify a grammar for 1051 records on evidence you already know is confounded.
//
//   PROCEED_TO_1051        : guide stable AND stability conclusive-and-stable AND >=1 E3 survivor AND
//                            no unresolved blocker
//   HOLD_BEFORE_FULL_SCALE : any blocker present (the expected outcome while the instrument is mixed)

export const GUIDE_CHURN_VERDICT = Object.freeze({
  STABLE: "GUIDE_STABLE_FOR_FULL_SCALE",
  NOT_READY: "GUIDE_NOT_READY_FOR_1051",
});

export const FULL_SCALE_GATE = Object.freeze({
  PROCEED: "PROCEED_TO_1051",
  HOLD: "HOLD_BEFORE_FULL_SCALE",
});

// budgets — deliberately strict; the guide must FIT, not merely cope.
export const FALLBACK_BUDGET = 0.20;        // share of records leaning on escape-hatch tokens
export const WEAK_INFERENCE_BUDGET = 0.60;  // share of records whose key judgements are weak_inference

// Only genuine escape hatches — NOT `no_external_trigger` (a real category; see header note).
const ESCAPE_TRIGGER_DOMAINS = new Set(["other", "indeterminate"]);

// §19 — guide-churn from the annotated 160 set, under the frozen guide.
export function assessGuideChurn(annotations, { freezeBroken = false } = {}) {
  const n = annotations.length || 1;
  let escapeHatch = 0;
  let weakInference = 0;
  for (const a of annotations) {
    const dom = a.triggerSensitivity?.domain;
    const tsWeak = a.triggerSensitivity?.confidence === "weak_inference";
    const affWeak = a.affect?.primarySurface?.confidence === "weak_inference";
    // escape hatch: the frozen trigger vocabulary supplied NO specific category for this record
    if (ESCAPE_TRIGGER_DOMAINS.has(dom)) escapeHatch++;
    // weak inference (diagnostic only): the annotator could not commit trigger or affect from the text
    if (tsWeak || affWeak) weakInference++;
  }
  const fallbackRate = Math.round((escapeHatch / n) * 1000) / 1000;
  const weakInferenceRate = Math.round((weakInference / n) * 1000) / 1000;

  // The guide-fit verdict gates ONLY on vocabulary escape-hatch rate + freeze integrity. The
  // weak_inference rate is a corpus/instrument diagnostic that informs §20, not a guide defect.
  const reasons = [];
  if (freezeBroken) reasons.push("guide freeze was broken — the guide changed mid-stage, so no stable guide exists to certify");
  if (fallbackRate > FALLBACK_BUDGET) reasons.push(`escape-hatch trigger rate ${fallbackRate} > budget ${FALLBACK_BUDGET}: the frozen trigger vocabulary does not fit the broader corpus`);

  const verdict = reasons.length === 0 ? GUIDE_CHURN_VERDICT.STABLE : GUIDE_CHURN_VERDICT.NOT_READY;
  return {
    verdict,
    fallbackRate,
    weakInferenceRate,
    escapeHatchRecords: escapeHatch,
    weakInferenceRecords: weakInference,
    weakInferenceIsGuideDefect: false,
    weakInferenceNote: "high weak_inference reflects a single-sided corpus + a deliberately conservative instrument; it is NOT a guide-vocabulary defect. It feeds the §20 readiness gate (evidence thinness), not the §19 guide-fit verdict.",
    reasons,
  };
}

// §20 — the 1051 gate. Weighs guide churn + stability confound + holdout survival + falsification.
export function decideFullScaleGate({
  guideChurn,        // §19 result
  instrumentShift,   // summary.aggregate.json instrumentShift block
  e3Rollup,          // { E3_CANDIDATE_SURVIVES, E3_NOT_MET }
  survivors,         // [candidateId,...]
  falsificationRollup, // { SURVIVES, WEAKENED, REJECTED, INSUFFICIENT }
}) {
  const blockers = [];
  const notes = [];

  if (guideChurn.verdict !== GUIDE_CHURN_VERDICT.STABLE) {
    blockers.push("guide not stable for full scale (§19): " + guideChurn.reasons.join("; "));
  }

  // The decisive blocker for THIS run: stability is confounded by the mixed annotation instrument.
  if (instrumentShift && instrumentShift.confounded) {
    blockers.push(
      "stability is INCONCLUSIVE: the 200-stage mixes two annotation instruments (50 hand-authored, " +
      `110 heuristic; heuristic share ${instrumentShift.heuristicShareOf160}). Single-action rate ` +
      `moved ${instrumentShift.singleActionRateDelta} and multi-function ${instrumentShift.multiFunctionRateDelta} — ` +
      "that is instrument sensitivity, not measured grammar drift. A 1051 pass must use ONE instrument first.",
    );
  }

  const survived = (e3Rollup?.E3_CANDIDATE_SURVIVES ?? 0);
  if (survived < 1) {
    blockers.push("no grammar candidate reached E3-candidate status on the holdout (§18)");
  } else {
    notes.push(`${survived} candidate(s) reached E3-candidate status and were holdout-confirmed: ${(survivors || []).join(", ")} — these are the credible carry-forwards for a single-instrument re-run.`);
  }

  // evidence-thinness readiness signal (moved out of §19 guide-fit; see assessGuideChurn header).
  if (guideChurn.weakInferenceRate > WEAK_INFERENCE_BUDGET) {
    notes.push(`evidence is thin: weak_inference rate ${guideChurn.weakInferenceRate} > ${WEAK_INFERENCE_BUDGET}. Expected for a single-sided corpus + conservative instrument, but it caps how strongly any pattern can be asserted at 1051 — plan for cross-corpus (E3+) confirmation, not single-record commitment.`);
  }

  if ((falsificationRollup?.REJECTED ?? 0) > 0) {
    notes.push(`${falsificationRollup.REJECTED} hypotheses were REJECTED at 160 (falsification working as intended); some rejections are partly instrument-driven and must be re-tested under one instrument.`);
  }

  const decision = blockers.length === 0 ? FULL_SCALE_GATE.PROCEED : FULL_SCALE_GATE.HOLD;

  // The remediation is specific and actionable, not a vague "collect more data".
  const remediation = decision === FULL_SCALE_GATE.HOLD
    ? [
        "re-annotate the 50 carry-over records with the SAME conservative instrument used for the 110 new ones (remove the hand-vs-heuristic confound), OR hand-annotate a matched sample of the 110;",
        "re-run stability + falsification under the single instrument; only SHIFTED verdicts that persist are real;",
        "carry forward only the E3-survivor candidates as priors, re-tested on a fresh holdout at larger n.",
      ]
    : [];

  return { decision, blockers, notes, remediation };
}

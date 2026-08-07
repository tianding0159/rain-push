// P1-1B.1 before/after diff + dual-status judgment (directive §13/§14/§15).
//
// The diff compares the UNCHANGED discovery run on the revised set vs the refined set, so any
// movement is attributable to the guide refinement alone. The dual status deliberately reports two
// SEPARATE verdicts — grammar discovery vs annotation guide — so "the guide needs a small fix" is
// never miswritten as "grammar discovery failed".

const SUPPORT_ORDER = ["insufficient_evidence", "contradicted", "mixed", "weak_support", "preliminary_support"];

function ngramTop(section, k = 5) {
  return (section || []).slice(0, k).map((x) => `${x.key}:${x.recordSupport}`);
}

export function computeRefinementDiff({ discBefore, discAfter, hypBefore, hypAfter, tGap, followup, singleAudit, batch }) {
  const otherAfter = batch.filter((b) => b.refined.triggerSensitivity?.domain === "other").length;
  const otherBefore = tGap.otherCount;

  // functional mask count (from refined annotations) vs surface mask (from before discovery)
  const functionalMasks = batch.filter((b) => b.refined.maskAnalysis?.functionalMask);
  const maskStrategyDist = {};
  for (const m of functionalMasks) {
    const s = m.refined.maskAnalysis.maskStrategy || "unknown";
    maskStrategyDist[s] = (maskStrategyDist[s] || 0) + 1;
  }

  const hypStatusChanges = [];
  const byIdBefore = new Map(hypBefore.hypotheses.map((h) => [h.id, h]));
  for (const h of hypAfter.hypotheses) {
    const b = byIdBefore.get(h.id);
    if (b && b.status !== h.status) {
      hypStatusChanges.push({ id: h.id, before: b.status, after: h.status, beforeCounts: `${b.observed_count}/${b.eligible_opportunity_count}`, afterCounts: `${h.observed_count}/${h.eligible_opportunity_count}` });
    }
  }

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    algorithmChanged: false,
    // 1. trigger other rate
    triggerOtherBefore: otherBefore,
    triggerOtherAfter: otherAfter,
    triggerOtherReductionFraction: otherBefore ? Math.round(((otherBefore - otherAfter) / otherBefore) * 1000) / 1000 : 0,
    // 2. true single-action rate
    singleAction: { original: singleAudit.originalSingleActionRecords, trueSingle: singleAudit.revisedTrueSingleAction, flagged: singleAudit.annotationUnderSegmentationFlagged },
    // 3. transition candidate count
    bigramCountBefore: discBefore.transitions.bigrams.length,
    bigramCountAfter: discAfter.transitions.bigrams.length,
    trigramCountBefore: discBefore.transitions.trigrams.length,
    trigramCountAfter: discAfter.transitions.trigrams.length,
    recordsWithBigramBefore: discBefore.transitions.recordsWithAnyBigram,
    recordsWithBigramAfter: discAfter.transitions.recordsWithAnyBigram,
    // 4/5. top n-gram rank
    topBigramsBefore: ngramTop(discBefore.transitions.bigrams),
    topBigramsAfter: ngramTop(discAfter.transitions.bigrams),
    topTrigramsBefore: ngramTop(discBefore.transitions.trigrams),
    topTrigramsAfter: ngramTop(discAfter.transitions.trigrams),
    // 6/7. reveal→mask + followup
    mask: {
      surfaceRevealThenConcealBefore: discBefore.revealMask.revealThenConcealRecords,
      functionalMaskAfter: functionalMasks.length,
      maskStrategyDistribution: maskStrategyDist,
      revealBearing: followup.revealBearingRecords,
      revealMessageFinal: followup.revealMessageFinalRecords,
      note: "functionalMaskAfter counts masks under the FUNCTIONAL definition (exposure-reduction), not surface conceal-token adjacency. It is not engineered to exceed the surface count.",
    },
    revealImmediateFollowup: followup.immediateFollowup,
    // 8. relationship operations
    relOpsBefore: ngramTop(discBefore.relationshipOperations.operationFrequency),
    relOpsAfter: ngramTop(discAfter.relationshipOperations.operationFrequency),
    // 9. H1-H11 status changes
    hypothesisStatusChanges: hypStatusChanges,
    // 10. trigger sensitivity domain count (grew because `other` split into real domains)
    triggerDomainsBefore: discBefore.triggerSensitivity.domains.length,
    triggerDomainsAfter: discAfter.triggerSensitivity.domains.length,
  };
}

// ---------------------------------------------------------------------------
// Dual status — two independent verdicts, never merged.
// ---------------------------------------------------------------------------
export const GRAMMAR_DISCOVERY_STATUS = Object.freeze({
  SUCCESSFUL: "GRAMMAR_DISCOVERY_SUCCESSFUL",
  UNSTABLE: "GRAMMAR_DISCOVERY_UNSTABLE",
});
export const GUIDE_STATUS = Object.freeze({
  STABLE: "GUIDE_STABLE",
  NEEDS_REFINEMENT: "GUIDE_NEEDS_REFINEMENT",
  CHURN_TOO_HIGH: "GUIDE_CHURN_TOO_HIGH",
});

// A change is ADDITIVE (guide-gap closure, not annotation instability) when it either
//   (a) replaces a fallback token with a real category  (`other`/`unknown`/`no_clear_action` → X), or
//   (b) populates a previously-empty field               (null/undefined → value).
// It is SUBSTANTIVE only when a previously-committed, non-fallback value is FLIPPED to a different one.
// Churn that must gate PROCEED_TO_200 is the substantive kind; additive splits are the fix working.
const FALLBACK_TOKENS = new Set(["other", "unknown", "no_clear_action"]);
function classifyChange(c) {
  const isEmpty = (v) => v == null || v === "";
  const oldFallback = typeof c.oldValue === "string" && FALLBACK_TOKENS.has(c.oldValue);
  if (isEmpty(c.oldValue) || oldFallback) return "additive";
  return "substantive";
}

// Build the refined change-log from a batch, recording ONLY effective changes. A noOp entry
// (explicitly flagged, or old == new) is not a change and is omitted; a record whose changes are
// all noOp drops out of the log entirely. Returns { totalChangedRecords, records }.
export function buildChangeLog(batch) {
  const isEffective = (c) => !c.noOp && JSON.stringify(c.oldValue) !== JSON.stringify(c.newValue);
  const records = batch
    .map((b) => ({ presentationId: b.presentationId, link: b.linkId, changedFields: (b.changes || []).filter(isEffective) }))
    .filter((r) => r.changedFields.length > 0);
  return { totalChangedRecords: records.length, records };
}

export function evaluateDualStatus({ diff, churnAfter, hypAfter, batch, tGap }) {
  const n = batch.length;
  const changedRecords = batch.filter((b) => b.changes.some((c) => !c.noOp)).length;
  const changedFraction = n ? changedRecords / n : 0;

  // Split churn: additive (fallback→enum, null→value) vs substantive (committed value flipped).
  const additiveRecords = batch.filter((b) => {
    const eff = b.changes.filter((c) => !c.noOp);
    return eff.length > 0 && eff.every((c) => classifyChange(c) === "additive");
  }).length;
  const substantiveRecords = batch.filter((b) =>
    b.changes.some((c) => !c.noOp && classifyChange(c) === "substantive"),
  ).length;
  const substantiveFraction = n ? substantiveRecords / n : 0;

  // --- grammar discovery stability: did the grammar survive a small guide change? ---
  // Unstable only if the top structure fully flips or hypotheses wholesale reverse.
  const flips = diff.hypothesisStatusChanges.filter((c) => {
    const bi = SUPPORT_ORDER.indexOf(c.before);
    const ai = SUPPORT_ORDER.indexOf(c.after);
    return Math.abs(ai - bi) >= 3; // a 3+ step jump = a wholesale reversal
  });
  const topBigramStable = JSON.stringify(diff.topBigramsBefore.slice(0, 3)) === JSON.stringify(diff.topBigramsAfter.slice(0, 3));
  const grammarDiscoveryStatus = flips.length === 0 && diff.bigramCountAfter >= diff.bigramCountBefore - 1 && topBigramStable
    ? GRAMMAR_DISCOVERY_STATUS.SUCCESSFUL
    : GRAMMAR_DISCOVERY_STATUS.UNSTABLE;

  // --- guide status: was this a small, stabilising fix, or churn? ---
  // Gate on the SUBSTANTIVE fraction only. Additive splits (fallback→enum, null→value) are the guide
  // gap being closed — counting them as churn would punish the fix for working. A high substantive
  // fraction means annotators are re-judging committed values, which is real instability.
  let annotationGuideStatus;
  if (substantiveFraction > 0.25) {
    annotationGuideStatus = GUIDE_STATUS.CHURN_TOO_HIGH;
  } else if (changedFraction > 0.25) {
    // lots of records moved, but all additively — the guide is now in better shape. Flag as
    // NEEDS_REFINEMENT (residual may remain, e.g. `indeterminate`) rather than blocking.
    annotationGuideStatus = GUIDE_STATUS.NEEDS_REFINEMENT;
  } else {
    annotationGuideStatus = GUIDE_STATUS.STABLE;
  }

  // --- PROCEED_TO_200 gate ---
  const blockers = [];
  const reasons = [];
  if (grammarDiscoveryStatus !== GRAMMAR_DISCOVERY_STATUS.SUCCESSFUL) blockers.push("grammar discovery unstable under refinement");
  if (annotationGuideStatus === GUIDE_STATUS.CHURN_TOO_HIGH) blockers.push(`substantive guide churn too high: ${Math.round(substantiveFraction * 100)}% records had a committed value flipped`);

  // residual guide concerns (do not block, but downgrade to REFINE_ONCE_MORE if severe)
  const stillHighOther = diff.triggerOtherAfter / n > 0.15;
  if (stillHighOther) reasons.push(`trigger 'other' still ${diff.triggerOtherAfter}/${n} after split`);
  const priorDominated = hypAfter.hypotheses.filter((h) => h.status === "insufficient_evidence").length > hypAfter.hypotheses.length / 2;
  if (priorDominated) reasons.push("majority of hypotheses insufficient — evidence too thin");

  let decision;
  if (blockers.length > 0) decision = "REFINE_ONCE_MORE";
  else if (reasons.length > 0) decision = "REFINE_ONCE_MORE";
  else decision = "PROCEED_TO_200";

  return {
    grammarDiscoveryStatus,
    annotationGuideStatus,
    changedRecords,
    changedFraction: Math.round(changedFraction * 1000) / 1000,
    additiveRecords,
    substantiveRecords,
    substantiveFraction: Math.round(substantiveFraction * 1000) / 1000,
    proceedGate: { decision, blockers, reasons, notes: ["Grammar discovery status and annotation guide status are independent verdicts — a guide fix is not a discovery failure.", "PROCEED_TO_200 means collect more data under the refined guide; it does NOT validate the grammar.", "Churn is split into additive (fallback→enum, null→value = gap closure) and substantive (committed value flipped = instability); only the substantive fraction gates the decision."] },
  };
}

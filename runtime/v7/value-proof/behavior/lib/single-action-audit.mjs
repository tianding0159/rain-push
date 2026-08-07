// P1-1B.1 single-action audit (directive §9) — is a single-action record TRULY single-action, or
// did a too-coarse guide merge what should be two actions? The audit NEVER force-splits: it only
// flags under-segmentation when there is a deterministic structural signal that a second action is
// present, and defaults to "truly single" otherwise. Over-splitting risk is recorded explicitly.
//
// Deterministic signal for a candidate second action: the utterance contains a contrastive/
// concessive discourse marker (不过/但是/其实/才怪/algorithmic list below) that in this corpus
// reliably separates a first move from a distinct second move (e.g. accept … 不过 test_exclusivity).
// This is a HEURISTIC FLAG for human review, not an automatic re-segmentation.

import { linkOf, orderedActions } from "./grammar-discovery.mjs";

// Contrastive / concessive markers that, in this corpus, tend to hinge two distinct moves.
const CONTRAST_MARKERS = ["不过", "但是", "但", "其实", "才怪", "然而", "不过就算", "只是"];

function hasContrastPivot(text) {
  if (!text) return false;
  return CONTRAST_MARKERS.some((m) => text.includes(m));
}

export function auditSingleActions(annotations) {
  const singles = annotations.filter((a) => orderedActions(a).length === 1);
  const records = [];
  let trueSingle = 0;
  let underSeg = 0;
  let ambiguous = 0;

  for (const ann of singles) {
    const only = orderedActions(ann)[0]?.action;
    const pivot = hasContrastPivot(ann.text);
    let trulySingleAction;
    let reason;
    let missingActionCandidate = null;
    let overSplitRisk;

    if (pivot) {
      // A contrast marker suggests a possible second move, but only FLAG it — never auto-split.
      trulySingleAction = "unknown";
      reason = "contrastive marker present — a second move MAY be under-segmented; flagged for human review, not auto-split";
      missingActionCandidate = "second_move_after_contrast";
      overSplitRisk = "medium";
      ambiguous++;
    } else {
      trulySingleAction = "true";
      reason = "no contrastive pivot; a single expressive/directive move (e.g. repeated intensifier) — splitting would fabricate structure";
      overSplitRisk = "low";
      trueSingle++;
    }

    records.push({ link: linkOf(ann), onlyAction: only, trulySingleAction, missingActionCandidate, reason, overSplitRisk });
  }

  // under-segmentation = ambiguous (flagged) records; we never assert a definite mis-merge from text alone
  underSeg = ambiguous;

  records.sort((a, b) => (a.link < b.link ? -1 : 1));

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    totalRecords: annotations.length,
    originalSingleActionRecords: singles.length,
    revisedTrueSingleAction: trueSingle,
    annotationUnderSegmentationFlagged: underSeg,
    ambiguous,
    finding: `${trueSingle}/${singles.length} single-action records show no structural sign of a missing move (truly single). ${ambiguous} carry a contrastive pivot and are FLAGGED for human review — not auto-split. Single-action prevalence is therefore mostly real, not a guide artifact.`,
    note: "The audit never force-splits. A contrastive marker only raises a review flag; the annotator decides. This avoids inflating transition counts to make the grammar look denser than the data.",
    records,
  };
}

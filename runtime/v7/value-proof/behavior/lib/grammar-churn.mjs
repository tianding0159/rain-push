// Annotation-guide churn detector (P1-1B, directive §19).
//
// The pilot's job is not only to mine patterns but to tell the guide authors WHERE the annotation
// vocabulary and instructions failed the data. Churn signals are the honest feedback loop before
// scaling to n=200: if half the records fall into `other`, the enum — not the annotator — is wrong.
//
// Signals (all count-based, no verbatim):
//   - fallbackOveruse:  a dimension where `other`/`unknown` exceeds a fraction of records → the enum
//                       is missing real categories (long-tail leak, AGENTS.md §10 "硬编码枚举漏长尾").
//   - deadEnum:         a vocab value NEVER used across 50 records → candidate for pruning OR a sign
//                       the guide never taught annotators when to use it.
//   - sparseStructure:  most records are single-action, so transition grammar can't be learned yet →
//                       the guide should push for sequence decomposition, or n must grow.
//
// Output is verbatim-free and deterministic (sorted). It feeds the PROCEED_TO_200 gate.

export const CHURN_CODES = Object.freeze({
  FALLBACK_OVERUSE: "FALLBACK_OVERUSE",
  DEAD_ENUM: "DEAD_ENUM",
  SPARSE_STRUCTURE: "SPARSE_STRUCTURE",
});

// A dimension is "churny" when its fallback token covers >= this fraction of records.
export const FALLBACK_FRACTION = 0.3;

// Dimensions we audit: [signalName, vocabKey, extractor(ann) -> value|values[], fallbackTokens]
const DIMENSIONS = [
  ["affectPrimarySurface", "affectLabels", (a) => a.affect?.primarySurface?.value, ["other"]],
  ["triggerDomain", "triggerDomains", (a) => a.triggerSensitivity?.domain, ["other"]],
  ["l1Target", "targets", (a) => a.l1_observable?.target, ["unknown"]],
  ["behaviorAction", "behaviorActions", (a) => (a.behaviorActionSequence || []).map((s) => s.action), ["other", "no_clear_action"]],
  ["relationshipOperation", "relationshipOperations", (a) => (a.relationshipManagement?.operations || []).map((o) => o.operation || o), []],
];

function tally(annotations, extract) {
  const counts = new Map();
  let recordsWithValue = 0;
  for (const ann of annotations) {
    const v = extract(ann);
    const vals = Array.isArray(v) ? v : v == null ? [] : [v];
    if (vals.length > 0) recordsWithValue++;
    for (const x of vals) counts.set(x, (counts.get(x) || 0) + 1);
  }
  return { counts, recordsWithValue };
}

export function detectChurn(annotations, vocab) {
  const N = annotations.length;
  const signals = [];

  for (const [name, vocabKey, extract, fallbacks] of DIMENSIONS) {
    const { counts } = tally(annotations, extract);
    // fallback overuse — count distinct RECORDS whose value is a fallback token
    let fallbackRecords = 0;
    for (const ann of annotations) {
      const v = extract(ann);
      const vals = Array.isArray(v) ? v : v == null ? [] : [v];
      if (vals.some((x) => fallbacks.includes(x))) fallbackRecords++;
    }
    if (fallbacks.length > 0 && N > 0 && fallbackRecords / N >= FALLBACK_FRACTION) {
      signals.push({
        code: CHURN_CODES.FALLBACK_OVERUSE,
        dimension: name,
        vocabKey,
        fallbackRecords,
        totalRecords: N,
        fraction: Math.round((fallbackRecords / N) * 1000) / 1000,
        recommendation: `Expand '${vocabKey}' or clarify guide: ${fallbackRecords}/${N} records fell back to ${JSON.stringify(fallbacks)}. Likely a missing long-tail category.`,
      });
    }
    // dead enums — vocab values never used
    const allowed = Array.isArray(vocab[vocabKey]) ? vocab[vocabKey] : [];
    const unused = allowed.filter((val) => !counts.has(val)).sort();
    if (unused.length > 0) {
      signals.push({
        code: CHURN_CODES.DEAD_ENUM,
        dimension: name,
        vocabKey,
        unusedCount: unused.length,
        allowedCount: allowed.length,
        unused,
        recommendation: `${unused.length}/${allowed.length} '${vocabKey}' values unused at n=${N}. Either the guide never teaches them, or they are prunable. Re-check at n=200 before pruning.`,
      });
    }
  }

  // sparse structure — transition grammar needs multi-action records
  const singleAction = annotations.filter((a) => (a.behaviorActionSequence || []).length === 1).length;
  if (N > 0 && singleAction / N >= 0.4) {
    signals.push({
      code: CHURN_CODES.SPARSE_STRUCTURE,
      singleActionRecords: singleAction,
      totalRecords: N,
      fraction: Math.round((singleAction / N) * 1000) / 1000,
      recommendation: `${singleAction}/${N} records are single-action. Transition grammar (H1/H2/H9/H10) is data-starved; guide should encourage finer action decomposition, or defer transition claims to a larger n.`,
    });
  }

  signals.sort((a, b) => (a.code + (a.dimension || "")) < (b.code + (b.dimension || "")) ? -1 : 1);

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    n: N,
    fallbackFractionThreshold: FALLBACK_FRACTION,
    signalCount: signals.length,
    signals,
    note: "Churn signals are guide-revision feedback, not annotation errors. A high 'other' rate means the enum missed a real category (AGENTS.md §10 长尾).",
  };
}

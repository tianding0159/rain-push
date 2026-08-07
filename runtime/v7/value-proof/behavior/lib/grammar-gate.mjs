// PROCEED_TO_200 gate (P1-1B, directive §20).
//
// The pilot's terminal question is NOT "is the grammar true" — n=50 can't answer that. It is:
// "did the pilot MACHINERY work well enough that annotating 200 more is worth it?" The gate
// separates two failure modes:
//   - the DISCOVERY PIPELINE failed (schema invalid, no eligible opportunities anywhere, every
//     hypothesis insufficient) → BEHAVIOR_GRAMMAR_FAILED, do not scale, fix the machine first.
//   - the pipeline worked but the ANNOTATION GUIDE churned hard (enum long-tail leak, sparse
//     structure) → BEHAVIOR_GRAMMAR_NEEDS_GUIDE_REVISION, revise guide THEN scale.
//   - the pipeline worked and churn is tolerable → BEHAVIOR_GRAMMAR_PILOT_READY, proceed to 200.
//
// The gate is conservative: any hard blocker forces the lower status. It never emits a "grammar is
// validated" verdict — PILOT_READY means "ready to collect more data", not "grammar confirmed".

export const GATE_STATUS = Object.freeze({
  READY: "BEHAVIOR_GRAMMAR_PILOT_READY",
  NEEDS_GUIDE_REVISION: "BEHAVIOR_GRAMMAR_NEEDS_GUIDE_REVISION",
  FAILED: "BEHAVIOR_GRAMMAR_FAILED",
});

// How many hypotheses must clear "insufficient_evidence" for the pipeline to count as working.
const MIN_EVALUABLE_HYPOTHESES = 6;
// A FALLBACK_OVERUSE signal at/above this fraction is a hard guide blocker (not just advisory).
const HARD_FALLBACK_FRACTION = 0.4;

export function evaluateProceedGate({ discovery, hypotheses, churn }) {
  const blockers = []; // force FAILED
  const reasons = []; // force NEEDS_GUIDE_REVISION
  const notes = [];

  // --- pipeline-health checks (FAILED if broken) ---
  if (!discovery || discovery.status !== "PILOT_ESTIMATE") {
    blockers.push("discovery bundle missing or not tagged PILOT_ESTIMATE");
  }
  const hyps = hypotheses?.hypotheses || [];
  const evaluable = hyps.filter((h) => h.status !== "insufficient_evidence").length;
  if (evaluable < MIN_EVALUABLE_HYPOTHESES) {
    blockers.push(`only ${evaluable}/${hyps.length} hypotheses were evaluable (need >= ${MIN_EVALUABLE_HYPOTHESES}); the pipeline could not test enough claims`);
  }
  const anySupport = hyps.some((h) => h.status === "preliminary_support" || h.status === "weak_support");
  if (!anySupport) {
    blockers.push("no hypothesis reached even weak_support; nothing worth scaling for");
  }

  // --- guide-health checks (NEEDS_GUIDE_REVISION) ---
  const hardFallback = (churn?.signals || []).filter(
    (s) => s.code === "FALLBACK_OVERUSE" && (s.fraction || 0) >= HARD_FALLBACK_FRACTION
  );
  for (const s of hardFallback) {
    reasons.push(`enum '${s.vocabKey}' fell back to catch-all in ${Math.round(s.fraction * 100)}% of records — expand the enum before scaling (${s.dimension})`);
  }
  const sparse = (churn?.signals || []).find((s) => s.code === "SPARSE_STRUCTURE");
  if (sparse) {
    reasons.push(`${sparse.singleActionRecords}/${sparse.totalRecords} records are single-action — transition grammar is data-starved; decide whether to revise decomposition guidance or accept transitions stay provisional at n=200`);
  }

  notes.push("PILOT_READY means 'the machinery works, collect more data'; it does NOT mean the grammar is validated.");
  if ((churn?.signals || []).some((s) => s.code === "DEAD_ENUM")) {
    notes.push("Dead-enum signals are advisory only (not blockers): unused values may simply be long-tail; re-check at n=200 before pruning.");
  }

  let status;
  let decision;
  if (blockers.length > 0) {
    status = GATE_STATUS.FAILED;
    decision = "DO_NOT_SCALE_FIX_PIPELINE";
  } else if (reasons.length > 0) {
    status = GATE_STATUS.NEEDS_GUIDE_REVISION;
    decision = "REVISE_GUIDE_THEN_SCALE";
  } else {
    status = GATE_STATUS.READY;
    decision = "PROCEED_TO_200";
  }

  return {
    formatVersion: 1,
    status,
    decision,
    evaluableHypotheses: evaluable,
    totalHypotheses: hyps.length,
    blockers,
    reasons,
    notes,
  };
}

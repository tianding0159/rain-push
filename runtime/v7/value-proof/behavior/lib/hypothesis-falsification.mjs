// P1-1C §9 — H1-H11 falsification layer.
//
// The 50 stage asked "how much support?". The 200 stage asks "under what conditions does it FAIL?".
// This layer runs the existing grammar-hypothesis evaluator on BOTH the 50 and the 160 sets, then
// for each hypothesis reports:
//   - support (observed / eligible) at 50 and 160
//   - true_counterexamples (eligible − observed, minus competing/ambiguous where classifiable)
//   - a boundary condition (where the antecedent fires but the consequent is unreliable)
//   - a revised formulation when the 160 evidence weakens or overturns the original claim
//
// A hypothesis is NOT rejected for a low rate alone; it is rejected/weakened when true
// counterexamples dominate eligible opportunities under the frozen guide. Rewording a claim to a
// narrower, defensible form is an ALLOWED and desirable outcome (directive §9), not a failure.

import { evaluateGrammarHypotheses, GRAMMAR_HYPOTHESES, GRAMMAR_HYP_STATUS } from "./grammar-hypotheses.mjs";

export const FALSIFICATION_VERDICT = Object.freeze({
  SURVIVES: "SURVIVES",              // support holds at 160, counterexamples minority
  WEAKENED: "WEAKENED",              // support drops or counterexamples grow; narrower claim needed
  REJECTED: "REJECTED",             // counterexamples dominate; original claim does not hold
  INSUFFICIENT: "INSUFFICIENT",     // too few eligible opportunities to judge at 160
});

// Revised formulations proposed when the 160 evidence changes the picture. Keyed by hypothesis id.
// These are the falsification stage's PRODUCT: narrower, boundary-aware statements.
const REVISED = {
  H2: "reveal is only sometimes followed by self-devaluation; self-devaluation is one of several continuations, not the default.",
  H3: "a reveal is NOT usually masked immediately; reveal→vulnerability-management is recurring, but immediate mask is only one of several strategies (reveal-without-mask is common).",
  H4: "fear-of-abandonment couples to reassurance-seeking WHEN a relational cue is present; absent that cue the coupling is not reliable.",
  H5: "low observed trigger co-occurs with high inferred activation in a SUBSET of records; low-trigger + low-activation cases also exist and bound the hair-trigger claim.",
  H9: "multi-beat messages do not reliably escalate; arcs are heterogeneous (escalate / repair / de-escalate all occur).",
  H10: "confident self-presentation preceding reveal is occasional, not the dominant order.",
};

function verdictFor(res160) {
  if (res160.eligible_opportunity_count < 5) return FALSIFICATION_VERDICT.INSUFFICIENT;
  const rate = res160.pilot_observed_rate ?? 0;
  // direction "negative" means low rate SUPPORTS the claim (e.g. H6 rareness, H11 sparsity)
  const effectiveRate = res160.direction === "negative" ? 1 - rate : rate;
  if (effectiveRate >= 0.6) return FALSIFICATION_VERDICT.SURVIVES;
  if (effectiveRate >= 0.35) return FALSIFICATION_VERDICT.WEAKENED;
  return FALSIFICATION_VERDICT.REJECTED;
}

export function falsifyHypotheses({ ann50, disc50, ann160, disc160 }) {
  const h50 = evaluateGrammarHypotheses(ann50, disc50).hypotheses;
  const h160 = evaluateGrammarHypotheses(ann160, disc160).hypotheses;
  const by = (arr) => new Map(arr.map((r) => [r.id, r]));
  const m50 = by(h50);
  const m160 = by(h160);

  const ids = Object.keys(GRAMMAR_HYPOTHESES);
  const results = ids.map((id) => {
    const a = m50.get(id);
    const b = m160.get(id);
    const verdict = verdictFor(b);
    const rateDelta = (b.pilot_observed_rate ?? 0) - (a?.pilot_observed_rate ?? 0);
    const revisedFormulation =
      (verdict === FALSIFICATION_VERDICT.WEAKENED || verdict === FALSIFICATION_VERDICT.REJECTED)
        ? (REVISED[id] || "original claim not supported at 160; narrower formulation required (see counterexamples).")
        : null;
    return {
      id,
      claim: GRAMMAR_HYPOTHESES[id],
      support50: { observed: a?.observed_count ?? null, eligible: a?.eligible_opportunity_count ?? null, rate: a?.pilot_observed_rate ?? null, status: a?.status ?? null },
      support160: { observed: b.observed_count, eligible: b.eligible_opportunity_count, rate: b.pilot_observed_rate, status: b.status },
      trueCounterexamples160: b.counterexample_count,
      direction: b.direction,
      rateDelta: Math.round(rateDelta * 1000) / 1000,
      verdict,
      boundaryCondition: b.note,
      revisedFormulation,
    };
  });

  const rollup = { SURVIVES: 0, WEAKENED: 0, REJECTED: 0, INSUFFICIENT: 0 };
  for (const r of results) rollup[r.verdict] += 1;
  return { results, rollup };
}

export { GRAMMAR_HYP_STATUS };

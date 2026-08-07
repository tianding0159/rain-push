// P1-1C §17-18 — holdout validation + E3 survival criteria.
//
// DISCIPLINE (the whole point): the grammar's verdicts on the 160 discovery set are FROZEN before the
// 40-record holdout is ever opened. This module refuses to score the holdout unless it is handed a
// `frozenGrammar` object that was computed WITHOUT the holdout — the holdout is a confirmatory test,
// never a fitting set. Peeking would turn falsification into curve-fitting.
//
// §17 holdout validation: re-run each frozen candidate on the 40 holdout records; a candidate is
//   HOLDOUT_CONFIRMED if it keeps support with a low true-counterexample density there, HOLDOUT_WEAKENED
//   if support thins or counterexamples grow, HOLDOUT_ABSENT if the antecedent barely fires (no test),
//   HOLDOUT_REFUTED if counterexamples dominate.
//
// §18 E3 survival: a candidate SURVIVES to E3-candidate status only if ALL hold:
//   (a) >= 8 unique supporting records on the 160 discovery set (multiple-independent-records rule);
//   (b) the counterexample check covered >= 3 eligible opportunities (the antecedent fired at least
//       3 times, so disconfirmation had >= 3 chances to appear). Consistent with the frozen guide,
//       which allows the counterexample set to be EMPTY as long as it "was looked for" — so this
//       gates untested-antecedent patterns (opportunity < 3), NOT patterns that are simply robust;
//   (c) it is confirmed on the holdout (§17 verdict HOLDOUT_CONFIRMED);
//   (d) support is NOT dominated by weak_inference / prior-only records (a pattern that only exists
//       when the annotator was guessing is not evidence — this is the E0-E2-stay-out gate).
// Falling any clause yields E3_NOT_MET with the failing clauses named. E3 here means "E3-candidate for
// human review", never "confirmed" — the doc's human-review gate still applies.

import { evaluateCandidate, acc } from "./counterexample.mjs";

export const HOLDOUT_VERDICT = Object.freeze({
  CONFIRMED: "HOLDOUT_CONFIRMED",
  WEAKENED: "HOLDOUT_WEAKENED",
  ABSENT: "HOLDOUT_ABSENT",      // antecedent fired too rarely to test (< MIN_HOLDOUT_ELIGIBLE)
  REFUTED: "HOLDOUT_REFUTED",
});

export const E3_VERDICT = Object.freeze({
  SURVIVES: "E3_CANDIDATE_SURVIVES",
  NOT_MET: "E3_NOT_MET",
});

export const MIN_UNIQUE_SUPPORT = 8;     // §18 (a)
export const MIN_CE_OPPORTUNITIES = 3;   // §18 (b): eligible opportunities where a CE could appear
export const MIN_HOLDOUT_ELIGIBLE = 3;   // below this the holdout cannot test the candidate
export const PRIOR_DOMINATION_MAX = 0.5; // §18 (d): > half of support being weak/prior => dominated

// A record "supports weakly / by prior only" when its judged fields are weak_inference or the trigger
// explicitly requires cross-corpus support (i.e. the single-record annotation is not self-sufficient).
function isWeakOrPriorSupport(a) {
  const tsConf = a.triggerSensitivity?.confidence;
  const affConf = a.affect?.primarySurface?.confidence;
  const requiresCross = !!a.triggerSensitivity?.requiresCrossCorpusSupport;
  const grade = acc.grade(a);
  const weakGrade = grade === "E0" || grade === "E1";
  const weakConf = tsConf === "weak_inference" && (affConf === "weak_inference" || affConf == null);
  return requiresCross && weakGrade && weakConf;
}

// §17 — score one frozen candidate on the holdout.
export function validateOnHoldout(candidate, holdout) {
  const res = evaluateCandidate(candidate, holdout);
  const eligible = res.eligibleOpportunityCount;
  let verdict;
  if (eligible < MIN_HOLDOUT_ELIGIBLE) verdict = HOLDOUT_VERDICT.ABSENT;
  else if (res.supportCount === 0 || res.counterexampleDensity > 0.5) verdict = HOLDOUT_VERDICT.REFUTED;
  else if (res.counterexampleDensity <= 0.2 && res.competingStrategyDensity <= 0.3) verdict = HOLDOUT_VERDICT.CONFIRMED;
  else verdict = HOLDOUT_VERDICT.WEAKENED;
  return {
    candidateId: candidate.id,
    holdoutEligible: eligible,
    holdoutSupport: res.supportCount,
    holdoutTrueCE: res.trueCounterexampleCount,
    holdoutCompeting: res.competingStrategyCount,
    holdoutCounterexampleDensity: res.counterexampleDensity,
    verdict,
  };
}

// §18 — E3 survival for one candidate, combining its FROZEN 160 result + its holdout result.
// `frozen160` is the candidate's result object from the discovery-160 evaluation (with links);
// `discovery160` is the 160 annotation array (to inspect support-record confidence for clause d).
export function e3Survival(candidate, frozen160, holdoutResult, discovery160) {
  // recompute the support link set on 160 (frozen160 may be the committed, link-stripped form)
  const full = frozen160?.links ? frozen160 : evaluateCandidate(candidate, discovery160);
  const supportLinks = new Set(full.links.support);
  const uniqueSupport = supportLinks.size;
  // "counterexamples checked" = eligible opportunities where a CE COULD have appeared (the guide
  // permits an empty CE set as long as it was looked for). Untested antecedents (opportunity < 3)
  // fail; robust patterns with few actual CEs do NOT.
  const ceOpportunities = full.eligibleOpportunityCount;
  const ceFound = full.trueCounterexampleCount + full.competingStrategyCount;

  // clause (d): among supporting records, share that are weak/prior-only.
  const supportRecs = discovery160.filter((a) => supportLinks.has(acc.link(a)));
  const weakSupport = supportRecs.filter(isWeakOrPriorSupport).length;
  const weakShare = uniqueSupport > 0 ? Math.round((weakSupport / uniqueSupport) * 1000) / 1000 : 1;

  const clauses = {
    hasMinUniqueSupport: uniqueSupport >= MIN_UNIQUE_SUPPORT,
    hasMinCounterexampleOpportunities: ceOpportunities >= MIN_CE_OPPORTUNITIES,
    holdoutConfirmed: holdoutResult.verdict === HOLDOUT_VERDICT.CONFIRMED,
    notPriorDominated: weakShare <= PRIOR_DOMINATION_MAX,
  };
  const failed = Object.entries(clauses).filter(([, ok]) => !ok).map(([k]) => k);
  const verdict = failed.length === 0 ? E3_VERDICT.SURVIVES : E3_VERDICT.NOT_MET;

  return {
    candidateId: candidate.id,
    uniqueSupport160: uniqueSupport,
    counterexampleOpportunities160: ceOpportunities,
    counterexamplesFound160: ceFound,
    weakOrPriorSupportShare: weakShare,
    holdoutVerdict: holdoutResult.verdict,
    clauses,
    failedClauses: failed,
    verdict,
  };
}

// Orchestrator: freeze-check gate + §17 + §18 over the full candidate set.
// `frozenGrammar` MUST be present (the 160 evaluation done before the holdout was opened). If it is
// missing we refuse — that is the anti-peeking guard, surfaced as HOLDOUT_NOT_AUTHORIZED.
export function runHoldoutValidation({ candidates, discovery160, holdout, frozenGrammar }) {
  if (!frozenGrammar || !Array.isArray(frozenGrammar.candidates) || frozenGrammar.candidates.length === 0) {
    return { status: "HOLDOUT_NOT_AUTHORIZED", reason: "frozen 160 grammar must be computed before the holdout is opened" };
  }
  const frozenById = new Map(frozenGrammar.candidates.map((c) => [c.candidateId, c]));

  const holdoutResults = candidates.map((c) => validateOnHoldout(c, holdout));
  const holdoutById = new Map(holdoutResults.map((r) => [r.candidateId, r]));

  const e3 = candidates.map((c) =>
    e3Survival(c, frozenById.get(c.id), holdoutById.get(c.id), discovery160),
  );

  const holdoutRollup = { HOLDOUT_CONFIRMED: 0, HOLDOUT_WEAKENED: 0, HOLDOUT_ABSENT: 0, HOLDOUT_REFUTED: 0 };
  for (const r of holdoutResults) holdoutRollup[r.verdict] += 1;
  const e3Rollup = { E3_CANDIDATE_SURVIVES: 0, E3_NOT_MET: 0 };
  for (const r of e3) e3Rollup[r.verdict] += 1;

  return {
    status: "HOLDOUT_VALIDATED",
    frozenBeforeHoldout: true,
    holdoutSize: holdout.length,
    holdoutResults,
    holdoutRollup,
    e3Survival: e3,
    e3Rollup,
    survivors: e3.filter((r) => r.verdict === E3_VERDICT.SURVIVES).map((r) => r.candidateId),
  };
}

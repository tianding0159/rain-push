// Metric aggregation + acceptance evaluation + stop rules (PHASE 11-12).
//
// Two tiers, kept distinct per EVAL_RUBRIC.md:
//   - AUTO diagnostics (this file computes them from candidate text): rhythm/punctuation,
//     gptish hits, immediate-reversal density, affect co-activation. Diagnostic only — they
//     flag candidates, they do not by themselves pass/fail one.
//   - HUMAN blind eval (this file consumes externally-provided scores): the authority.
//
// Acceptance criteria and stop rules are evaluated here from BOTH tiers. Crucially, when the
// human blind-eval data is absent (as in a synthetic-only CI run), acceptance is reported as
// NOT_EVALUABLE for the human-dependent criteria — we never fabricate a pass. This encodes the
// directive's honesty requirement: no fidelity claim without blind-eval data.
//
// Zero runtime dependencies. Pure, deterministic.

import { rhythmMetrics } from "./rhythm.mjs";
import { gptishMetrics, immediateReversal } from "./gptish.mjs";

export const ACCEPTANCE_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_EVALUABLE: "NOT_EVALUABLE", // requires human blind-eval data that is absent
});

// Auto-diagnose a single candidate's text.
export function autoDiagnose(candidate) {
  const rhythm = rhythmMetrics(candidate);
  const gpt = gptishMetrics(candidate);
  const reversal = immediateReversal(candidate);
  return {
    ...rhythm,
    gptishHardBanHits: gpt.hardBanHitCount,
    gptishCandidateHits: gpt.candidateHitCount,
    immediateReversalDensity: reversal.density,
    immediateReversalOpportunities: reversal.opportunities,
  };
}

// Aggregate auto diagnostics for one arm across many candidates (mean per numeric key + total
// hard-ban hits, which must be zero for acceptance).
export function aggregateArmAuto(candidates) {
  const rows = candidates.map(autoDiagnose);
  const numericKeys = [
    "fullStopDensity", "ellipsisDensity", "quoteDensity", "messageFragmentRate",
    "singleCharacterMessageRate", "messageLengthVariance", "messageUnitCount",
    "immediateReversalDensity",
  ];
  const mean = {};
  for (const k of numericKeys) {
    const vals = rows.map((r) => r[k]);
    mean[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  return {
    count: rows.length,
    mean,
    gptishHardBanHitsTotal: rows.reduce((n, r) => n + r.gptishHardBanHits, 0),
    gptishCandidateHitsTotal: rows.reduce((n, r) => n + r.gptishCandidateHits, 0),
  };
}

// ---- Human blind-eval aggregation -----------------------------------------------------
//
// Resolved scores are [{ scenarioId, arm, score, dimensions? }] where score is an overall
// preference/quality number (higher better) and dimensions is an optional per-dimension map.
// winRate(D, A) = fraction of scenarios where D's score > A's score.

export function armMeanScore(resolvedScores, arm) {
  const xs = resolvedScores.filter((r) => r.arm === arm).map((r) => r.score);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// Head-to-head win rate of armX over armY across scenarios (ties excluded from wins).
export function winRate(resolvedScores, armX, armY) {
  const byScn = {};
  for (const r of resolvedScores) {
    (byScn[r.scenarioId] ||= {})[r.arm] = r.score;
  }
  let wins = 0;
  let comparable = 0;
  for (const scn of Object.values(byScn)) {
    if (typeof scn[armX] === "number" && typeof scn[armY] === "number") {
      comparable += 1;
      if (scn[armX] > scn[armY]) wins += 1;
    }
  }
  return comparable ? wins / comparable : null;
}

// ---- Acceptance + stop rules ----------------------------------------------------------
//
// input: {
//   armAuto: { A, B, C, D },              // aggregateArmAuto per arm (auto tier)
//   baselineRhythm,                       // corpus rhythm baseline (or null)
//   gate,                                 // evaluateSuiteGate result (spec tier)
//   human: {                              // optional; null when no blind eval yet
//     resolvedScores,                     // [{scenarioId, arm, score}]
//     mixedAffectPrimaryOpposingRate,     // fraction of mixed scenarios where evaluators saw primary+opposing
//     dMixedScore, cMixedScore,           // mixed-emotion dimension means
//     personaLeakageRate, threeTurnConsistencyRate,
//     dTemplateFeel, aTemplateFeel,       // template-feeling means (lower better)
//   }
// }
export function evaluateAcceptance(input) {
  const criteria = [];
  const add = (id, status, detail) => criteria.push({ id, status, detail });

  const human = input.human || null;
  const auto = input.armAuto || {};
  const gate = input.gate || null;

  // --- Auto-tier criteria (always evaluable when candidates exist) ---

  // "接住" hits must be zero across all arms.
  const totalHard = ["A", "B", "C", "D"].reduce((n, a) => n + (auto[a] ? auto[a].gptishHardBanHitsTotal : 0), 0);
  add("jiezhu_zero_hits", totalHard === 0 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL, `接住 hits = ${totalHard}`);

  // Severe false activation (spec) < 5%; severe FN (spec) < 10%.
  if (gate) {
    add("severe_false_activation_lt_5pct",
      gate.spec.falsePositiveRate < 0.05 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
      `spec FP rate = ${gate.spec.falsePositiveRate.toFixed(3)}`);
    add("severe_false_negative_lt_10pct",
      gate.spec.falseNegativeRate < 0.10 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
      `spec FN rate = ${gate.spec.falseNegativeRate.toFixed(3)}`);
  } else {
    add("severe_false_activation_lt_5pct", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no gate result");
    add("severe_false_negative_lt_10pct", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no gate result");
  }

  // Punctuation densities (D) not systematically higher than the corpus baseline.
  if (input.baselineRhythm && auto.D) {
    const worse = ["fullStopDensity", "ellipsisDensity", "quoteDensity"].filter(
      (k) => auto.D.mean[k] > (input.baselineRhythm.mean[k] || 0) * 1.15,
    );
    add("punctuation_not_above_corpus",
      worse.length === 0 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
      worse.length ? `above corpus: ${worse.join(",")}` : "within tolerance");
  } else {
    add("punctuation_not_above_corpus", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no corpus baseline");
  }

  // --- Human-tier criteria (NOT_EVALUABLE without blind eval) ---

  if (human && Array.isArray(human.resolvedScores) && human.resolvedScores.length) {
    const dVsA = winRate(human.resolvedScores, "D", "A");
    add("d_vs_a_winrate_gte_60pct",
      dVsA !== null && dVsA >= 0.60 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
      `D>A win rate = ${dVsA === null ? "n/a" : dVsA.toFixed(3)}`);

    if (typeof human.mixedAffectPrimaryOpposingRate === "number") {
      add("mixed_primary_opposing_identified_gte_80pct",
        human.mixedAffectPrimaryOpposingRate >= 0.80 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
        `rate = ${human.mixedAffectPrimaryOpposingRate.toFixed(3)}`);
    } else {
      add("mixed_primary_opposing_identified_gte_80pct", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no mixed-affect rate");
    }

    if (typeof human.dMixedScore === "number" && typeof human.cMixedScore === "number") {
      add("d_mixed_gt_c_mixed",
        human.dMixedScore > human.cMixedScore ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
        `D=${human.dMixedScore} C=${human.cMixedScore}`);
    } else {
      add("d_mixed_gt_c_mixed", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no mixed scores");
    }

    if (typeof human.personaLeakageRate === "number") {
      add("persona_leakage_lt_5pct",
        human.personaLeakageRate < 0.05 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
        `rate = ${human.personaLeakageRate.toFixed(3)}`);
    } else {
      add("persona_leakage_lt_5pct", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no leakage rate");
    }

    if (typeof human.threeTurnConsistencyRate === "number") {
      add("three_turn_consistency_gte_80pct",
        human.threeTurnConsistencyRate >= 0.80 ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
        `rate = ${human.threeTurnConsistencyRate.toFixed(3)}`);
    } else {
      add("three_turn_consistency_gte_80pct", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no consistency rate");
    }

    if (typeof human.dTemplateFeel === "number" && typeof human.aTemplateFeel === "number") {
      add("d_template_feel_not_worse_than_a",
        human.dTemplateFeel <= human.aTemplateFeel ? ACCEPTANCE_STATUS.PASS : ACCEPTANCE_STATUS.FAIL,
        `D=${human.dTemplateFeel} A=${human.aTemplateFeel}`);
    } else {
      add("d_template_feel_not_worse_than_a", ACCEPTANCE_STATUS.NOT_EVALUABLE, "no template-feel scores");
    }
  } else {
    for (const id of [
      "d_vs_a_winrate_gte_60pct",
      "mixed_primary_opposing_identified_gte_80pct",
      "d_mixed_gt_c_mixed",
      "persona_leakage_lt_5pct",
      "three_turn_consistency_gte_80pct",
      "d_template_feel_not_worse_than_a",
    ]) add(id, ACCEPTANCE_STATUS.NOT_EVALUABLE, "no human blind-eval data");
  }

  // --- Stop rules ---
  const stopRules = evaluateStopRules(human);

  const anyFail = criteria.some((c) => c.status === ACCEPTANCE_STATUS.FAIL);
  const anyNotEval = criteria.some((c) => c.status === ACCEPTANCE_STATUS.NOT_EVALUABLE);
  const overall = anyFail
    ? ACCEPTANCE_STATUS.FAIL
    : anyNotEval
      ? ACCEPTANCE_STATUS.NOT_EVALUABLE
      : ACCEPTANCE_STATUS.PASS;

  return { overall, criteria, stopRules };
}

// Stop rules from the directive. Returns recommendations, NOT pass/fail.
export function evaluateStopRules(human) {
  if (!human || !Array.isArray(human.resolvedScores) || !human.resolvedScores.length) {
    return { evaluable: false, note: "stop rules need human blind-eval data", recommendations: [] };
  }
  const dVsA = winRate(human.resolvedScores, "D", "A");
  const bVsD = winRate(human.resolvedScores, "B", "D");
  const recs = [];
  // D <= A  → do not expand; delete worthless layers; collapse to prompt+retrieval or smaller.
  if (dVsA !== null && dVsA <= 0.50) {
    recs.push({
      rule: "D_le_A",
      action: "DO_NOT_EXPAND_ARCHITECTURE",
      detail: "D is not beating A. Analyse the failure, delete the layers that earn nothing, collapse to prompt+retrieval or smaller.",
    });
  }
  // B >= D  → the deterministic engine may add no value; recommend reduction.
  if (bVsD !== null && bVsD >= 0.50) {
    recs.push({
      rule: "B_ge_D",
      action: "RECOMMEND_ENGINE_REDUCTION",
      detail: "Prompt+retrieval matches or beats the engine arm. The deterministic engine may add no value — report reduction options rather than hiding it.",
    });
  }
  return { evaluable: true, dVsA, bVsD, recommendations: recs };
}

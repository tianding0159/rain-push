import test from "node:test";
import assert from "node:assert/strict";

import {
  autoDiagnose,
  aggregateArmAuto,
  armMeanScore,
  winRate,
  evaluateAcceptance,
  evaluateStopRules,
  ACCEPTANCE_STATUS,
} from "../lib/metrics.mjs";

test("autoDiagnose surfaces rhythm + gptish + reversal in one object", () => {
  const d = autoDiagnose(["我好想你……才怪", "接住你的情绪"]);
  assert.ok(d.gptishHardBanHits >= 1);
  assert.ok(d.immediateReversalDensity >= 0);
  assert.ok(typeof d.fullStopDensity === "number");
});

test("aggregateArmAuto totals hard-ban hits across candidates", () => {
  const agg = aggregateArmAuto([["接住"], ["clean 你好"], ["把你接住"]]);
  assert.equal(agg.count, 3);
  assert.ok(agg.gptishHardBanHitsTotal >= 2);
});

test("winRate computes head-to-head fraction", () => {
  const scores = [
    { scenarioId: "s1", arm: "D", score: 5 }, { scenarioId: "s1", arm: "A", score: 3 },
    { scenarioId: "s2", arm: "D", score: 2 }, { scenarioId: "s2", arm: "A", score: 4 },
    { scenarioId: "s3", arm: "D", score: 5 }, { scenarioId: "s3", arm: "A", score: 1 },
  ];
  assert.equal(winRate(scores, "D", "A"), 2 / 3);
  assert.equal(armMeanScore(scores, "D"), 4);
});

test("acceptance: 接住 hit anywhere fails the jiezhu criterion", () => {
  const armAuto = {
    A: aggregateArmAuto([["clean"]]),
    B: aggregateArmAuto([["clean"]]),
    C: aggregateArmAuto([["clean"]]),
    D: aggregateArmAuto([["接住你的情绪"]]),
  };
  const res = evaluateAcceptance({ armAuto });
  const jz = res.criteria.find((c) => c.id === "jiezhu_zero_hits");
  assert.equal(jz.status, ACCEPTANCE_STATUS.FAIL);
});

test("acceptance: with no human data, human criteria are NOT_EVALUABLE and overall is not PASS", () => {
  const clean = aggregateArmAuto([["你好啊", "早点回来"]]);
  const res = evaluateAcceptance({ armAuto: { A: clean, B: clean, C: clean, D: clean } });
  const dva = res.criteria.find((c) => c.id === "d_vs_a_winrate_gte_60pct");
  assert.equal(dva.status, ACCEPTANCE_STATUS.NOT_EVALUABLE);
  assert.notEqual(res.overall, ACCEPTANCE_STATUS.PASS, "must never PASS without human blind eval");
});

test("acceptance: gate FP/FN criteria read the spec gate result", () => {
  const clean = aggregateArmAuto([["你好"]]);
  const gate = { spec: { falsePositiveRate: 0.0, falseNegativeRate: 0.0 } };
  const res = evaluateAcceptance({ armAuto: { A: clean, B: clean, C: clean, D: clean }, gate });
  assert.equal(res.criteria.find((c) => c.id === "severe_false_activation_lt_5pct").status, ACCEPTANCE_STATUS.PASS);
  assert.equal(res.criteria.find((c) => c.id === "severe_false_negative_lt_10pct").status, ACCEPTANCE_STATUS.PASS);
});

test("stop rule D<=A fires DO_NOT_EXPAND_ARCHITECTURE", () => {
  const scores = [
    { scenarioId: "s1", arm: "D", score: 1 }, { scenarioId: "s1", arm: "A", score: 5 },
    { scenarioId: "s2", arm: "D", score: 2 }, { scenarioId: "s2", arm: "A", score: 4 },
  ];
  const sr = evaluateStopRules({ resolvedScores: scores });
  assert.ok(sr.recommendations.some((r) => r.action === "DO_NOT_EXPAND_ARCHITECTURE"));
});

test("stop rule B>=D fires RECOMMEND_ENGINE_REDUCTION", () => {
  const scores = [
    { scenarioId: "s1", arm: "B", score: 5 }, { scenarioId: "s1", arm: "D", score: 3 },
    { scenarioId: "s2", arm: "B", score: 4 }, { scenarioId: "s2", arm: "D", score: 2 },
  ];
  const sr = evaluateStopRules({ resolvedScores: scores });
  assert.ok(sr.recommendations.some((r) => r.action === "RECOMMEND_ENGINE_REDUCTION"));
});

test("stop rules are not evaluable without human data", () => {
  assert.equal(evaluateStopRules(null).evaluable, false);
  assert.equal(evaluateStopRules({ resolvedScores: [] }).evaluable, false);
});

test("acceptance: a full human dataset that meets thresholds can PASS", () => {
  const clean = aggregateArmAuto([["你好啊", "早点回来嘛"]]);
  const resolvedScores = [];
  for (let i = 0; i < 10; i += 1) {
    resolvedScores.push({ scenarioId: `s${i}`, arm: "D", score: 5 });
    resolvedScores.push({ scenarioId: `s${i}`, arm: "A", score: 2 });
    resolvedScores.push({ scenarioId: `s${i}`, arm: "C", score: 3 });
    resolvedScores.push({ scenarioId: `s${i}`, arm: "B", score: 3 });
  }
  const res = evaluateAcceptance({
    armAuto: { A: clean, B: clean, C: clean, D: clean },
    gate: { spec: { falsePositiveRate: 0, falseNegativeRate: 0 } },
    baselineRhythm: { mean: { fullStopDensity: 1, ellipsisDensity: 1, quoteDensity: 1 } },
    human: {
      resolvedScores,
      mixedAffectPrimaryOpposingRate: 0.9,
      dMixedScore: 4.5, cMixedScore: 3.0,
      personaLeakageRate: 0.0,
      threeTurnConsistencyRate: 0.9,
      dTemplateFeel: 1.5, aTemplateFeel: 2.5,
    },
  });
  assert.equal(res.overall, ACCEPTANCE_STATUS.PASS, JSON.stringify(res.criteria.filter((c) => c.status !== "PASS")));
});

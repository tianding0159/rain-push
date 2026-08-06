import test from "node:test";
import assert from "node:assert/strict";

import {
  loadGptishPolicy,
  hardBanHits,
  hardBanHitCount,
  candidateHits,
  gptishMetrics,
  immediateReversal,
  aggregateReversal,
} from "../lib/gptish.mjs";

test("policy loads with hardBan and candidate arrays", () => {
  const p = loadGptishPolicy();
  assert.ok(p.hardBan.includes("接住"));
  assert.ok(p.candidate.includes("我会一直在这里"));
});

test("接住 in any form is a hard-ban hit; clean text is zero", () => {
  assert.ok(hardBanHitCount(["我会接住你的情绪"]) >= 1);
  assert.ok(hardBanHitCount(["有人接住你了"]) >= 1);
  assert.ok(hardBanHitCount(["把你接住"]) >= 1);
  assert.ok(hardBanHitCount(["被稳稳接住"]) >= 1);
  assert.ok(hardBanHitCount(["我就是接住"]) >= 1);
  assert.equal(hardBanHitCount(["你今天怎么这么慢啊", "快点回我"]), 0);
});

test("hardBanHits reports the phrase and count", () => {
  const hits = hardBanHits(["接住你的情绪，我会把你接住"]);
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => typeof h.count === "number" && h.count >= 1));
});

test("candidate phrases are counted, not banned", () => {
  const hits = candidateHits(["我会一直在这里，你值得被好好爱"]);
  const phrases = hits.map((h) => h.phrase);
  assert.ok(phrases.includes("我会一直在这里"));
  assert.ok(phrases.includes("你值得被好好爱"));
});

test("gptishMetrics separates hard-ban from candidate counts", () => {
  const m = gptishMetrics(["我会一直在这里", "接住你的情绪"]);
  assert.ok(m.hardBanHitCount >= 1);
  assert.ok(m.candidateHitCount >= 1);
});

test("immediate reversal: same-unit negation fires", () => {
  const r = immediateReversal(["我好想你……才怪"]);
  assert.equal(r.opportunities, 1);
  assert.equal(r.reversals, 1);
  assert.equal(r.density, 1);
});

test("immediate reversal: adjacent-unit negation fires", () => {
  const r = immediateReversal(["我好想你", "算了当我没说"]);
  assert.equal(r.opportunities, 1);
  assert.equal(r.reversals, 1);
});

test("a positive expression with NO reversal is an opportunity but not a reversal", () => {
  const r = immediateReversal(["我好想你", "你今天早点回来"]);
  assert.equal(r.opportunities, 1);
  assert.equal(r.reversals, 0);
  assert.equal(r.density, 0);
});

test("text with no positive marker has zero opportunities and zero density", () => {
  const r = immediateReversal(["把报告发我", "几点开会"]);
  assert.equal(r.opportunities, 0);
  assert.equal(r.density, 0);
});

test("aggregateReversal produces a baseline density over candidates", () => {
  const candidates = [
    ["我好想你……才怪"],      // reversal
    ["我好想你", "早点回来"],   // opportunity, no reversal
    ["把报告发我"],            // no opportunity
  ];
  const agg = aggregateReversal(candidates);
  assert.equal(agg.opportunities, 2);
  assert.equal(agg.reversals, 1);
  assert.equal(agg.density, 0.5);
});

test("diagnostics are deterministic", () => {
  const c = ["我好想你……才怪", "接住你的情绪"];
  assert.deepEqual(gptishMetrics(c), gptishMetrics(c));
  assert.deepEqual(immediateReversal(c), immediateReversal(c));
});

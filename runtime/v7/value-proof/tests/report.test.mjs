import test from "node:test";
import assert from "node:assert/strict";

import { runPipeline } from "../bin/run-value-proof.mjs";
import { serialize } from "../lib/report.mjs";

test("pipeline runs end-to-end on synthetic fixtures and is deterministic (byte-identical)", () => {
  const a = runPipeline();
  const b = runPipeline();
  assert.equal(serialize(a.reports.proof), serialize(b.reports.proof));
  assert.equal(serialize(a.reports.gate), serialize(b.reports.gate));
  assert.equal(serialize(a.reports.blind), serialize(b.reports.blind));
  assert.equal(serialize(a.reports.perArm), serialize(b.reports.perArm));
});

test("with no private corpus, the proof makes NO fidelity claim", () => {
  const { reports } = runPipeline();
  const p = reports.proof;
  assert.equal(p.usedRealPrivateCorpus, false);
  assert.equal(p.blindEvalDone, false);
  assert.equal(p.acceptanceOverall, "NOT_EVALUABLE");
  assert.ok(p.honesty.syntheticOnly.length > 0);
  assert.ok(p.honesty.blocked.includes("human blind eval"));
});

test("blind-eval pack in the report leaks no arm label", () => {
  const { reports } = runPipeline();
  const s = serialize(reports.blind);
  assert.ok(!/"arm"\s*:/.test(s), "no arm field may appear in the blind pack");
  assert.ok(!/"expectation"\s*:/.test(s));
  // every candidate slot is anonymous
  for (const pack of reports.blind.packs) {
    for (const c of pack.candidates) assert.ok(/^cand_\d+$/.test(c.slot));
  }
});

test("no report contains synthetic verbatim placeholder text from the retrieval corpus", () => {
  const { reports } = runPipeline();
  const all = serialize(reports.perArm) + serialize(reports.source) + serialize(reports.blind) + serialize(reports.gate);
  assert.ok(!all.includes("placeholder"), "retrieval verbatim (placeholder) must not appear in any report");
});

test("severe gate report: spec has zero FP/FN; engine shows the pinned FN gap", () => {
  const { reports } = runPipeline();
  const g = reports.gate;
  assert.equal(g.spec.falsePositive, 0);
  assert.equal(g.spec.falseNegative, 0);
  assert.equal(g.engine.falseNegative, g.severeCount);
  assert.ok(g.severeCount >= 1);
});

test("per-arm report has all four arms and zero 接住 hits from the stub", () => {
  const { reports } = runPipeline();
  for (const arm of ["A", "B", "C", "D"]) {
    assert.ok(reports.perArm.arms[arm], `arm ${arm} missing`);
    assert.equal(reports.perArm.arms[arm].gptishHardBanHitsTotal, 0);
  }
});

test("source-layer influence report aggregates retrieval distribution", () => {
  const { reports } = runPipeline();
  assert.equal(reports.source.kind, "sourceLayerInfluence");
  assert.ok(typeof reports.source.meanC3Influence === "number");
});

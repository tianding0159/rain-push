import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { evaluateHypotheses, HYP_RESULT } from "../lib/hypotheses.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYN = join(HERE, "..", "fixtures", "synthetic");

function annotations() {
  return readJson(join(SYN, "annotations-round1.json")).annotations;
}

test("evaluateHypotheses returns all of H1..H7 with a result + sampleCount", () => {
  const h = evaluateHypotheses(annotations());
  for (const k of ["H1", "H2", "H3", "H4", "H5", "H6", "H7"]) {
    assert.ok(h[k], `missing ${k}`);
    assert.ok("result" in h[k]);
    assert.ok("sampleCount" in h[k]);
    assert.ok(Object.values(HYP_RESULT).includes(h[k].result), `bad result for ${k}: ${h[k].result}`);
  }
});

test("empty annotation set → every hypothesis is not_evaluable", () => {
  const h = evaluateHypotheses([]);
  for (const k of ["H1", "H2", "H3", "H4", "H5", "H6", "H7"]) {
    assert.equal(h[k].result, HYP_RESULT.NOT_EVALUABLE, `${k} should be not_evaluable`);
    assert.equal(h[k].sampleCount, 0);
  }
});

test("H5 (persona surface) is not_evaluable on single-sided pilot data (no surface tag)", () => {
  const h = evaluateHypotheses(annotations());
  assert.equal(h.H5.result, HYP_RESULT.NOT_EVALUABLE);
});

test("below-min-sample hypotheses are not_evaluable, not falsely 'unsupported'", () => {
  // Only 4 evidential attention records → below MIN_SAMPLES_EVALUABLE(5) for an A/B-gated H.
  const few = annotations().slice(0, 4);
  const h = evaluateHypotheses(few);
  // At least the A/B-gated hypotheses must be not_evaluable with so few samples.
  assert.equal(h.H4.result, HYP_RESULT.NOT_EVALUABLE);
});

test("§6: C_designed_inference records are excluded from EVERY hypothesis statistic", () => {
  const base = annotations();
  // Baseline counts (fixtures include C_designed_inference rows).
  const withC = evaluateHypotheses(base);
  // Manually strip C rows and re-evaluate: results must be identical, proving C never counted.
  const withoutC = evaluateHypotheses(base.filter((a) => a.affect?.concurrencyClass !== "C_designed_inference"));
  for (const k of ["H1", "H2", "H3", "H4", "H5", "H6", "H7"]) {
    assert.equal(withC[k].sampleCount, withoutC[k].sampleCount, `${k} sampleCount must ignore C rows`);
    assert.equal(withC[k].supportCount, withoutC[k].supportCount, `${k} supportCount must ignore C rows`);
    assert.equal(withC[k].result, withoutC[k].result, `${k} result must ignore C rows`);
  }
  // And prove the fixture actually contains C rows (otherwise the test is vacuous).
  assert.ok(base.some((a) => a.affect?.concurrencyClass === "C_designed_inference"), "fixture must contain C rows");
});

test("supportingHashes are sorted and drawn from the input records", () => {
  const anns = annotations();
  const h = evaluateHypotheses(anns);
  const known = new Set(anns.map((a) => a.recordHash));
  for (const k of ["H1", "H2", "H3", "H4", "H6", "H7"]) {
    const hs = h[k].supportingHashes || [];
    const sorted = hs.slice().sort();
    assert.deepEqual(hs, sorted, `${k} supportingHashes must be sorted`);
    for (const x of hs) assert.ok(known.has(x), `${k} references an unknown record hash`);
  }
});

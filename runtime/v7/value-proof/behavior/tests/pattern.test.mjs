import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { validatePattern, validatePatternBatch, supportedGrade, MIN_E3_SUPPORT } from "../lib/pattern.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYN = join(HERE, "..", "fixtures", "synthetic");

function patterns() {
  return readJson(join(SYN, "patterns.json")).patterns;
}

test("well-supported reviewed pattern (BP-001) holds at E3 and is eligibleForBehaviorRule", () => {
  const p = patterns().find((x) => x.patternId === "BP-001");
  const r = validatePattern(p);
  assert.equal(r.valid, true, `schema errors: ${JSON.stringify(r.schemaErrors)}`);
  assert.equal(r.supportedGrade, "E3");
  assert.equal(r.downgraded, false);
  assert.equal(r.eligibleForBehaviorRule, true);
});

test("under-supported claimed-E3 pattern (BP-002) downgrades and is NOT eligible", () => {
  const p = patterns().find((x) => x.patternId === "BP-002");
  const r = validatePattern(p);
  assert.equal(r.claimedGrade, "E3");
  assert.equal(r.supportedGrade, "E2");
  assert.equal(r.downgraded, true);
  assert.equal(r.eligibleForBehaviorRule, false);
  assert.ok(r.gaps.length > 0, "downgrade must report the gap");
});

test("eligibility requires reviewStatus==='reviewed' even when the grade is high enough", () => {
  const p = patterns().find((x) => x.patternId === "BP-001");
  const notReviewed = { ...p, reviewStatus: "candidate" };
  const r = validatePattern(notReviewed);
  assert.equal(r.supportedGrade, "E3", "grade unchanged");
  assert.equal(r.eligibleForBehaviorRule, false, "unreviewed pattern must not inform rules");
});

test("supportedGrade caps at E3 when crossClusterCount < 2 (E4 unreachable)", () => {
  const p = patterns().find((x) => x.patternId === "BP-001");
  const strongButSingleCluster = { ...p, crossClusterCount: 1, supportingRecordHashes: p.supportingRecordHashes.slice(0, MIN_E3_SUPPORT) };
  assert.equal(supportedGrade(strongButSingleCluster), "E3");
});

test("batch summary counts schemaValid / e3plus / eligible correctly", () => {
  const b = validatePatternBatch(patterns());
  assert.equal(b.total, 2);
  assert.equal(b.schemaValid, 2);
  assert.equal(b.e3plus, 1);
  assert.equal(b.eligibleForBehaviorRule, 1);
});

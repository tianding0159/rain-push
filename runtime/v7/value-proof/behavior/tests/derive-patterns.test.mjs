import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { derivePatterns } from "../lib/derive-patterns.mjs";
import { validatePatternBatch } from "../lib/pattern.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYN = join(HERE, "..", "fixtures", "synthetic");

function anns() {
  return readJson(join(SYN, "annotations-round1.json")).annotations;
}

test("derivePatterns emits schema-valid patterns for every cluster", () => {
  const { patterns } = derivePatterns(anns(), { round: 1 });
  assert.ok(patterns.length > 0);
  const b = validatePatternBatch(patterns);
  assert.equal(b.schemaValid, b.total, "all derived patterns must satisfy the pattern schema");
});

test("C_designed_inference records are EXCLUDED from support counts (§6)", () => {
  const { meta } = derivePatterns(anns(), { round: 1 });
  assert.ok(meta.excludedDesignedInference > 0, "fixture includes designed-inference rows");
  assert.equal(meta.annotationsScored, meta.annotationsIn ? (anns().filter((a) => (a.round ?? 1) === 1 && a.affect?.concurrencyClass !== "C_designed_inference").length) : 0);
});

test("offline derivation never claims a pattern is 'reviewed' (canon requires a human)", () => {
  const { patterns } = derivePatterns(anns(), { round: 1 });
  for (const p of patterns) assert.notEqual(p.reviewStatus, "reviewed");
  const b = validatePatternBatch(patterns);
  assert.equal(b.eligibleForBehaviorRule, 0, "nothing derived offline may be rule-eligible");
});

test("derived patterns carry supporting HASHES only — no verbatim text field", () => {
  const { patterns } = derivePatterns(anns(), { round: 1 });
  const blob = JSON.stringify(patterns);
  assert.ok(!blob.includes("「") && !blob.includes("」"), "no utterance brackets");
  for (const p of patterns) assert.ok(!("text" in p), "pattern must not carry text");
});

test("patterns are deterministically ordered (by support desc, then key)", () => {
  const a = derivePatterns(anns(), { round: 1 }).patterns.map((p) => p.patternId);
  const b = derivePatterns(anns(), { round: 1 }).patterns.map((p) => p.patternId);
  assert.deepEqual(a, b);
  assert.deepEqual(a, a.slice().sort()); // BP-001, BP-002, ... contiguous
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runArms } from "../lib/arms.mjs";
import { loadScenarios } from "../lib/scenarios.mjs";
import {
  packScenario,
  packSuite,
  assertNoLabelLeak,
  resolveScores,
} from "../lib/blind-pack.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
function retrievalCorpus() {
  const raw = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "synthetic", "retrieval-corpus.json"), "utf8"));
  return { registry: raw.registry.sources, events: raw.events };
}
function aScenario() {
  return loadScenarios().find((s) => s.scenarioId === "scn_ord_generic_feedback");
}

test("pack presents 4 anonymous slots and leaks no arm label", () => {
  const scn = aScenario();
  const run = runArms(scn, retrievalCorpus());
  const { pack } = packScenario(run, scn);
  assert.equal(pack.candidates.length, 4);
  assert.ok(pack.candidates.every((c) => /^cand_\d+$/.test(c.slot)));
  assertNoLabelLeak(pack); // throws on leak
});

test("the key maps every slot back to a distinct arm", () => {
  const scn = aScenario();
  const run = runArms(scn, retrievalCorpus());
  const { key } = packScenario(run, scn);
  const arms = Object.values(key.mapping).sort();
  assert.deepEqual(arms, ["A", "B", "C", "D"]);
});

test("shuffle is deterministic for a given scenario+salt, and different across scenarios", () => {
  const corpus = retrievalCorpus();
  const scn = aScenario();
  const p1 = packScenario(runArms(scn, corpus), scn);
  const p2 = packScenario(runArms(scn, corpus), scn);
  assert.equal(JSON.stringify(p1.key.mapping), JSON.stringify(p2.key.mapping), "same scenario must pack identically");

  const other = loadScenarios().find((s) => s.scenarioId === "scn_mix_bright_dark");
  const p3 = packScenario(runArms(other, corpus), other);
  // Different scenarioId seeds a different shuffle (not guaranteed different, but for these two it is).
  assert.notEqual(JSON.stringify(p1.key.mapping), JSON.stringify(p3.key.mapping));
});

test("evaluator pack does not contain retrieval refs, prompt, or engine internals", () => {
  const scn = aScenario();
  const { pack } = packScenario(runArms(scn, retrievalCorpus()), scn);
  const s = JSON.stringify(pack);
  assert.ok(!/references/.test(s));
  assert.ok(!/CHARACTER_PROMPT|deterministic-engine-plan/.test(s));
  assert.ok(!/"prompt"/.test(s));
});

test("packSuite packs every scenario and asserts no leak across the suite", () => {
  const corpus = retrievalCorpus();
  const suite = loadScenarios();
  const byId = Object.fromEntries(suite.map((s) => [s.scenarioId, s]));
  const runs = suite.map((s) => runArms(s, corpus));
  const { packs, keys } = packSuite(runs, byId);
  assert.equal(packs.length, suite.length);
  assert.equal(keys.length, suite.length);
  for (const p of packs) assertNoLabelLeak(p);
});

test("resolveScores joins slot scores back to arms via the key", () => {
  const scn = aScenario();
  const { key } = packScenario(runArms(scn, retrievalCorpus()), scn);
  const scores = Object.keys(key.mapping).map((slot, i) => ({ scenarioId: scn.scenarioId, slot, score: i + 1 }));
  const resolved = resolveScores(scores, [key]);
  assert.equal(resolved.length, 4);
  assert.ok(resolved.every((r) => ["A", "B", "C", "D"].includes(r.arm)));
});

test("assertNoLabelLeak throws when an arm field is present", () => {
  const leaky = { scenarioId: "x", pTurns: [], candidates: [{ slot: "cand_1", messages: ["y"], arm: "A" }] };
  assert.throws(() => assertNoLabelLeak(leaky));
});

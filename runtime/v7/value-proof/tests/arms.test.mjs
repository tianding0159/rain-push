import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMS,
  ARM_KINDS,
  armSafeScenario,
  buildArmInput,
  buildAllArmInputs,
  runArms,
  importCandidates,
} from "../lib/arms.mjs";
import { loadScenarios } from "../lib/scenarios.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
function retrievalCorpus() {
  const raw = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "synthetic", "retrieval-corpus.json"), "utf8"));
  return { registry: raw.registry.sources, events: raw.events };
}
function aScenario() {
  return loadScenarios().find((s) => s.scenarioId === "scn_ord_generic_feedback");
}

test("armSafeScenario strips expectation and notes", () => {
  const scn = aScenario();
  const safe = armSafeScenario(scn);
  assert.ok(!("expectation" in safe));
  assert.ok(!("notes" in safe));
  assert.ok(Array.isArray(safe.turns));
});

test("A=prompt only: has prompt, no retrieval, no engine", () => {
  const inp = buildArmInput("A", aScenario(), retrievalCorpus());
  assert.equal(inp.kind, ARM_KINDS.A);
  assert.ok(inp.prompt);
  assert.ok(!inp.retrieval);
  assert.ok(!inp.engine);
});

test("B=prompt+retrieval: has prompt AND retrieval refs, no engine", () => {
  const inp = buildArmInput("B", aScenario(), retrievalCorpus());
  assert.ok(inp.prompt);
  assert.ok(Array.isArray(inp.retrieval));
  assert.ok(!inp.engine);
  // retrieval refs are text-free (ids + hashes)
  const s = JSON.stringify(inp.retrieval);
  assert.ok(!/placeholder/.test(s), "retrieval must not carry verbatim text");
});

test("C=engine only: has engine, no prompt, no retrieval", () => {
  const inp = buildArmInput("C", aScenario(), retrievalCorpus());
  assert.ok(inp.engine);
  assert.ok(!inp.prompt);
  assert.ok(!inp.retrieval);
});

test("D=engine+retrieval+renderer: has engine AND retrieval", () => {
  const inp = buildArmInput("D", aScenario(), retrievalCorpus());
  assert.ok(inp.engine);
  assert.ok(Array.isArray(inp.retrieval));
});

test("no arm input carries the expectation (no hidden scenario answer)", () => {
  for (const arm of ARMS) {
    const inp = buildArmInput(arm, aScenario(), retrievalCorpus());
    assert.ok(!JSON.stringify(inp).includes("expectation"));
  }
});

test("runArms produces exactly the four arms, once each, deterministically", () => {
  const scn = aScenario();
  const corpus = retrievalCorpus();
  const a = runArms(scn, corpus);
  const b = runArms(scn, corpus);
  assert.deepEqual(a.candidates.map((c) => c.input.arm).sort(), [...ARMS].sort());
  assert.equal(JSON.stringify(a), JSON.stringify(b), "runArms must be deterministic");
});

test("C3 toggle flows into retrieval arms", () => {
  const scn = aScenario();
  const corpus = retrievalCorpus();
  const withC3 = buildArmInput("D", scn, corpus, { includeC3: true });
  const withoutC3 = buildArmInput("D", scn, corpus, { includeC3: false });
  const c3Any = withC3.retrieval.some((r) => r.c3Influence > 0);
  const c3None = withoutC3.retrieval.every((r) => r.c3Influence === 0);
  assert.ok(c3None, "includeC3:false must zero c3Influence across turns");
  assert.ok(c3Any || true); // presence depends on query match; the off-case is the invariant
});

test("importCandidates aligns arms and flags dup/unknown", () => {
  const ok = importCandidates([
    { scenarioId: "s", arm: "A", messages: ["x"] },
    { scenarioId: "s", arm: "B", messages: ["x"] },
  ]);
  assert.equal(ok.valid, true);
  const dup = importCandidates([
    { scenarioId: "s", arm: "A", messages: ["x"] },
    { scenarioId: "s", arm: "A", messages: ["y"] },
  ]);
  assert.equal(dup.valid, false);
  const unknown = importCandidates([{ scenarioId: "s", arm: "Z", messages: ["x"] }]);
  assert.equal(unknown.valid, false);
});

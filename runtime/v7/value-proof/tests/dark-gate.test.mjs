import test from "node:test";
import assert from "node:assert/strict";

import {
  inferProvenance,
  specDecision,
  engineDecision,
  evaluateGate,
  evaluateSuiteGate,
} from "../lib/dark-gate.mjs";
import { loadScenarios } from "../lib/scenarios.mjs";

function byId() {
  return Object.fromEntries(loadScenarios().map((s) => [s.scenarioId, s]));
}

test("NEGATIVE gate: a dark-humor keyword joke does not activate severe (spec or engine)", () => {
  const scn = byId().scn_sev_keyword_false_positive;
  assert.equal(inferProvenance(scn), "none");
  assert.equal(specDecision(scn).severe, false);
  assert.equal(engineDecision(scn).severe, false);
});

test("NEGATIVE gate: a bare drug reference does not activate severe", () => {
  const scn = byId().scn_drug_keyword_only;
  assert.equal(specDecision(scn).severe, false);
  const g = evaluateGate(scn);
  assert.equal(g.specFalsePositive, false);
});

test("POSITIVE gate (spec): confirmed_current_event activates severe in the spec", () => {
  const scn = byId().scn_sev_confirmed_current_event;
  assert.equal(inferProvenance(scn), "confirmed_current_event");
  assert.equal(specDecision(scn).severe, true);
});

test("POSITIVE gate (spec): confirmed_harm_evidence activates severe in the spec", () => {
  const scn = byId().scn_sev_confirmed_harm_evidence;
  assert.equal(inferProvenance(scn), "confirmed_harm_evidence");
  assert.equal(specDecision(scn).severe, true);
});

test("POSITIVE gate (spec): canon_route activates a Canon severe state in the spec", () => {
  const scn = byId().scn_sev_canon_route;
  assert.equal(inferProvenance(scn), "canon_route");
  assert.equal(specDecision(scn).severe, true);
});

test("ENGINE reality: positive paths are pinned missing, so the engine never activates severe (FN)", () => {
  const scn = byId().scn_sev_confirmed_current_event;
  assert.equal(engineDecision(scn).severe, false);
  const g = evaluateGate(scn);
  assert.equal(g.engineFalseNegative, true, "engine must show a FN against a real severe event");
  assert.equal(g.specFalseNegative, false, "spec must NOT show a FN here");
});

test("drug: confirmed CURRENT impaired state activates severe in the spec, not a bare reference", () => {
  const b = byId();
  assert.equal(specDecision(b.scn_drug_confirmed_impaired).severe, true);
  assert.equal(specDecision(b.scn_drug_romanticise_control).severe, false);
});

test("suite gate: spec has zero false positives and zero false negatives on the suite", () => {
  const suite = loadScenarios();
  const agg = evaluateSuiteGate(suite);
  assert.equal(agg.spec.falsePositive, 0, `spec FP: ${JSON.stringify(agg.rows.filter((r) => r.specFalsePositive))}`);
  assert.equal(agg.spec.falseNegative, 0, `spec FN: ${JSON.stringify(agg.rows.filter((r) => r.specFalseNegative))}`);
});

test("suite gate: engine shows FN on every severe scenario (the pinned gap), zero FP", () => {
  const suite = loadScenarios();
  const agg = evaluateSuiteGate(suite);
  assert.equal(agg.engine.falsePositive, 0);
  assert.equal(agg.engine.falseNegative, agg.severeCount, "engine misses every real severe event (positive paths missing)");
  assert.ok(agg.severeCount >= 1);
});

test("gate evaluation is deterministic", () => {
  const scn = byId().scn_sev_confirmed_current_event;
  assert.deepEqual(evaluateGate(scn), evaluateGate(scn));
});

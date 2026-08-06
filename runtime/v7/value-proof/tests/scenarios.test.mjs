import test from "node:test";
import assert from "node:assert/strict";

import {
  loadScenarios,
  validateSuite,
  validateScenario,
  scenarioQueries,
  SUITE_MIN_SCENARIOS,
  SUITE_MIN_TURNS,
} from "../lib/scenarios.mjs";
import { scenarioTypeIds } from "../lib/scenario-policy.mjs";

test("the committed suite validates: >=30 scenarios, all types covered, no problems", () => {
  const suite = loadScenarios();
  const r = validateSuite(suite);
  assert.ok(r.valid, `problems: ${JSON.stringify(r.problems)}`);
  assert.ok(r.count >= SUITE_MIN_SCENARIOS, `count ${r.count} < ${SUITE_MIN_SCENARIOS}`);
  for (const t of scenarioTypeIds()) assert.ok(r.byType[t] >= 1, `type ${t} not covered`);
});

test("every scenario has >=3 turns with contiguous orders", () => {
  const suite = loadScenarios();
  for (const scn of suite) {
    assert.ok(scn.turns.length >= SUITE_MIN_TURNS, `${scn.scenarioId} has <3 turns`);
    const orders = scn.turns.map((t) => t.order);
    assert.deepEqual([...orders].sort((a, b) => a - b), orders.map((_, i) => i + 1));
  }
});

test("an unknown scenario type is rejected", () => {
  const bad = { scenarioId: "scn_bad", type: "nonsense", channel: "jine", mode: "living",
    turns: [{ order: 1, pInput: "a" }, { order: 2, pInput: "b" }, { order: 3, pInput: "c" }] };
  assert.equal(validateScenario(bad).valid, false);
});

test("a scenario with too few turns is rejected by schema minItems", () => {
  const bad = { scenarioId: "scn_short", type: "ordinary", channel: "jine", mode: "living",
    turns: [{ order: 1, pInput: "a" }] };
  assert.equal(validateScenario(bad).valid, false);
});

test("severe positive-gate scenarios carry a severeActivationPath; the FP control does not activate", () => {
  const suite = loadScenarios();
  const byId = Object.fromEntries(suite.map((s) => [s.scenarioId, s]));
  assert.equal(byId.scn_sev_confirmed_current_event.expectation.severeShouldActivate, true);
  assert.equal(byId.scn_sev_confirmed_current_event.expectation.severeActivationPath, "confirmed_current_event");
  assert.equal(byId.scn_sev_keyword_false_positive.expectation.severeShouldActivate, false);
});

test("scenarioQueries accumulates prior P inputs and carries channel/mode", () => {
  const suite = loadScenarios();
  const q = scenarioQueries(suite[0]);
  assert.equal(q.length, suite[0].turns.length);
  assert.equal(q[0].channel, suite[0].channel);
  assert.ok(q[q.length - 1].text.includes(suite[0].turns[0].pInput));
});

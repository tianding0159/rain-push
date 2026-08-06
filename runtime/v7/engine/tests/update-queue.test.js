import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/state.js";
import { commitUpdateQueues, validateUpdate } from "../src/update-queue.js";

test("valid update commits inside its runtime model", () => {
  const state = createInitialState();
  const update = {
    runtime: "language",
    path: "counters.private_direct",
    operation: "increment",
    delta: 1,
    confidence: 0.9,
    policy: "immediate",
    evidenceRefs: ["event-1"]
  };

  const result = commitUpdateQueues(state, [update], "living");
  assert.equal(result.committed.length, 1);
  assert.equal(state.models.language.counters.private_direct, 1);
});

test("cross-runtime and over-cap updates are rejected", () => {
  const state = createInitialState();
  const forbidden = {
    runtime: "language",
    path: "behavior_model.message_budget",
    operation: "set",
    value: 99,
    confidence: 1,
    policy: "immediate",
    evidenceRefs: ["event-1"]
  };
  const overCap = {
    runtime: "language",
    path: "counters.bad",
    operation: "increment",
    delta: 99,
    confidence: 1,
    policy: "immediate",
    evidenceRefs: ["event-1"]
  };

  assert.equal(validateUpdate(forbidden).status, "reject");
  const result = commitUpdateQueues(state, [forbidden, overCap], "living");
  assert.equal(result.rejected.length, 2);
  assert.equal(state.models.language.counters.bad, undefined);
});

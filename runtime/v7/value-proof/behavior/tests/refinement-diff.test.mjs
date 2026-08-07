import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDualStatus,
  buildChangeLog,
  GRAMMAR_DISCOVERY_STATUS,
  GUIDE_STATUS,
} from "../lib/refinement-diff.mjs";

// --- minimal, stable inputs so the grammar-discovery verdict stays SUCCESSFUL and we isolate the
//     annotation-guide (churn) branch under test. ---
function stableDiff(overrides = {}) {
  return {
    hypothesisStatusChanges: [],
    topBigramsBefore: ["a:5", "b:4", "c:3"],
    topBigramsAfter: ["a:5", "b:4", "c:3"],
    bigramCountBefore: 10,
    bigramCountAfter: 10,
    triggerOtherAfter: 0,
    ...overrides,
  };
}
const emptyHyp = { hypotheses: [] };

// batch record helpers
const rec = (changes) => ({ changes });
const additiveFallback = () => rec([{ field: "triggerSensitivity.domain", oldValue: "other", newValue: "no_external_trigger" }]);
const additiveNull = () => rec([{ field: "maskAnalysis.functionalMask", oldValue: null, newValue: true }]);
const substantive = () => rec([{ field: "affect.primarySurface", oldValue: "joy", newValue: "anger" }]);
const noOpOnly = () => rec([{ field: "triggerSensitivity.domain", oldValue: "other", newValue: "other", noOp: true }]);

function evalWith(batch, diffOverrides = {}) {
  return evaluateDualStatus({ diff: stableDiff(diffOverrides), churnAfter: {}, hypAfter: emptyHyp, batch, tGap: {} });
}

test("additive-only churn (fallback→enum + null→value) does NOT gate; decision PROCEED_TO_200", () => {
  // 26 additive changes over 50 records — mirrors the real pilot run.
  const batch = [];
  for (let i = 0; i < 23; i++) batch.push(additiveFallback());
  for (let i = 0; i < 3; i++) batch.push(additiveNull());
  while (batch.length < 50) batch.push(rec([])); // unchanged records

  const r = evalWith(batch);
  assert.equal(r.additiveRecords, 26);
  assert.equal(r.substantiveRecords, 0);
  assert.equal(r.substantiveFraction, 0);
  assert.equal(r.annotationGuideStatus, GUIDE_STATUS.NEEDS_REFINEMENT, "high additive churn → NEEDS_REFINEMENT, not CHURN_TOO_HIGH");
  assert.equal(r.grammarDiscoveryStatus, GRAMMAR_DISCOVERY_STATUS.SUCCESSFUL);
  assert.equal(r.proceedGate.decision, "PROCEED_TO_200");
  assert.deepEqual(r.proceedGate.blockers, []);
});

test("substantive churn > 25% gates as CHURN_TOO_HIGH and blocks", () => {
  const batch = [];
  for (let i = 0; i < 20; i++) batch.push(substantive()); // 40% substantive
  while (batch.length < 50) batch.push(rec([]));

  const r = evalWith(batch);
  assert.equal(r.substantiveRecords, 20);
  assert.equal(r.substantiveFraction, 0.4);
  assert.equal(r.annotationGuideStatus, GUIDE_STATUS.CHURN_TOO_HIGH);
  assert.equal(r.proceedGate.decision, "REFINE_ONCE_MORE");
  assert.ok(r.proceedGate.blockers.some((b) => /substantive guide churn/.test(b)));
});

test("substantive churn at/under 25% does not gate", () => {
  const batch = [];
  for (let i = 0; i < 12; i++) batch.push(substantive()); // 24%
  while (batch.length < 50) batch.push(rec([]));

  const r = evalWith(batch);
  assert.equal(r.substantiveFraction, 0.24);
  assert.notEqual(r.annotationGuideStatus, GUIDE_STATUS.CHURN_TOO_HIGH);
});

test("noOp changes are never counted as churn", () => {
  const batch = [];
  for (let i = 0; i < 50; i++) batch.push(noOpOnly());
  const r = evalWith(batch);
  assert.equal(r.changedRecords, 0);
  assert.equal(r.additiveRecords, 0);
  assert.equal(r.substantiveRecords, 0);
  assert.equal(r.annotationGuideStatus, GUIDE_STATUS.STABLE);
});

test("a record mixing additive + substantive counts as substantive", () => {
  const batch = [];
  for (let i = 0; i < 20; i++) {
    batch.push(rec([
      { field: "triggerSensitivity.domain", oldValue: "other", newValue: "indeterminate" }, // additive
      { field: "affect.primarySurface", oldValue: "joy", newValue: "fear" },                 // substantive
    ]));
  }
  while (batch.length < 50) batch.push(rec([]));
  const r = evalWith(batch);
  assert.equal(r.substantiveRecords, 20, "presence of any substantive change makes the record substantive");
  assert.equal(r.additiveRecords, 0, "a mixed record is NOT additive-only");
});

test("empty-string old value is treated as additive (null→value semantics)", () => {
  const batch = [rec([{ field: "x", oldValue: "", newValue: "y" }])];
  while (batch.length < 50) batch.push(rec([]));
  const r = evalWith(batch);
  assert.equal(r.additiveRecords, 1);
  assert.equal(r.substantiveRecords, 0);
});

test("all fallback tokens (other/unknown/no_clear_action) count as additive", () => {
  const batch = [
    rec([{ field: "a", oldValue: "other", newValue: "x" }]),
    rec([{ field: "b", oldValue: "unknown", newValue: "y" }]),
    rec([{ field: "c", oldValue: "no_clear_action", newValue: "z" }]),
  ];
  while (batch.length < 50) batch.push(rec([]));
  const r = evalWith(batch);
  assert.equal(r.additiveRecords, 3);
  assert.equal(r.substantiveRecords, 0);
});

test("grammar discovery UNSTABLE blocks regardless of additive-only guide status", () => {
  const batch = [additiveFallback()];
  while (batch.length < 50) batch.push(rec([]));
  // force a wholesale hypothesis reversal (3+ step jump) → discovery unstable
  const r = evalWith(batch, {
    hypothesisStatusChanges: [{ before: "insufficient_evidence", after: "weak_support" }],
  });
  assert.equal(r.grammarDiscoveryStatus, GRAMMAR_DISCOVERY_STATUS.UNSTABLE);
  assert.equal(r.proceedGate.decision, "REFINE_ONCE_MORE");
  assert.ok(r.proceedGate.blockers.some((b) => /grammar discovery unstable/.test(b)));
});

test("residual high trigger-other downgrades to REFINE_ONCE_MORE without a blocker", () => {
  const batch = [];
  for (let i = 0; i < 10; i++) batch.push(additiveFallback());
  while (batch.length < 50) batch.push(rec([]));
  const r = evalWith(batch, { triggerOtherAfter: 10 }); // 10/50 = 20% > 15% residual threshold
  assert.equal(r.proceedGate.blockers.length, 0, "residual is a reason, not a blocker");
  assert.ok(r.proceedGate.reasons.some((x) => /trigger 'other' still/.test(x)));
  assert.equal(r.proceedGate.decision, "REFINE_ONCE_MORE");
});

test("dual-status notes explain the additive/substantive split", () => {
  const r = evalWith([rec([])]);
  assert.ok(r.proceedGate.notes.some((n) => /additive/.test(n) && /substantive/.test(n)));
});

// --- §1 hygiene: noOp entries are omitted from the change-log (PA-013 regression) ---
test("buildChangeLog omits noOp entries flagged noOp:true", () => {
  const batch = [
    { presentationId: "X1", linkId: "h1", changes: [{ field: "d", oldValue: "other", newValue: "other", noOp: true }] },
    { presentationId: "X2", linkId: "h2", changes: [{ field: "d", oldValue: "other", newValue: "indeterminate" }] },
  ];
  const { totalChangedRecords, records } = buildChangeLog(batch);
  assert.equal(totalChangedRecords, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].presentationId, "X2");
});

test("buildChangeLog omits entries where old === new even without a noOp flag", () => {
  const batch = [
    { presentationId: "X1", linkId: "h1", changes: [{ field: "d", oldValue: "other", newValue: "other" }] },
  ];
  const { totalChangedRecords, records } = buildChangeLog(batch);
  assert.equal(totalChangedRecords, 0);
  assert.deepEqual(records, []);
});

test("buildChangeLog keeps a record's effective changes and drops only the noOp ones within it", () => {
  const batch = [
    { presentationId: "X1", linkId: "h1", changes: [
      { field: "a", oldValue: "other", newValue: "other", noOp: true },
      { field: "b", oldValue: null, newValue: true },
    ] },
  ];
  const { records } = buildChangeLog(batch);
  assert.equal(records.length, 1);
  assert.equal(records[0].changedFields.length, 1, "the noOp field is dropped, the real one kept");
  assert.equal(records[0].changedFields[0].field, "b");
});

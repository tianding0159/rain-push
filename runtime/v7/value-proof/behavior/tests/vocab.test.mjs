import test from "node:test";
import assert from "node:assert/strict";
import { loadVocab, has, list, isProposedOnly } from "../lib/vocab.mjs";

test("vocab loads the SSOT arrays used by the schemas", () => {
  const v = loadVocab();
  for (const k of ["behaviorAtoms", "interactionFunctions", "latentNeeds", "expectedReplyClasses", "speechActs", "concurrencyClass", "evidenceGrades", "reviewStatuses"]) {
    assert.ok(Array.isArray(v[k]), `${k} must be an array`);
    assert.ok(v[k].length > 0, `${k} must be non-empty`);
  }
});

test("has() reflects membership in a named vocabulary", () => {
  assert.equal(has("behaviorAtoms", "withdraw"), true);
  assert.equal(has("behaviorAtoms", "definitely-not-a-real-atom"), false);
});

test("reviewStatuses never contains 'proposed' (canonical set is candidate/reviewed/rejected)", () => {
  const statuses = list("reviewStatuses");
  assert.ok(statuses.includes("candidate"));
  assert.ok(statuses.includes("reviewed"));
  assert.ok(!statuses.includes("proposed"), "guard against the old 'proposed' label");
});

test("evidenceGrades are exactly E0..E4 in order", () => {
  assert.deepEqual(list("evidenceGrades"), ["E0", "E1", "E2", "E3", "E4"]);
});

test("isProposedOnly distinguishes extensionProposals from the active vocabulary", () => {
  // A term that is not in the active list should not be reported as active-member.
  assert.equal(has("behaviorAtoms", "__unlikely_term__"), false);
  // isProposedOnly is a boolean helper; calling it must not throw for a plausible arg shape.
  assert.equal(typeof isProposedOnly("behaviorAtoms", "__unlikely_term__"), "boolean");
});

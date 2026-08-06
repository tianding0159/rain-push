// Tests for the cross-record validator — the executable contract. Proves the valid corpus
// passes and that EVERY invariant fails when violated (each negative case in
// fixtures/invalid/cases.json triggers its expected code, and reverting the check would let
// that case pass). This is the core "at least one test fails if the change is reverted"
// guarantee for the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCorpus, VALIDATION_CODES, messageContentHash } from "../lib/validator.mjs";
import { loadPolicy } from "../lib/source-policy.mjs";
import { loadSchemas, readJson } from "../lib/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const policy = loadPolicy();
const schemas = loadSchemas();
const contractSchemas = { registry: schemas.registry, event: schemas.event, retrieval: schemas.retrieval };

function run({ registry, events = [], retrievals = [] }) {
  return validateCorpus({ schemas: contractSchemas, policy, registry, events, retrievals });
}

test("valid fixture corpus passes with zero problems", () => {
  const res = run({
    registry: readJson(join(FIX, "registry.valid.json")),
    events: readJson(join(FIX, "events.valid.json")),
    retrievals: readJson(join(FIX, "retrievals.valid.json")),
  });
  assert.ok(res.valid, `expected valid, got: ${JSON.stringify(res.problems)}`);
});

// One discrete adversarial test per invalid case, so each violation is independently
// tracked in the test count and a regression names the exact case that broke.
const invalidCases = readJson(join(FIX, "invalid", "cases.json")).cases;
test("adversarial fixture set has broad coverage (>=20 cases)", () => {
  assert.ok(invalidCases.length >= 20, `expected >=20 adversarial cases, got ${invalidCases.length}`);
});
for (const c of invalidCases) {
  test(`adversarial: ${c.name} → ${c.expectCode}`, () => {
    const res = run({ registry: c.registry, events: c.events || [], retrievals: c.retrievals || [] });
    assert.ok(!res.valid, `case ${c.name} should be invalid`);
    const found = res.problems.map((p) => p.code);
    assert.ok(found.includes(c.expectCode),
      `case ${c.name}: expected code ${c.expectCode}, got [${found.join(",")}]`);
  });
}

test("messageContentHash is role-sensitive and deterministic", () => {
  const a = messageContentHash("ame", "hi");
  const b = messageContentHash("ame", "hi");
  const c = messageContentHash("p", "hi");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("messageContentHash framing is injective (no delimiter collision)", () => {
  // Length-prefixed framing: (role,text) must map uniquely to bytes even when a field
  // contains the delimiter byte. These two inputs must NOT hash to the same value.
  assert.notEqual(messageContentHash("a", "b\u0000c"), messageContentHash("a\u0000b", "c"));
  assert.notEqual(messageContentHash("ab", "c"), messageContentHash("a", "bc"));
});

test("unknown source short-circuits capability checks (only UNKNOWN_SOURCE)", () => {
  const res = run({
    registry: { registryFormatVersion: 1, sources: [] },
    events: [{ recordFormatVersion: 1, id: "evt_x", sourceId: "src_missing", channel: "jine", mode: "living", eventTrigger: "t", behaviorPrimitives: ["do"], messages: [{ order: 1, role: "ame", text: "x" }] }],
  });
  const codes = res.problems.map((p) => p.code);
  assert.ok(codes.includes(VALIDATION_CODES.UNKNOWN_SOURCE));
  assert.ok(!codes.includes(VALIDATION_CODES.SELF_AUTHORIZE_BEHAVIOR));
});

test("C1/A canon_severe with canon mode + routeId is accepted", () => {
  const res = run({
    registry: { registryFormatVersion: 1, sources: [{ id: "src_c1a", sourceType: "dialogue", sourceLayer: "C1", evidenceLevel: "A", trustLevel: "verified", reference: "syn", copyrightScope: "summary" }] },
    events: [{ recordFormatVersion: 1, id: "evt_ok_severe", sourceId: "src_c1a", channel: "private_dm", mode: "canon", eventTrigger: "t", routeSeverity: "canon_severe", routeId: "route_x", behaviorPrimitives: ["escalate"], expectedReplyClass: "commit", messages: [{ order: 1, role: "kangel", text: "x" }] }],
  });
  assert.ok(res.valid, JSON.stringify(res.problems));
});

test("duplicate source id is reported", () => {
  const res = run({
    registry: { registryFormatVersion: 1, sources: [
      { id: "src_dup", sourceType: "dialogue", sourceLayer: "C1", evidenceLevel: "A", trustLevel: "verified", reference: "a", copyrightScope: "summary" },
      { id: "src_dup", sourceType: "dialogue", sourceLayer: "C1", evidenceLevel: "A", trustLevel: "verified", reference: "b", copyrightScope: "summary" },
    ] },
    events: [],
  });
  assert.ok(res.problems.some((p) => p.code === VALIDATION_CODES.DUP_ID && p.recordId === "src_dup"));
});

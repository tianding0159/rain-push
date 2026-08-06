// Tests for the source-policy accessor: it is the single reader of the policy JSON, so its
// enum + capability derivation must be exactly right or every downstream module inherits
// the error. Also covers malformed-policy rejection with stable codes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPolicy, POLICY_ERROR_CODES, PolicyError,
  sourceLayerIds, evidenceLevelIds, trustLevelIds, routeSeverityIds,
  isChannel, isPersonaSurface, isMode, isMessageRole, isCopyrightScope, isSourceType,
  canDriveBehavior, canDriveWording, canDriveMechanics, canBeCanonSevere,
  canPublicExport, isQuarantined, routeSeverity,
} from "../lib/source-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function tmp() { return mkdtempSync(join(tmpdir(), "p0a-policy-")); }

test("loadPolicy loads the committed policy and exposes all enums", () => {
  const p = loadPolicy();
  assert.deepEqual(sourceLayerIds(p), ["C1", "C2", "C3", "C4"]);
  assert.deepEqual(evidenceLevelIds(p), ["A", "B", "C", "D"]);
  assert.deepEqual(trustLevelIds(p), ["suspected_ai", "unverified", "verified"]);
  assert.deepEqual(routeSeverityIds(p), ["canon_severe", "major", "minor", "none"]);
  assert.ok(isChannel(p, "jine"));
  assert.ok(!isChannel(p, "telepathy"));
  assert.ok(isPersonaSurface(p, "ame_private"));
  assert.ok(isMode(p, "canon") && isMode(p, "living"));
  assert.ok(isMessageRole(p, "ame") && isMessageRole(p, "narration"));
  assert.ok(isCopyrightScope(p, "summary"));
  assert.ok(isSourceType(p, "simulator_extension"));
});

test("capability derivation: layer AND evidence-level must both grant", () => {
  const p = loadPolicy();
  // C1/A: full behavior + wording.
  assert.ok(canDriveBehavior(p, "C1", "A"));
  assert.ok(canDriveWording(p, "C1", "A"));
  // C1/D: layer allows but evidence D excludes → neither.
  assert.ok(!canDriveBehavior(p, "C1", "D"));
  assert.ok(!canDriveWording(p, "C1", "D"));
  // C2 guide: mechanics yes, behavior/wording no even at A.
  assert.ok(canDriveMechanics(p, "C2"));
  assert.ok(!canDriveBehavior(p, "C2", "A"));
  assert.ok(!canDriveWording(p, "C2", "A"));
  // C3 community: wording only (with C/A/B), never behavior.
  assert.ok(canDriveWording(p, "C3", "C"));
  assert.ok(!canDriveBehavior(p, "C3", "A"));
  assert.ok(!canDriveMechanics(p, "C3"));
  // C4 extension: nothing, and not exportable.
  assert.ok(!canDriveBehavior(p, "C4", "A"));
  assert.ok(!canPublicExport(p, "C4"));
  assert.ok(canPublicExport(p, "C1"));
});

test("canon-severe capability is C1-only", () => {
  const p = loadPolicy();
  assert.ok(canBeCanonSevere(p, "C1"));
  assert.ok(!canBeCanonSevere(p, "C2"));
  assert.ok(!canBeCanonSevere(p, "C3"));
  assert.ok(!canBeCanonSevere(p, "C4"));
});

test("quarantine: only suspected_ai is quarantined", () => {
  const p = loadPolicy();
  assert.ok(isQuarantined(p, "suspected_ai"));
  assert.ok(!isQuarantined(p, "verified"));
  assert.ok(!isQuarantined(p, "unverified"));
});

test("routeSeverity metadata: canon_severe requires canon mode + route id", () => {
  const p = loadPolicy();
  assert.equal(routeSeverity(p, "none").requiresCanonMode, false);
  const cs = routeSeverity(p, "canon_severe");
  assert.equal(cs.requiresCanonMode, true);
  assert.equal(cs.requiresRouteId, true);
});

test("malformed policy: unreadable path", () => {
  assert.throws(() => loadPolicy(join(tmp(), "nope.json")),
    (e) => e instanceof PolicyError && e.code === POLICY_ERROR_CODES.UNREADABLE);
});

test("malformed policy: bad JSON", () => {
  const d = tmp(); const f = join(d, "p.json"); writeFileSync(f, "{not json");
  assert.throws(() => loadPolicy(f),
    (e) => e.code === POLICY_ERROR_CODES.MALFORMED_JSON);
});

test("malformed policy: not an object", () => {
  const d = tmp(); const f = join(d, "p.json"); writeFileSync(f, "[]");
  assert.throws(() => loadPolicy(f),
    (e) => e.code === POLICY_ERROR_CODES.NOT_OBJECT);
});

test("malformed policy: unsupported version", () => {
  const d = tmp(); const f = join(d, "p.json");
  writeFileSync(f, JSON.stringify({ policyFormatVersion: 999 }));
  assert.throws(() => loadPolicy(f),
    (e) => e.code === POLICY_ERROR_CODES.UNSUPPORTED_VERSION);
});

test("malformed policy: missing required section", () => {
  const d = tmp(); const f = join(d, "p.json");
  writeFileSync(f, JSON.stringify({ policyFormatVersion: 1, sourceLayers: {} }));
  assert.throws(() => loadPolicy(f),
    (e) => e.code === POLICY_ERROR_CODES.MISSING_SECTION);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildInstrumentAManifest, matchClass, ruleVocabularies, modelIdentity,
  INSTRUMENT_A_PROTOCOL_VERSION,
} from "../lib/instrument-a-manifest.mjs";
import { validateAnnotations, fingerprintAnnotations } from "../lib/instrument-a-validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const REF50 = join(V7, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const ref50 = JSON.parse(readFileSync(REF50, "utf8")).annotations;

// ------------------------------------------------------------------------------------------------
// Manifest identity
// ------------------------------------------------------------------------------------------------
test("manifest resolves against the frozen guide + protocol docs (no missing artifacts)", () => {
  const m = buildInstrumentAManifest();
  assert.equal(m.resolvable, true);
  assert.equal(m.guideMissing.length, 0);
  assert.equal(m.protocolDocMissing.length, 0);
  assert.equal(m.protocolVersion, INSTRUMENT_A_PROTOCOL_VERSION);
  assert.match(m.protocolHash, /^[0-9a-f]{64}$/);
  assert.match(m.guideFingerprint, /^[0-9a-f]{64}$/);
});

test("Instrument A is defined as model-assisted, NOT human/hand/gold", () => {
  const m = buildInstrumentAManifest();
  const d = m.instrumentADefinition.toLowerCase();
  assert.ok(d.includes("model-assisted"));
  assert.ok(d.includes("not human"));
  assert.ok(/not gold/.test(d));
  assert.ok(/not hand-authored/.test(d));
});

test("protocolHash is deterministic and independent of model version/env identity", () => {
  const a = buildInstrumentAManifest();
  // Same frozen inputs, different (irrelevant) env values must not perturb the protocol hash.
  const b = buildInstrumentAManifest({ env: { ...process.env, ANTHROPIC_CUSTOM_HEADERS: "changed", SOME_TOKEN: "x" } });
  assert.equal(a.protocolHash, b.protocolHash);
});

test("model identity records identity only — never a secret token", () => {
  const id = modelIdentity({
    ANTHROPIC_BASE_URL: "https://host.example.com/v1",
    ANTHROPIC_AUTH_TOKEN: "sk-secret-should-not-appear",
    ANTHROPIC_CUSTOM_HEADERS: "x-portkey: user@corp",
  });
  const blob = JSON.stringify(id);
  assert.ok(!blob.includes("sk-secret-should-not-appear"), "auth token must not be captured");
  assert.ok(!blob.includes("user@corp"), "user PII must not be captured");
  assert.equal(id.proxyHost, "host.example.com", "host only, no path/creds");
  assert.equal(id.modelFamily, "claude");
});

test("matchClass = PROTOCOL_MATCH_MODEL_VARIANT when protocol frozen but original model version unrecorded", () => {
  const m = buildInstrumentAManifest();
  assert.equal(matchClass(m), "INSTRUMENT_A_PROTOCOL_MATCH_MODEL_VARIANT");
  assert.equal(m.modelIdentity.originalModelVersionRecorded, false);
});

test("matchClass = IDENTITY_UNRESOLVED when a frozen artifact is missing", () => {
  const broken = { ...buildInstrumentAManifest(), resolvable: false };
  assert.equal(matchClass(broken), "INSTRUMENT_A_IDENTITY_UNRESOLVED");
});

test("rule vocabularies are sourced from the frozen vocab (SSOT), not hardcoded", () => {
  const rv = ruleVocabularies();
  assert.deepEqual(rv.confidenceVocabulary, ["explicit", "strongly_supported", "weak_inference", "unknown"]);
  assert.deepEqual(rv.evidenceGradeRules.roundAGrades, ["E0", "E1", "E2"]);
  assert.ok(rv.behaviorActions.includes("reveal"));
  assert.ok(rv.triggerDomains.length > 0);
  assert.ok(rv.maskRules.maskStrategy.length > 0);
});

// ------------------------------------------------------------------------------------------------
// Original-50 validation & fingerprint  (the identity gate)
// ------------------------------------------------------------------------------------------------
test("original 50 validate cleanly inside the frozen protocol decision space", () => {
  const v = validateAnnotations(ref50);
  assert.equal(v.n, 50);
  assert.equal(v.valid, true);
  assert.equal(v.violationCount, 0);
});

test("validation catches an out-of-vocabulary action (would-fail-if-reverted guard)", () => {
  const tampered = structuredClone(ref50).slice(0, 1);
  tampered[0].behaviorActionSequence = [{ action: "definitely_not_in_vocab", order: 1, confidence: "explicit" }];
  const v = validateAnnotations(tampered);
  assert.equal(v.valid, false);
  assert.ok(v.violations.some((x) => x.field === "behaviorActionSequence.action"));
});

test("validation rejects a non-Round-A grade (E3 not assignable in a single-record pass)", () => {
  const tampered = structuredClone(ref50).slice(0, 1);
  tampered[0].evidenceGrade = "E3";
  const v = validateAnnotations(tampered);
  assert.equal(v.valid, false);
  assert.ok(v.violations.some((x) => x.field === "evidenceGrade"));
});

test("original-50 fingerprint is deterministic and order-independent", () => {
  const a = fingerprintAnnotations(ref50);
  const shuffled = [...ref50].reverse();
  const b = fingerprintAnnotations(shuffled);
  assert.equal(a.combined, b.combined, "reordering records must not change the set fingerprint");
  assert.match(a.combined, /^[0-9a-f]{64}$/);
  assert.equal(a.n, 50);
});

test("fingerprint changes if any annotated field changes (sensitivity)", () => {
  const base = fingerprintAnnotations(ref50).combined;
  const tampered = structuredClone(ref50);
  tampered[0].triggerSensitivity = { ...tampered[0].triggerSensitivity, domain: "other" };
  assert.notEqual(fingerprintAnnotations(tampered).combined, base);
});

// ------------------------------------------------------------------------------------------------
// Committed artifact safety
// ------------------------------------------------------------------------------------------------
test("committed manifest aggregate is CJK-free and leaks no infra host or secret", () => {
  const p = join(HERE, "..", "discovery-200-a", "instrument-a-manifest.aggregate.json");
  const c = readFileSync(p, "utf8");
  assert.equal(c.match(/[\u4e00-\u9fff]/g), null, "no CJK");
  assert.ok(!/amazonaws|internal-proxy/.test(c), "proxy host must be hashed, not raw");
  assert.ok(!/sk-|Bearer\s|api[_-]?key/i.test(c), "no secret material");
  const j = JSON.parse(c);
  assert.equal(j.matchClass, "INSTRUMENT_A_PROTOCOL_MATCH_MODEL_VARIANT");
  assert.equal(j.original50.valid, true);
  assert.equal(j.original50.violationCount, 0);
  assert.match(j.modelIdentity.proxyHost, /^sha256:[0-9a-f]{64}$/);
});

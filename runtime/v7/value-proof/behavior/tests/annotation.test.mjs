import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { validateAnnotation, validateAnnotationBatch, ANNOTATION_RULE_CODES } from "../lib/annotation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYN = join(HERE, "..", "fixtures", "synthetic");

function firstAnnotation() {
  const r1 = readJson(join(SYN, "annotations-round1.json")).annotations;
  return JSON.parse(JSON.stringify(r1[0]));
}

test("synthetic round-1 annotations all pass schema + cross-field rules", () => {
  const anns = readJson(join(SYN, "annotations-round1.json")).annotations;
  const batch = validateAnnotationBatch(anns);
  assert.equal(batch.invalid, 0, `unexpected invalid: ${JSON.stringify(batch.results.filter((r) => !r.valid))}`);
  assert.equal(batch.valid, anns.length);
});

test("EMPTY_L1: the cross-field rule fires (independently of the schema minItems guard)", () => {
  const a = firstAnnotation();
  a.l1.behaviorAtoms = [];
  const r = validateAnnotation(a);
  assert.equal(r.valid, false);
  // Assert the RULE specifically fires — this fails if the EMPTY_L1 rule is removed, even though
  // the schema's minItems:1 would still reject the annotation. That keeps the rule under test as
  // the documented "whitespace-only upstream of schema" guard rather than a no-op.
  const codes = r.ruleErrors.map((e) => e.code);
  assert.ok(codes.includes(ANNOTATION_RULE_CODES.EMPTY_L1), `EMPTY_L1 not in ${JSON.stringify(codes)}`);
});

test("NEED_NO_UNCERTAINTY: a latent-need candidate lacking uncertaintyReason is an error", () => {
  const a = firstAnnotation();
  a.l3.candidates[0].uncertaintyReason = "";
  const r = validateAnnotation(a);
  assert.equal(r.valid, false);
});

test("ALT_INCLUDES_NEED: listing the need in its own alternatives is an error", () => {
  const a = firstAnnotation();
  const need = a.l3.candidates[0].need;
  a.l3.candidates[0].alternatives = [need];
  const r = validateAnnotation(a);
  assert.equal(r.valid, false);
  assert.ok(r.ruleErrors.some((e) => e.code === ANNOTATION_RULE_CODES.ALT_INCLUDES_NEED));
});

test("MODEL_SELF_ASSERTED_FACT: modelSuggested need at confidence>=0.9 is rejected", () => {
  const a = firstAnnotation();
  a.modelSuggested = true;
  a.l3.candidates[0].confidence = 0.95;
  const r = validateAnnotation(a);
  assert.equal(r.valid, false);
  assert.ok(r.ruleErrors.some((e) => e.code === ANNOTATION_RULE_CODES.MODEL_SELF_ASSERTED_FACT));
});

test("AFFECT_C_IN_STATS: designed-inference affect with content is a warning, not a hard error", () => {
  const a = firstAnnotation();
  a.affect = { concurrencyClass: "C_designed_inference", masked: "shame" };
  const r = validateAnnotation(a);
  assert.ok(r.ruleWarnings.some((w) => w.code === ANNOTATION_RULE_CODES.AFFECT_C_IN_STATS));
});

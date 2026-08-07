import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { consistencyReport, compareAnnotationPair, PILOT_GATES } from "../lib/consistency.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYN = join(HERE, "..", "fixtures", "synthetic");

function rounds() {
  return {
    r1: readJson(join(SYN, "annotations-round1.json")).annotations,
    r2: readJson(join(SYN, "annotations-round2.json")).annotations,
  };
}

test("identical rounds → perfect agreement on every gated field", () => {
  const { r1 } = rounds();
  const rep = consistencyReport(r1, r1);
  for (const f of Object.keys(PILOT_GATES)) assert.equal(rep.agreement[f], 1, `field ${f}`);
  assert.equal(rep.verdict, "PILOT_GATES_PASS");
});

test("synthetic two-round set passes all §14 pilot gates (realistic, non-trivial agreement)", () => {
  const { r1, r2 } = rounds();
  const rep = consistencyReport(r1, r2);
  assert.equal(rep.pairedRecords, r1.length);
  assert.equal(rep.allGatesPass, true, JSON.stringify(rep.gates));
  // At least one field should be below a perfect 1.0 — otherwise the perturbation isn't exercised.
  const anyImperfect = Object.values(rep.agreement).some((v) => v < 1);
  assert.ok(anyImperfect, "round-2 perturbation should lower at least one agreement below 1.0");
});

test("compareAnnotationPair: disjoint behavior atoms → 0 observableActs agreement", () => {
  const a = { recordHash: "h", l1: { behaviorAtoms: ["tease"] }, l2: { functions: ["obtain_attention"] }, l3: { candidates: [] }, affect: {}, expectedReply: {} };
  const b = { recordHash: "h", l1: { behaviorAtoms: ["withdraw"] }, l2: { functions: ["obtain_attention"] }, l3: { candidates: [] }, affect: {}, expectedReply: {} };
  const cmp = compareAnnotationPair(a, b);
  assert.equal(cmp.observableActs, 0);
  assert.equal(cmp.interactionFunction, 1);
});

test("a forced disagreement drives at least one gate to FAIL", () => {
  const { r1 } = rounds();
  const broken = r1.map((a) => ({ ...a, l2: { functions: ["unknown"] } }));
  const rep = consistencyReport(r1, broken);
  assert.equal(rep.gates.interactionFunction.pass, false);
  assert.equal(rep.verdict, "PILOT_GATES_FAIL");
});

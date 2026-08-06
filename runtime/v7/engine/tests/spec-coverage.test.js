// Hardening Sprint 1 — spec coverage / parity-matrix integrity tests.
//
// These tests keep the parity artifacts honest: the matrix must be well-formed, every phase
// folder must be represented, every critical invariant must be tested, and any requirement that
// claims a test file must point at a file that exists. This prevents the matrix from silently
// drifting away from the engine it describes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, "..");
const parityDir = path.join(engineRoot, "parity");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(parityDir, name), "utf8"));
}

const matrix = readJson("parity-matrix.json");
const VALID_STATUS = new Set(matrix.meta.statusVocabulary);
const VALID_SEVERITY = new Set(matrix.meta.severityVocabulary);

test("parity matrix is well-formed and uses only declared vocabularies", () => {
  assert.ok(Array.isArray(matrix.requirements));
  assert.ok(matrix.requirements.length > 0);
  const ids = new Set();
  for (const req of matrix.requirements) {
    assert.ok(req.id, "requirement missing id");
    assert.ok(!ids.has(req.id), `duplicate requirement id: ${req.id}`);
    ids.add(req.id);
    assert.ok(VALID_SEVERITY.has(req.severity), `bad severity for ${req.id}: ${req.severity}`);
    assert.ok(VALID_STATUS.has(req.implementation.status), `bad impl status for ${req.id}`);
    assert.ok(VALID_STATUS.has(req.test.status), `bad test status for ${req.id}`);
    assert.ok(req.source, `${req.id} missing source`);
    assert.ok(req.implementation.detail, `${req.id} missing implementation detail`);
  }
});

test("every critical invariant is backed by an executable test", () => {
  const critical = matrix.requirements.filter((r) => r.severity === "critical");
  assert.ok(critical.length >= 5, "expected several critical invariants");
  for (const req of critical) {
    assert.equal(
      req.test.status,
      "tested",
      `critical requirement ${req.id} is not tested`
    );
  }
});

test("every requirement claiming a test file points at a file that exists", () => {
  for (const req of matrix.requirements) {
    if (req.test.status !== "tested") continue;
    assert.ok(req.test.file, `${req.id} is tested but names no file`);
    // test.file may list multiple files separated by ' + '
    for (const rel of req.test.file.split("+").map((s) => s.trim())) {
      const abs = path.join(engineRoot, rel);
      assert.ok(fs.existsSync(abs), `${req.id} references missing test file: ${rel}`);
    }
  }
});

test("every Phase 1-11 folder is represented in the parity matrix", () => {
  // runtime owner values that map to a phase folder
  const runtimeCoverage = new Set(
    matrix.requirements.flatMap((r) => String(r.runtime).split("/"))
  );
  const expected = [
    "knowledge",
    "continuity",
    "relationship",
    "meaning",
    "emotion",
    "need",
    "thought",
    "decision",
    "behavior",
    "expression",
    "language"
  ];
  // 'all' is an acceptable stand-in for cross-cutting requirements
  for (const runtime of expected) {
    const covered =
      runtimeCoverage.has(runtime) ||
      runtimeCoverage.has("all") ||
      // some phases are covered via a combined owner such as 'emotion/behavior'
      matrix.requirements.some((r) => String(r.runtime).includes(runtime));
    assert.ok(covered, `no parity requirement covers runtime/phase: ${runtime}`);
  }
});

test("the companion parity artifacts exist and are valid JSON", () => {
  for (const name of ["schema-field-map.json", "runtime-contract-map.json"]) {
    const abs = path.join(parityDir, name);
    assert.ok(fs.existsSync(abs), `missing artifact: ${name}`);
    assert.doesNotThrow(() => readJson(name), `invalid JSON: ${name}`);
  }
  for (const name of ["parity-matrix.md", "high-risk-gaps.md"]) {
    const abs = path.join(parityDir, name);
    assert.ok(fs.existsSync(abs), `missing artifact: ${name}`);
    assert.ok(fs.statSync(abs).size > 0, `empty artifact: ${name}`);
  }
});

test("schema-field-map covers all eleven runtime packets", () => {
  const map = readJson("schema-field-map.json");
  const expected = [
    "knowledge", "continuity", "relationship", "meaning", "emotion",
    "need", "thought", "decision", "behavior", "expression", "language"
  ];
  for (const kind of expected) {
    assert.ok(map.packets[kind], `schema-field-map missing packet: ${kind}`);
    assert.ok(Array.isArray(map.packets[kind].emittedFields));
  }
});

test("runtime-contract-map lists every stage in pipeline order", () => {
  const map = readJson("runtime-contract-map.json");
  const kinds = map.runtimes.map((r) => r.kind);
  assert.deepEqual(kinds, map.meta.pipelineOrder);
});

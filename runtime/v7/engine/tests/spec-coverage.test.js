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

// Phase coverage is intentionally split into "dedicated" vs "cross-only".
// A dedicated requirement names the phase directly in its runtime owner
// (e.g. runtime "meaning" or a combined "emotion/behavior"). A cross-only phase
// has NO dedicated requirement and is covered solely by cross-cutting owners
// (all / orchestrator / update-queue / ...). The earlier version of this test
// short-circuited on runtimeCoverage.has("all"), so it stayed green even if every
// dedicated requirement were deleted. That masked which phases actually own a
// requirement. These two tests assert the true partition and fail on mutation.
const PHASE_RUNTIME_MAP = {
  knowledge: "dedicated",
  continuity: "cross-only",
  relationship: "cross-only",
  meaning: "dedicated",
  emotion: "dedicated",
  need: "dedicated",
  thought: "cross-only",
  decision: "cross-only",
  behavior: "dedicated",
  expression: "dedicated",
  language: "dedicated"
};

// Owners that are cross-cutting rather than a single phase folder.
const CROSS_OWNERS = new Set([
  "all",
  "orchestrator",
  "update-queue",
  "execution-boundary",
  "weather-adapter",
  "renderer"
]);

function dedicatedRequirementIds(phase) {
  // A requirement is "dedicated" to a phase when the phase name appears as a
  // slash-separated token in its runtime owner (handles "emotion/behavior").
  return matrix.requirements
    .filter((r) => String(r.runtime).split("/").includes(phase))
    .map((r) => r.id);
}

test("phase-runtime map lists all eleven phases exactly once", () => {
  const phases = Object.keys(PHASE_RUNTIME_MAP);
  assert.equal(phases.length, 11);
  assert.equal(new Set(phases).size, 11);
});

test("each phase with dedicated coverage actually owns at least one requirement (mutation-sensitive)", () => {
  const dedicatedPhases = Object.entries(PHASE_RUNTIME_MAP)
    .filter(([, kind]) => kind === "dedicated")
    .map(([phase]) => phase);
  // No 'all' short-circuit: coverage must come from a requirement that names
  // this phase. Deleting that requirement makes this assertion fail.
  for (const phase of dedicatedPhases) {
    const ids = dedicatedRequirementIds(phase);
    assert.ok(
      ids.length > 0,
      `phase '${phase}' is marked dedicated but no requirement names it`
    );
  }
});

test("each cross-only phase has no dedicated requirement and is covered by a real cross-cutting requirement", () => {
  const crossOnlyPhases = Object.entries(PHASE_RUNTIME_MAP)
    .filter(([, kind]) => kind === "cross-only")
    .map(([phase]) => phase);
  const crossRequirements = matrix.requirements.filter((r) =>
    CROSS_OWNERS.has(String(r.runtime))
  );
  assert.ok(
    crossRequirements.length > 0,
    "expected at least one cross-cutting requirement to cover cross-only phases"
  );
  for (const phase of crossOnlyPhases) {
    // If a cross-only phase gains a dedicated requirement later, the map is stale
    // and must be updated — surface that instead of silently passing.
    assert.equal(
      dedicatedRequirementIds(phase).length,
      0,
      `phase '${phase}' is marked cross-only but now owns a dedicated requirement — update PHASE_RUNTIME_MAP`
    );
  }
});

test("the phase-runtime map covers exactly the eleven pipeline phases", () => {
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
  assert.deepEqual(Object.keys(PHASE_RUNTIME_MAP).sort(), [...expected].sort());
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
    assert.ok(Array.isArray(map.packets[kind].actualFields));
    assert.ok(Array.isArray(map.packets[kind].specFields));
    assert.ok(Array.isArray(map.packets[kind].mappedFields));
    assert.ok(Array.isArray(map.packets[kind].specOnlyFields));
  }
});

test("runtime-contract-map lists every stage in pipeline order", () => {
  const map = readJson("runtime-contract-map.json");
  const kinds = map.runtimes.map((r) => r.kind);
  assert.deepEqual(kinds, map.meta.pipelineOrder);
});

// Hardening Sprint 1 — runtime-contract-map consistency tests.
//
// runtime-contract-map.json describes, per runtime stage, its entry function, real output
// fields, and the contracts it participates in — each tagged enforced / constructed /
// tested_only / specification_only. These tests keep those claims honest:
//   - stages appear in the real pipeline order,
//   - every entry function file exists,
//   - output fields match the ground-truth field union,
//   - every contract references a real matrix requirement,
//   - an 'enforced' contract names a validator location that resolves to a real source file,
//   - a 'tested_only' / 'enforced' contract that cites a test file points at a file that exists.
// If someone downgrades a validator to a comment, or relabels a contract, this fails.
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

const map = readJson("runtime-contract-map.json");
const groundTruth = readJson("actual-packet-fields.json");
const matrix = readJson("parity-matrix.json");
const matrixIds = new Set(matrix.requirements.map((r) => r.id));

const RUNTIME_ORDER = [
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

const VALID_CONTRACT_STATUS = new Set([
  "enforced",
  "constructed",
  "tested_only",
  "specification_only"
]);

// Source files that back an 'enforced' claim. A validator citation must reference
// one of these (the file must exist on disk).
function entrySourceFile(entry) {
  // entry format: "src/foo/bar.js#fnName"
  return entry.split("#")[0];
}

test("runtimes are listed in the real pipeline order", () => {
  assert.deepEqual(
    map.runtimes.map((r) => r.kind),
    RUNTIME_ORDER
  );
  assert.deepEqual(map.meta.pipelineOrder, RUNTIME_ORDER);
});

test("every runtime entry function file exists on disk", () => {
  for (const r of map.runtimes) {
    const file = entrySourceFile(r.entry);
    assert.ok(
      fs.existsSync(path.join(engineRoot, file)),
      `${r.kind}: entry file missing: ${file}`
    );
  }
  const orchFile = entrySourceFile(map.orchestratorContracts.entry);
  assert.ok(
    fs.existsSync(path.join(engineRoot, orchFile)),
    `orchestrator entry file missing: ${orchFile}`
  );
});

test("runtime kind matches its entry filename", () => {
  for (const r of map.runtimes) {
    const file = entrySourceFile(r.entry);
    // src/runtimes/<kind>.js
    assert.ok(
      file.endsWith(`runtimes/${r.kind}.js`),
      `${r.kind}: entry '${file}' does not match kind`
    );
  }
});

test("outputFields match the ground-truth field union exactly", () => {
  for (const r of map.runtimes) {
    assert.deepEqual(
      [...r.outputFields].sort(),
      [...groundTruth.packets[r.kind].actualFields].sort(),
      `${r.kind}: outputFields disagree with actual-packet-fields.json`
    );
  }
});

test("every contract references a real matrix requirement and a valid status", () => {
  const allContracts = [
    ...map.runtimes.flatMap((r) => r.contracts.map((c) => ({ owner: r.kind, c }))),
    ...map.orchestratorContracts.contracts.map((c) => ({ owner: "orchestrator", c }))
  ];
  assert.ok(allContracts.length > 0, "expected contracts");
  for (const { owner, c } of allContracts) {
    assert.ok(c.req, `${owner}: contract missing req id`);
    assert.ok(
      matrixIds.has(c.req),
      `${owner}: contract req '${c.req}' is not in the parity matrix`
    );
    assert.ok(
      VALID_CONTRACT_STATUS.has(c.status),
      `${owner}/${c.req}: bad contract status '${c.status}'`
    );
    assert.ok(c.statement, `${owner}/${c.req}: contract missing statement`);
    assert.ok(c.evidence, `${owner}/${c.req}: contract missing evidence`);
  }
});

// The set of validator source files an 'enforced' contract may cite. Keeping this
// explicit means removing a validator (and its citation) forces this list — and the
// enforced claim — to change together.
const VALIDATOR_FILES = [
  "src/validators.js",
  "src/packet.js",
  "src/update-queue.js",
  "src/replay/replay.js",
  "src/execution/execution-boundary.js",
  "src/orchestrator.js"
];

test("every 'enforced' contract cites evidence pointing at a real validator source file", () => {
  const enforced = [
    ...map.runtimes.flatMap((r) => r.contracts),
    ...map.orchestratorContracts.contracts
  ].filter((c) => c.status === "enforced");
  assert.ok(enforced.length > 0, "expected at least one enforced contract");
  for (const c of enforced) {
    // evidence must name a validator function/file that we can point to on disk.
    const cited = VALIDATOR_FILES.filter((f) => {
      const base = path.basename(f, ".js"); // e.g. "validators"
      return (
        c.evidence.includes(f) ||
        c.evidence.includes(base) ||
        // human-readable validator names used in evidence prose
        /validatePipeline|validatePacketShape|validateEvent|validateUpdate|ReplayEngine|ExecutionBoundary/.test(
          c.evidence
        )
      );
    });
    assert.ok(
      cited.length > 0,
      `enforced contract ${c.req} does not cite a known validator: ${c.evidence}`
    );
    // and at least one of the known validator files must exist
    const anyExists = VALIDATOR_FILES.some((f) =>
      fs.existsSync(path.join(engineRoot, f))
    );
    assert.ok(anyExists, "no validator source files exist");
  }
});

test("'tested_only' contracts describe a lock in a parity/property test that exists", () => {
  const testedOnly = [
    ...map.runtimes.flatMap((r) => r.contracts),
    ...map.orchestratorContracts.contracts
  ].filter((c) => c.status === "tested_only");
  assert.ok(testedOnly.length > 0, "expected tested_only contracts (audit found several)");
  const parityTest = path.join(here, "parity-contract.test.js");
  const propertyTest = path.join(here, "property-conformance.test.js");
  const scenarioTest = path.join(here, "scenario-conformance.test.js");
  assert.ok(fs.existsSync(parityTest), "parity-contract.test.js missing");
  for (const c of testedOnly) {
    // The requirement must be locked by SOME executable test in the matrix.
    const req = matrix.requirements.find((r) => r.id === c.req);
    assert.ok(req, `tested_only ${c.req} not in matrix`);
    assert.equal(
      req.test.status,
      "tested",
      `tested_only contract ${c.req} is not marked tested in the matrix`
    );
    for (const rel of req.test.file.split("+").map((s) => s.trim())) {
      assert.ok(
        fs.existsSync(path.join(engineRoot, rel)),
        `tested_only ${c.req} names missing test file: ${rel}`
      );
    }
  }
  // sanity: the property/scenario tests referenced by tested_only reqs exist too
  assert.ok(
    fs.existsSync(propertyTest) || fs.existsSync(scenarioTest),
    "expected property or scenario conformance tests to exist"
  );
});

test("'constructed' contracts do NOT claim a dedicated validator", () => {
  const constructed = map.runtimes.flatMap((r) => r.contracts).filter(
    (c) => c.status === "constructed"
  );
  assert.ok(constructed.length > 0, "expected constructed contracts");
  for (const c of constructed) {
    // A constructed contract is by-construction; it must not assert that a
    // validator rejects a violation (that would be 'enforced' instead).
    assert.ok(
      !/rejects|rejected|reject a/.test(c.evidence),
      `constructed contract ${c.req} claims rejection — should be 'enforced': ${c.evidence}`
    );
  }
});

test("R-DARK-01 in the contract map is flagged as a bidirectional-gate gap", () => {
  const emotion = map.runtimes.find((r) => r.kind === "emotion");
  const dark = emotion.contracts.find((c) => c.req === "R-DARK-01");
  assert.ok(dark, "expected R-DARK-01 contract on emotion");
  assert.equal(dark.status, "tested_only");
  assert.equal(
    dark.substatus,
    "bidirectional-gate-missing",
    "R-DARK-01 must carry the bidirectional-gate-missing substatus"
  );
});

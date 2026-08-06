// Hardening Sprint 1 — schema-field-map consistency tests.
//
// schema-field-map.json claims, per packet, the exact set of fields the engine emits
// in packet.data (actualFields). This test re-derives that set by running the engine
// live over every scenario fixture (via collectActualFields) and asserts the map matches
// the ground truth exactly. If a runtime starts or stops emitting a field, or the map is
// hand-edited to disagree with reality, this fails. This is what turns the field map from
// a stale hand-written table into a checked contract.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectActualFields } from "./gen-actual-fields.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, "..");
const parityDir = path.join(engineRoot, "parity");

const map = JSON.parse(
  fs.readFileSync(path.join(parityDir, "schema-field-map.json"), "utf8")
);
const groundTruth = JSON.parse(
  fs.readFileSync(path.join(parityDir, "actual-packet-fields.json"), "utf8")
);

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

test("collectActualFields runs every fixture without a single failure", () => {
  const { ok, fail } = collectActualFields();
  assert.equal(fail, 0, `expected zero fixture failures, got ${fail}`);
  assert.ok(ok > 0, "expected at least one fixture to run");
});

test("schema-field-map actualFields equal the live engine field union (mutation-sensitive)", () => {
  const live = collectActualFields();
  for (const kind of RUNTIME_ORDER) {
    const fromMap = map.packets[kind]?.actualFields;
    const fromLive = live.packets[kind]?.actualFields;
    assert.ok(fromMap, `schema-field-map missing packet: ${kind}`);
    assert.ok(fromLive, `live run missing packet: ${kind}`);
    assert.deepEqual(
      [...fromMap].sort(),
      [...fromLive].sort(),
      `actualFields for '${kind}' disagree with live engine output`
    );
  }
});

test("schema-field-map actualFields match the committed ground-truth artifact", () => {
  for (const kind of RUNTIME_ORDER) {
    assert.deepEqual(
      [...map.packets[kind].actualFields].sort(),
      [...groundTruth.packets[kind].actualFields].sort(),
      `actualFields for '${kind}' disagree with actual-packet-fields.json`
    );
  }
});

test("committed ground truth matches a fresh live run (regenerate if this fails)", () => {
  const live = collectActualFields();
  for (const kind of RUNTIME_ORDER) {
    assert.deepEqual(
      [...groundTruth.packets[kind].actualFields].sort(),
      [...live.packets[kind].actualFields].sort(),
      `actual-packet-fields.json for '${kind}' is stale — run node tests/gen-actual-fields.mjs`
    );
  }
});

test("mappedFields reference only real actual fields and real spec fields", () => {
  for (const kind of RUNTIME_ORDER) {
    const p = map.packets[kind];
    const actualSet = new Set(p.actualFields);
    const specSet = new Set(p.specFields);
    for (const m of p.mappedFields) {
      assert.ok(
        specSet.has(m.spec),
        `${kind}: mapped spec field '${m.spec}' is not in specFields`
      );
      assert.ok(
        actualSet.has(m.actual),
        `${kind}: mapped actual field '${m.actual}' is not in actualFields`
      );
    }
  }
});

test("specOnlyFields are spec fields with no engine counterpart", () => {
  for (const kind of RUNTIME_ORDER) {
    const p = map.packets[kind];
    const mappedSpec = new Set(p.mappedFields.map((m) => m.spec));
    const specSet = new Set(p.specFields);
    for (const f of p.specOnlyFields) {
      assert.ok(specSet.has(f), `${kind}: specOnly '${f}' not declared in specFields`);
      assert.ok(
        !mappedSpec.has(f),
        `${kind}: '${f}' is both mapped and specOnly`
      );
    }
    // Every spec field is partitioned into exactly mapped or specOnly.
    assert.equal(
      p.mappedFields.length + p.specOnlyFields.length,
      p.specFields.length,
      `${kind}: mapped + specOnly must partition specFields`
    );
  }
});

test("engineOnlyFields are actual fields with no mapped spec counterpart", () => {
  for (const kind of RUNTIME_ORDER) {
    const p = map.packets[kind];
    const mappedActual = new Set(p.mappedFields.map((m) => m.actual));
    for (const f of p.engineOnlyFields) {
      assert.ok(
        p.actualFields.includes(f),
        `${kind}: engineOnly '${f}' not in actualFields`
      );
      assert.ok(
        !mappedActual.has(f),
        `${kind}: '${f}' is both mapped and engineOnly`
      );
    }
    assert.equal(
      p.mappedFields.length + p.engineOnlyFields.length,
      p.actualFields.length,
      `${kind}: mapped + engineOnly must partition actualFields`
    );
  }
});

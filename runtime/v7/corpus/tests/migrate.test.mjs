// Tests for the v0.1 → v1 migration: deterministic, lossless (unknown fields preserved),
// confidence mapping correct, and the migrated corpus passes the full contract validator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateCorpus, migrateRecord } from "../lib/migrate.mjs";
import { canonicalJson, loadSchemas, readJson } from "../lib/io.mjs";
import { loadPolicy } from "../lib/source-policy.mjs";
import { validateCorpus } from "../lib/validator.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const policy = loadPolicy();
const schemas = loadSchemas();

test("migrated corpus validates against the v1 contract", () => {
  const v01 = readJson(join(FIX, "corpus.v0_1.json"));
  const { registry, events } = migrateCorpus(v01);
  const res = validateCorpus({
    schemas: { registry: schemas.registry, event: schemas.event, retrieval: schemas.retrieval },
    policy, registry, events, retrievals: [],
  });
  assert.ok(res.valid, JSON.stringify(res.problems));
});

test("migration is deterministic (byte-identical)", () => {
  const v01 = readJson(join(FIX, "corpus.v0_1.json"));
  assert.equal(canonicalJson(migrateCorpus(v01)), canonicalJson(migrateCorpus(v01)));
});

test("confidence maps to the documented (layer, evidence) pair", () => {
  const { source } = migrateRecord({ id: "x", text: "t", source: { type: "dialogue", reference: "r", confidence: "CANON_TEXT" } });
  assert.equal(source.sourceLayer, "C1");
  assert.equal(source.evidenceLevel, "A");
  const g = migrateRecord({ id: "y", text: "t", source: { type: "guide", reference: "r2", confidence: "GUIDE_CONFIRMED" } });
  assert.equal(g.source.sourceLayer, "C2");
});

test("unknown fields are preserved under x_legacy (lossless)", () => {
  const { event } = migrateRecord({ id: "z", text: "t", source: { type: "dialogue", reference: "r", confidence: "CANON_TEXT" }, weird_key: 42 });
  assert.equal(event.x_legacy.weird_key, 42);
});

test("unknown confidence is flagged, not silently defaulted to a real layer/level pair", () => {
  const { source, warnings } = migrateRecord({ id: "u", text: "t", source: { type: "user_note", reference: "r", confidence: "NOPE" } });
  assert.ok(warnings.some((w) => w.code === "MIGRATE_UNKNOWN_CONFIDENCE"));
  // Falls back to the most-restrictive layer (C4/D), never to a permissive one.
  assert.equal(source.sourceLayer, "C4");
  assert.equal(source.evidenceLevel, "D");
});

test("slug-colliding distinct sources are disambiguated, not merged (no capability inheritance)", () => {
  // Two DIFFERENT sources whose references slugify to the same id: a canon dialogue and a
  // guide. Silent merge would let the guide record inherit C1 canon capabilities.
  const v01 = { version: "0.1", records: [
    { id: "a", text: "x", source: { type: "dialogue", reference: "Canon Scene 1", confidence: "CANON_TEXT" } },
    { id: "b", text: "y", source: { type: "guide", reference: "canon-scene-1", confidence: "GUIDE_CONFIRMED" } },
  ] };
  const { registry, events, warnings } = migrateCorpus(v01);
  assert.equal(registry.sources.length, 2, "distinct sources must not merge");
  const layers = registry.sources.map((s) => s.sourceLayer).sort();
  assert.deepEqual(layers, ["C1", "C2"]);
  assert.notEqual(events[0].sourceId, events[1].sourceId);
  assert.ok(warnings.some((w) => w.code === "MIGRATE_SOURCE_COLLISION"));
  // Deterministic: same disambiguated id across runs.
  assert.equal(migrateCorpus(v01).events[1].sourceId, events[1].sourceId);
});

test("genuinely identical sources across records still de-duplicate to one", () => {
  const v01 = { version: "0.1", records: [
    { id: "a", text: "x", source: { type: "dialogue", reference: "same", confidence: "CANON_TEXT" } },
    { id: "b", text: "y", source: { type: "dialogue", reference: "same", confidence: "CANON_TEXT" } },
  ] };
  const { registry } = migrateCorpus(v01);
  assert.equal(registry.sources.length, 1);
});

test("unsluggable / empty records fall back to valid ids (no bare 'src_')", () => {
  const a = migrateRecord({ id: "!!!", text: "x" });
  assert.match(a.event.id, /^evt_[a-z0-9_]+$/);
  assert.match(a.source.id, /^src_[a-z0-9_]+$/);
  assert.ok(a.warnings.some((w) => w.code === "MIGRATE_MISSING_ID"));
  const b = migrateRecord({});
  assert.match(b.source.id, /^src_[a-z0-9_]+$/);
  assert.notEqual(b.source.id, "src_");
});

test("single v0.1 text becomes a 1-message ordered sequence", () => {
  const { event } = migrateRecord({ id: "m", text: "hello", role: "kangel", source: { type: "dialogue", reference: "r", confidence: "CANON_TEXT" } });
  assert.equal(event.messages.length, 1);
  assert.deepEqual({ order: event.messages[0].order, role: event.messages[0].role }, { order: 1, role: "kangel" });
});

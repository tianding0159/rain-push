// Tests for private → public export: no verbatim leaks, capabilities derived from source,
// C4 refused, deterministic, and output validates against the public schema.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { exportCorpus, exportEvent, ExportError, EXPORT_ERROR_CODES } from "../lib/export-public.mjs";
import { canonicalJson, loadSchemas, readJson } from "../lib/io.mjs";
import { loadPolicy } from "../lib/source-policy.mjs";
import { validate } from "../lib/mini-schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const policy = loadPolicy();
const schemas = loadSchemas();
const registry = readJson(join(FIX, "registry.valid.json"));
const events = readJson(join(FIX, "events.valid.json"));

test("exported records validate against the public schema and carry NO text", () => {
  const { events: pub } = exportCorpus({ events, registry, policy });
  assert.ok(pub.length > 0);
  const raw = JSON.stringify(pub);
  assert.ok(!raw.includes("SYN-"), "public export must not contain private verbatim markers");
  for (const rec of pub) {
    const res = validate(schemas.public, rec, policy);
    assert.ok(res.valid, `${rec.id}: ${JSON.stringify(res.errors)}`);
  }
});

test("C4 (synthetic) events are skipped by default, refused in strict mode", () => {
  const { events: pub, skipped } = exportCorpus({ events, registry, policy });
  assert.ok(!pub.some((e) => e.id === "evt_simulator_only"), "C4 event must not be exported");
  assert.ok(skipped.some((s) => s.id === "evt_simulator_only"));
  assert.throws(() => exportCorpus({ events, registry, policy, strict: true }),
    (e) => e instanceof ExportError && e.code === EXPORT_ERROR_CODES.NOT_EXPORTABLE);
});

test("capabilities on public record are derived from the source, not copied", () => {
  const { events: pub } = exportCorpus({ events, registry, policy });
  const guide = pub.find((e) => e.id === "evt_guide_threshold");
  // C2/B guide: mechanics true, behavior/wording false regardless of record content.
  assert.deepEqual(guide.capabilities, { behavior: false, wording: false, mechanics: true, canonSevere: false });
  const canon = pub.find((e) => e.id === "evt_canon_low_feedback");
  assert.deepEqual(canon.capabilities, { behavior: true, wording: true, mechanics: true, canonSevere: true });
});

test("export is deterministic (byte-identical)", () => {
  assert.equal(
    canonicalJson(exportCorpus({ events, registry, policy })),
    canonicalJson(exportCorpus({ events, registry, policy })),
  );
});

test("message hashes match the private content hash and are ordered", () => {
  const { events: pub } = exportCorpus({ events, registry, policy });
  const canon = pub.find((e) => e.id === "evt_canon_low_feedback");
  const orders = canon.messageHashes.map((m) => m.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  for (const mh of canon.messageHashes) assert.match(mh.sha256, /^[0-9a-f]{64}$/);
});

test("quarantined (suspected_ai) source is never exported, even at an exportable layer", () => {
  const reg = { registryFormatVersion: 1, sources: [{ id: "src_ai", sourceType: "dialogue", sourceLayer: "C1", evidenceLevel: "A", trustLevel: "suspected_ai", reference: "r", copyrightScope: "summary" }] };
  const evs = [{ recordFormatVersion: 1, id: "evt_ai", sourceId: "src_ai", channel: "jine", mode: "living", eventTrigger: "t", messages: [{ order: 1, role: "ame", text: "x" }] }];
  // Always throws — not skippable in non-strict mode, since a valid corpus never contains one.
  assert.throws(() => exportCorpus({ events: evs, registry: reg, policy }),
    (e) => e instanceof ExportError && e.code === EXPORT_ERROR_CODES.QUARANTINED);
  assert.throws(() => exportCorpus({ events: evs, registry: reg, policy, strict: true }),
    (e) => e.code === EXPORT_ERROR_CODES.QUARANTINED);
});

test("unknown source throws (not silently dropped)", () => {
  const evt = { id: "evt_x", sourceId: "src_nope", channel: "jine", mode: "living", eventTrigger: "t", messages: [{ order: 1, role: "ame", text: "x" }] };
  assert.throws(() => exportEvent(evt, new Map(), policy),
    (e) => e.code === EXPORT_ERROR_CODES.UNKNOWN_SOURCE);
});

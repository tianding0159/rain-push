// Deterministic v0.1 → v1 migration for private corpus events.
//
// v0.1 is the loose YAML-shaped annotation described in
// runtime/v7/corpus/annotation_contract.md (flat keys: source.type/reference/confidence,
// canon_time, functional_need, p_role, behavior_primitives, expected_reply_class,
// reply_timing_sensitivity, state_effect, route_severity, context_required, notes; a single
// `text` line rather than an ordered message sequence).
//
// This tool maps v0.1 records onto the v1 private-corpus-event schema WITHOUT inventing
// data and WITHOUT dropping information it does not understand:
//   - a lone `text` becomes a single-message sequence (order 1, role inferred/default).
//   - snake_case annotation keys map to their v1 camelCase fields.
//   - source.type/reference are lifted into a synthesized registry source; the record's
//     v0.1 confidence is preserved on that source as `legacyConfidence` for audit.
//   - ANY unrecognized key is preserved verbatim under `x_legacy` so migration is lossless
//     and reversible-by-inspection (the "preserve unknown fields" invariant).
//
// Pure and deterministic: same input → byte-identical output (see io.canonicalJson).

import { createHash } from "node:crypto";
import { loadPolicy, canPublicExport } from "./source-policy.mjs";

export const MIGRATION_FROM_VERSION = "0.1";
export const MIGRATION_TO_VERSION = 1;

// v0.1 confidence vocabulary → (sourceLayer, evidenceLevel) per source-policy semantics.
// This is the documented mapping (also in MIGRATION.md); unknown values are preserved and
// flagged rather than silently defaulted.
const CONFIDENCE_MAP = Object.freeze({
  CANON_TEXT:          { sourceLayer: "C1", evidenceLevel: "A" },
  GUIDE_CONFIRMED:     { sourceLayer: "C2", evidenceLevel: "B" },
  GUIDE_UNCERTAIN:     { sourceLayer: "C2", evidenceLevel: "C" },
  CORPUS_INFERENCE:    { sourceLayer: "C3", evidenceLevel: "C" },
  COMMUNITY_INFERENCE: { sourceLayer: "C3", evidenceLevel: "C" },
  SIMULATOR_EXTENSION: { sourceLayer: "C4", evidenceLevel: "D" },
});

// Known v0.1 keys we explicitly map. Everything else is preserved under x_legacy.
const KNOWN_KEYS = new Set([
  "id", "text", "source", "channel", "persona_surface", "canon_time", "day",
  "canon_state", "event_trigger", "functional_need", "p_role", "behavior_primitives",
  "expected_reply_class", "reply_timing_sensitivity", "state_effect", "route_severity",
  "context_required", "uncertainty", "notes", "role",
]);

function slug(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function collectUnknown(rec) {
  const x = {};
  for (const k of Object.keys(rec)) {
    if (!KNOWN_KEYS.has(k)) x[k] = rec[k];
  }
  return Object.keys(x).length ? x : undefined;
}

// Migrate one v0.1 record. Returns { event, source, warnings }.
// `policy` is injected (defaults to the committed policy) so the "is this layer test-only"
// decision is derived from policy capability, consistent with the validator.
export function migrateRecord(rec, policy = loadPolicy()) {
  const warnings = [];
  const rawId = rec.id != null ? slug(rec.id) : "";
  const eventId = rawId ? `evt_${rawId}` : "evt_unmigrated";
  if (!rawId) warnings.push({ code: "MIGRATE_MISSING_ID", detail: "record had no id; assigned evt_unmigrated" });

  const src = rec.source || {};
  const conf = src.confidence;
  const mapped = CONFIDENCE_MAP[conf];
  if (conf && !mapped) {
    warnings.push({ code: "MIGRATE_UNKNOWN_CONFIDENCE", detail: `unmapped confidence ${JSON.stringify(conf)}; preserved as legacyConfidence` });
  }
  const sourceSlug = slug(src.reference || src.type || eventId);
  const sourceId = sourceSlug ? `src_${sourceSlug}` : "src_unmigrated";

  const source = {
    id: sourceId,
    sourceType: src.type || "user_note",
    sourceLayer: mapped ? mapped.sourceLayer : "C4",
    evidenceLevel: mapped ? mapped.evidenceLevel : "D",
    trustLevel: "unverified",
    reference: src.reference || "(unmigrated v0.1 source)",
    copyrightScope: "summary",
    notes: conf ? `legacyConfidence=${conf}` : "migrated from v0.1",
  };

  const event = { recordFormatVersion: MIGRATION_TO_VERSION, id: eventId, sourceId };
  const put = (k, v) => { if (v !== undefined && v !== null && v !== "") event[k] = v; };
  put("channel", rec.channel);
  put("personaSurface", rec.persona_surface);
  // Mode is derived from the route severity's policy metadata: a severity that requires
  // canon mode → "canon", else "living". Keeps the canon-mode rule in one place (policy).
  const sevMeta = policy.routeSeverities[rec.route_severity];
  put("mode", sevMeta && sevMeta.requiresCanonMode ? "canon" : "living");
  put("canonState", rec.canon_state);
  put("canonTime", rec.canon_time);
  if (Number.isInteger(rec.day)) event.day = rec.day;
  put("eventTrigger", rec.event_trigger || "(unmigrated)");
  put("functionalNeed", rec.functional_need);
  put("pRole", rec.p_role);
  if (Array.isArray(rec.behavior_primitives) && rec.behavior_primitives.length) event.behaviorPrimitives = [...rec.behavior_primitives];
  put("expectedReplyClass", rec.expected_reply_class);
  put("replyTimingSensitivity", rec.reply_timing_sensitivity);
  if (Array.isArray(rec.state_effect) && rec.state_effect.length) event.stateEffect = [...rec.state_effect];
  put("routeSeverity", rec.route_severity);
  if (typeof rec.context_required === "boolean") event.contextRequired = rec.context_required;
  if (Array.isArray(rec.uncertainty) && rec.uncertainty.length) event.uncertainty = [...rec.uncertainty];
  // A test-only (non-exportable) source layer forces syntheticOnly, derived from policy.
  if (!canPublicExport(policy, source.sourceLayer)) event.syntheticOnly = true;
  put("notes", rec.notes);

  // v0.1 single `text` → one-message ordered sequence.
  const role = rec.role && typeof rec.role === "string" ? rec.role : "ame";
  event.messages = [{ order: 1, role, text: rec.text != null ? String(rec.text) : "", verbatim: true }];

  const x = collectUnknown(rec);
  if (x) event.x_legacy = x; // preserved unknown fields

  return { event, source, warnings };
}

// Distinguishing identity of a source: two records may legitimately share a source (same
// provenance), but if their references slugify to the same id while the underlying source
// differs, silently merging would let one record inherit the other's capabilities (e.g. a
// guide record inheriting a canon source). We key equality on the fields that define
// influence + provenance.
function sourceIdentity(s) {
  return [s.sourceType, s.sourceLayer, s.evidenceLevel, s.reference].join("\u0000");
}

// Migrate a v0.1 corpus { version:"0.1", records:[...] } → { registry, events, warnings }.
// Sources are de-duplicated by id when they are genuinely the same provenance. When two
// distinct sources collide on id (slug collision), the later one is disambiguated with a
// deterministic content-hash suffix and a MIGRATE_SOURCE_COLLISION warning is emitted, so
// provenance never silently merges and no record inherits capabilities it wasn't entitled
// to.
export function migrateCorpus(v01, policy = loadPolicy()) {
  const events = [];
  const sourceById = new Map();
  const warnings = [];
  for (const rec of v01.records || []) {
    const { event, source, warnings: w } = migrateRecord(rec, policy);
    const existing = sourceById.get(source.id);
    if (existing && sourceIdentity(existing) !== sourceIdentity(source)) {
      // Slug collision between two distinct sources: disambiguate deterministically.
      const suffix = createHash("sha256").update(sourceIdentity(source)).digest("hex").slice(0, 8);
      const newId = `${source.id}_${suffix}`;
      warnings.push({ recordId: event.id, code: "MIGRATE_SOURCE_COLLISION", detail: `source id ${source.id} collided with a different source; disambiguated to ${newId}` });
      source.id = newId;
      event.sourceId = newId;
    }
    events.push(event);
    if (!sourceById.has(source.id)) sourceById.set(source.id, source);
    for (const item of w) warnings.push({ recordId: event.id, ...item });
  }
  const registry = {
    registryFormatVersion: 1,
    sources: [...sourceById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  return { registry, events, warnings };
}

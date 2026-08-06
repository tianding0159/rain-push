// Character-signal parser: load, structurally validate, and analyse the need/affect sidecar.
//
// Two layers of checking, deliberately distinct:
//   1. SCHEMA validation (hard) — reuses the corpus mini-schema validator, resolving
//      enumFrom against the value-proof signal-policy. A record that fails schema is invalid.
//   2. WELL-FORMEDNESS analysis (soft) — reports how the record sits against the
//      signal-policy constraints (needBlend size, expected 1 primary + 1 opposing, masked/
//      leak cap). These are analysis warnings, NOT rejections: real corpus may legitimately
//      exceed them and we must not silently drop signal (working principle: no field/rule
//      that isn't consumed; here the WARNINGS are consumed by the report + the contradiction
//      metric, not used to delete data).
//
// The parser also exposes contradictoryAffectPresence() — whether a primary AND an opposing
// affect co-occur — which is the single most important value-proof signal (糖糖 = one person,
// contradictory emotions at once). PHASE 11's emotion_coactivation / contradictory_affect
// metrics read this; they do not re-derive role logic.
//
// Zero runtime dependencies. Pure, deterministic.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validate } from "../../corpus/lib/mini-schema.mjs";
import { loadSignalPolicy, constraints } from "./signal-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "schemas", "character-signal.schema.json");

export const SIGNAL_WARNING_CODES = Object.freeze({
  NEED_BLEND_TOO_MANY: "SIG_NEED_BLEND_TOO_MANY",
  NO_PRIMARY: "SIG_NO_PRIMARY",
  MULTIPLE_PRIMARY: "SIG_MULTIPLE_PRIMARY",
  NO_OPPOSING: "SIG_NO_OPPOSING",
  MASKED_LEAK_TOO_MANY: "SIG_MASKED_LEAK_TOO_MANY",
  WEIGHT_ABOVE_ONE: "SIG_WEIGHT_ABOVE_ONE",
});

let _schemaCache = null;
export function loadSignalSchema(path = SCHEMA_PATH) {
  if (path === SCHEMA_PATH && _schemaCache) return _schemaCache;
  const schema = JSON.parse(readFileSync(path, "utf8"));
  if (path === SCHEMA_PATH) _schemaCache = schema;
  return schema;
}

// Roles counted deterministically. Kept here so metrics and report share one definition.
function roleCounts(record) {
  const counts = { primary: 0, opposing: 0, masked: 0, leak: 0 };
  for (const a of record.affectBlend || []) {
    if (a && typeof a.role === "string" && a.role in counts) counts[a.role] += 1;
  }
  return counts;
}

// Does a primary AND an opposing affect co-occur? The core value-proof signal.
export function contradictoryAffectPresence(record) {
  const c = roleCounts(record);
  return c.primary >= 1 && c.opposing >= 1;
}

// How many distinct emotions are simultaneously active (any role).
export function emotionCoactivationCount(record) {
  return Array.isArray(record.affectBlend) ? record.affectBlend.length : 0;
}

// Soft well-formedness analysis against the signal-policy constraints. Returns warnings;
// never mutates or rejects. weight range is enforced hard by the schema minimum; the >1 case
// is a soft warning because weights need not be normalised but a value above 1 is suspicious.
export function analyzeWellFormedness(record, policy) {
  const c = constraints(policy);
  const warnings = [];
  const rc = roleCounts(record);

  if ((record.needBlend || []).length > c.needBlendMax) {
    warnings.push({ code: SIGNAL_WARNING_CODES.NEED_BLEND_TOO_MANY, detail: `needBlend ${record.needBlend.length} > ${c.needBlendMax}` });
  }
  if (rc.primary === 0) {
    warnings.push({ code: SIGNAL_WARNING_CODES.NO_PRIMARY, detail: "no primary affect" });
  }
  if (rc.primary > c.affectPrimaryExpected) {
    warnings.push({ code: SIGNAL_WARNING_CODES.MULTIPLE_PRIMARY, detail: `${rc.primary} primary affects` });
  }
  if (rc.opposing < c.affectOpposingExpected) {
    warnings.push({ code: SIGNAL_WARNING_CODES.NO_OPPOSING, detail: "no opposing affect — contradiction not annotated" });
  }
  if (rc.masked + rc.leak > c.affectMaskedLeakMax) {
    warnings.push({ code: SIGNAL_WARNING_CODES.MASKED_LEAK_TOO_MANY, detail: `masked+leak ${rc.masked + rc.leak} > ${c.affectMaskedLeakMax}` });
  }
  for (const a of record.affectBlend || []) {
    if (typeof a.weight === "number" && a.weight > c.weightMax) {
      warnings.push({ code: SIGNAL_WARNING_CODES.WEIGHT_ABOVE_ONE, detail: `affect ${a.name} weight ${a.weight} > ${c.weightMax}` });
    }
  }
  for (const n of record.needBlend || []) {
    if (typeof n.weight === "number" && n.weight > c.weightMax) {
      warnings.push({ code: SIGNAL_WARNING_CODES.WEIGHT_ABOVE_ONE, detail: `need ${n.name} weight ${n.weight} > ${c.weightMax}` });
    }
  }
  return warnings;
}

// Parse one record: hard schema check + soft analysis. Returns
// { valid, errors, warnings, contradictory, coactivation }.
export function parseSignal(record, { policy = loadSignalPolicy(), schema = loadSignalSchema() } = {}) {
  const { valid, errors } = validate(schema, record, policy);
  if (!valid) {
    return { valid: false, errors, warnings: [], contradictory: false, coactivation: 0 };
  }
  return {
    valid: true,
    errors: [],
    warnings: analyzeWellFormedness(record, policy),
    contradictory: contradictoryAffectPresence(record),
    coactivation: emotionCoactivationCount(record),
  };
}

// Parse a batch, enforcing uniqueness of (eventId, targetMessageOrder). Returns
// { valid, records: [{ record, result }], problems }.
export function parseSignalBatch(records, opts = {}) {
  const policy = opts.policy || loadSignalPolicy();
  const schema = opts.schema || loadSignalSchema();
  const problems = [];
  const seen = new Set();
  const out = [];
  records.forEach((record, i) => {
    const result = parseSignal(record, { policy, schema });
    if (result.valid) {
      const key = `${record.eventId}#${record.targetMessageOrder}`;
      if (seen.has(key)) {
        problems.push({ index: i, code: "SIG_DUP_TARGET", detail: key });
      } else {
        seen.add(key);
      }
    } else {
      problems.push({ index: i, code: "SIG_SCHEMA", detail: result.errors.map((e) => e.code).join(",") });
    }
    out.push({ record, result });
  });
  return { valid: problems.length === 0, records: out, problems };
}

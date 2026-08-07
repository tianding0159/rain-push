// Validator for the P1-1B behavior-grammar-candidate document.
//
// Layers mini-schema (structure) with the two rules the schema language cannot express:
//   1. The literal token `production_ready` is BANNED anywhere in the document. A pilot at n=50
//      must never claim production readiness; a deep string scan enforces it (mini-schema has no
//      recursive string-content keyword).
//   2. pilot_observed_rate must be a number in [0,1] when eligible_opportunity_count > 0, and
//      must be null when it is 0. mini-schema has no nullable-union, so the type is left open in
//      the schema and pinned here.
//
// No verbatim text is required or emitted by this module — it validates STRUCTURE. The private
// bundle carries recordHash links; the committed-safe aggregate strips them. Both validate.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { validate } from "../../../corpus/lib/mini-schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GRAMMAR_SCHEMA_PATH = join(HERE, "..", "schemas", "behavior-grammar-candidate.schema.json");

export const BANNED_TOKEN = "production_ready";

export const GRAMMAR_RULE_CODES = Object.freeze({
  PRODUCTION_READY_BANNED: "PRODUCTION_READY_BANNED",
  RATE_NULL_WITH_OPPORTUNITY: "RATE_NULL_WITH_OPPORTUNITY",
  RATE_NUMBER_WITHOUT_OPPORTUNITY: "RATE_NUMBER_WITHOUT_OPPORTUNITY",
  RATE_OUT_OF_RANGE: "RATE_OUT_OF_RANGE",
});

let cachedSchema = null;
function grammarSchema() {
  if (!cachedSchema) cachedSchema = readJson(GRAMMAR_SCHEMA_PATH);
  return cachedSchema;
}

// Recursively scan every string in the document for the banned token. Returns the JSON paths
// where it appears so a failure points at the offending node.
function scanForBannedToken(node, path, hits) {
  if (typeof node === "string") {
    if (node.toLowerCase().includes(BANNED_TOKEN)) hits.push(path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanForBannedToken(v, `${path}[${i}]`, hits));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.toLowerCase().includes(BANNED_TOKEN)) hits.push(`${path}.${k} (key)`);
      scanForBannedToken(v, path ? `${path}.${k}` : k, hits);
    }
  }
}

// Recursively find every pilotRate object (has observed_count + eligible_opportunity_count) and
// enforce the null-vs-number contract mini-schema cannot.
function checkRates(node, path, errors) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => checkRates(v, `${path}[${i}]`, errors));
    return;
  }
  if (node && typeof node === "object") {
    const isRate =
      Object.prototype.hasOwnProperty.call(node, "eligible_opportunity_count") &&
      Object.prototype.hasOwnProperty.call(node, "pilot_observed_rate");
    if (isRate) {
      const elig = node.eligible_opportunity_count;
      const rate = node.pilot_observed_rate;
      if (elig > 0) {
        if (rate === null || typeof rate !== "number") {
          errors.push({ path: `${path}.pilot_observed_rate`, code: GRAMMAR_RULE_CODES.RATE_NULL_WITH_OPPORTUNITY, detail: "rate must be a number when eligible_opportunity_count > 0" });
        } else if (rate < 0 || rate > 1) {
          errors.push({ path: `${path}.pilot_observed_rate`, code: GRAMMAR_RULE_CODES.RATE_OUT_OF_RANGE, detail: `rate ${rate} outside [0,1]` });
        }
      } else if (rate !== null) {
        errors.push({ path: `${path}.pilot_observed_rate`, code: GRAMMAR_RULE_CODES.RATE_NUMBER_WITHOUT_OPPORTUNITY, detail: "rate must be null when eligible_opportunity_count is 0" });
      }
    }
    for (const [k, v] of Object.entries(node)) {
      checkRates(v, path ? `${path}.${k}` : k, errors);
    }
  }
}

function crossFieldRules(doc) {
  const errors = [];
  const hits = [];
  scanForBannedToken(doc, "", hits);
  for (const p of hits) {
    errors.push({ path: p, code: GRAMMAR_RULE_CODES.PRODUCTION_READY_BANNED, detail: `banned token '${BANNED_TOKEN}' present` });
  }
  checkRates(doc, "", errors);
  return errors;
}

export function validateGrammarCandidate(doc, { schema = grammarSchema() } = {}) {
  const schemaResult = validate(schema, doc, {});
  const ruleErrors = crossFieldRules(doc);
  return {
    valid: schemaResult.valid && ruleErrors.length === 0,
    schemaErrors: schemaResult.errors,
    ruleErrors,
  };
}

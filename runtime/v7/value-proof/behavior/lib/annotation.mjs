// Annotation validator for single-sided behavioral evidence.
//
// Layers schema validation (mini-schema + behavior-vocab as the enum policy) with cross-field
// rules the schema cannot express. Returns { valid, schemaErrors, ruleWarnings }. Rules are
// warnings (guide-conformance signals) unless they touch a hard safety invariant, which are
// errors. No verbatim text is read or emitted here — annotations reference records by hash.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { validate } from "../../../corpus/lib/mini-schema.mjs";
import { loadVocab } from "./vocab.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ANNOTATION_SCHEMA_PATH = join(HERE, "..", "schemas", "behavior-annotation.schema.json");

export const ANNOTATION_RULE_CODES = Object.freeze({
  ALT_INCLUDES_NEED: "ALT_INCLUDES_NEED",
  NEED_NO_UNCERTAINTY: "NEED_NO_UNCERTAINTY",
  AFFECT_C_IN_STATS: "AFFECT_C_IN_STATS",
  MODEL_SELF_ASSERTED_FACT: "MODEL_SELF_ASSERTED_FACT",
  EMPTY_L1: "EMPTY_L1",
  ESCALATION_WITHOUT_FUNCTION: "ESCALATION_WITHOUT_FUNCTION",
});

let schemaCache = null;
function annotationSchema() {
  if (!schemaCache) schemaCache = readJson(ANNOTATION_SCHEMA_PATH);
  return schemaCache;
}

// Cross-field rules. Return arrays of { code, detail, severity }.
function crossFieldRules(ann) {
  const out = [];
  // L3: a candidate's alternatives must not list the need itself.
  for (const c of ann.l3?.candidates || []) {
    if (Array.isArray(c.alternatives) && c.alternatives.includes(c.need)) {
      out.push({ code: ANNOTATION_RULE_CODES.ALT_INCLUDES_NEED, detail: `need ${c.need} listed in its own alternatives`, severity: "error" });
    }
    if (!c.uncertaintyReason || !String(c.uncertaintyReason).trim()) {
      out.push({ code: ANNOTATION_RULE_CODES.NEED_NO_UNCERTAINTY, detail: `need ${c.need} lacks uncertaintyReason`, severity: "error" });
    }
  }
  // Affect: a C_designed_inference concurrency must not be presented as hard evidence. We flag
  // it so the stats layer excludes it; presence alone is allowed (it is a hypothesis).
  if (ann.affect?.concurrencyClass === "C_designed_inference"
      && (ann.affect.opposing || ann.affect.masked || ann.affect.leak)) {
    out.push({ code: ANNOTATION_RULE_CODES.AFFECT_C_IN_STATS, detail: "affect is designed-inference; excluded from pattern statistics", severity: "warning" });
  }
  // Model-suggested annotations may not assert a high-confidence need as fact. We treat
  // confidence >= 0.9 on a modelSuggested need as a self-asserted fact (guide §11).
  if (ann.modelSuggested) {
    for (const c of ann.l3?.candidates || []) {
      if (typeof c.confidence === "number" && c.confidence >= 0.9) {
        out.push({ code: ANNOTATION_RULE_CODES.MODEL_SELF_ASSERTED_FACT, detail: `modelSuggested need ${c.need} at confidence ${c.confidence} — must stay candidate`, severity: "error" });
      }
    }
  }
  // L1 must carry at least one observable act (schema already requires minItems:1, but guard
  // against whitespace-only annotator inputs upstream of schema).
  if ((ann.l1?.behaviorAtoms || []).length === 0) {
    out.push({ code: ANNOTATION_RULE_CODES.EMPTY_L1, detail: "no behavior atoms", severity: "error" });
  }
  // Escalation listed without any interaction function is unsupported.
  const esc = ann.expectedReply?.likelyEscalationIfUnsatisfied || [];
  if (esc.length > 0 && (ann.l2?.functions || []).length === 0) {
    out.push({ code: ANNOTATION_RULE_CODES.ESCALATION_WITHOUT_FUNCTION, detail: "escalation predicted without an interaction function", severity: "warning" });
  }
  return out;
}

export function validateAnnotation(ann, { vocab = loadVocab() } = {}) {
  const schemaResult = validate(annotationSchema(), ann, vocab);
  const rules = crossFieldRules(ann);
  const ruleErrors = rules.filter((r) => r.severity === "error");
  const ruleWarnings = rules.filter((r) => r.severity === "warning");
  return {
    valid: schemaResult.valid && ruleErrors.length === 0,
    schemaErrors: schemaResult.errors,
    ruleErrors,
    ruleWarnings,
  };
}

// Validate a batch; returns per-record results + aggregate counts (deterministic order).
export function validateAnnotationBatch(annotations, opts = {}) {
  const vocab = opts.vocab || loadVocab();
  const results = annotations.map((a) => ({ recordHash: a.recordHash, round: a.round, ...validateAnnotation(a, { vocab }) }));
  return {
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    results,
  };
}

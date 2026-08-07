// Validator for the P1-1A.2 REVISED single-sided behavioral annotation.
//
// Layers mini-schema (structure + enums via behavior-vocab.json) with cross-field rules the schema
// cannot express: multi-function role caps, action-sequence contiguity + length cap, driving-force
// count cap, prior-vs-record separation (a character prior alone can never raise confidence to
// `explicit`), affect-cannot-equal-a-driving-force, trigger `characteristically_low` needs a
// cross-corpus prior, relationship-management / meta-self-monitoring never default, E2 needs written
// evidence, and single-record E3/E4 ban. Returns { valid, schemaErrors, ruleErrors, ruleWarnings }.
//
// No verbatim text is required or emitted by this module — it validates STRUCTURE. Real annotations
// carry text in the gitignored private instance; synthetic test fixtures stay text-free.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { validate } from "../../../corpus/lib/mini-schema.mjs";
import { loadVocab } from "./vocab.mjs";
import { FUNCTION_ROLE_CAPS, MAX_DRIVING_FORCES, MAX_ACTIONS } from "./round-a-revised-form.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REVISED_SCHEMA_PATH = join(HERE, "..", "schemas", "behavior-annotation-revised.schema.json");

// A driving-force `confidence` of "explicit" asserts the inference as fact. Only text that literally
// states the force may be explicit; an inference (even a well-supported one) tops out below it.
export const STRONG_STAT_CONFIDENCES = Object.freeze(["explicit", "strongly_supported"]);

export const REVISED_RULE_CODES = Object.freeze({
  FUNCTION_PRIMARY_CAP: "FUNCTION_PRIMARY_CAP",
  FUNCTION_SECONDARY_CAP: "FUNCTION_SECONDARY_CAP",
  FUNCTION_SUPPORTING_CAP: "FUNCTION_SUPPORTING_CAP",
  ACTION_SEQUENCE_TOO_LONG: "ACTION_SEQUENCE_TOO_LONG",
  ACTION_SEQUENCE_NONCONTIGUOUS: "ACTION_SEQUENCE_NONCONTIGUOUS",
  DRIVING_FORCE_TOO_MANY: "DRIVING_FORCE_TOO_MANY",
  DRIVING_FORCE_NO_CHANGEMYMIND: "DRIVING_FORCE_NO_CHANGEMYMIND",
  DRIVING_FORCE_FROM_AFFECT_ONLY: "DRIVING_FORCE_FROM_AFFECT_ONLY",
  CHARACTER_PRIOR_ALONE_EXPLICIT: "CHARACTER_PRIOR_ALONE_EXPLICIT",
  PRIOR_ONLY_SUPPORT: "PRIOR_ONLY_SUPPORT",
  CHARACTER_PRIOR_NOT_FLAGGED: "CHARACTER_PRIOR_NOT_FLAGGED",
  MODEL_DRIVING_FORCE_EXPLICIT: "MODEL_DRIVING_FORCE_EXPLICIT",
  TRIGGER_LOW_WITHOUT_PRIOR: "TRIGGER_LOW_WITHOUT_PRIOR",
  LOW_TRIGGER_HIGH_ACTIVATION_NOT_FLAGGED: "LOW_TRIGGER_HIGH_ACTIVATION_NOT_FLAGGED",
  SINGLE_RECORD_E3_E4: "SINGLE_RECORD_E3_E4",
  E2_WITHOUT_EVIDENCE: "E2_WITHOUT_EVIDENCE",
  REL_MGMT_ABSENT_WITH_OPS: "REL_MGMT_ABSENT_WITH_OPS",
  REL_MGMT_PRESENT_NO_OPS: "REL_MGMT_PRESENT_NO_OPS",
  META_TAG_WITHOUT_EVIDENCE: "META_TAG_WITHOUT_EVIDENCE",
});

let schemaCache = null;
function revisedSchema() {
  if (!schemaCache) schemaCache = readJson(REVISED_SCHEMA_PATH);
  return schemaCache;
}

function nonEmpty(s) {
  return typeof s === "string" && s.trim().length > 0;
}

// Does the record carry ANY written textual evidence (action / function / driving-force / trigger)?
export function hasWrittenEvidence(ann) {
  const actEv = (ann.behaviorActionSequence || []).some((a) => nonEmpty(a.textualEvidence));
  const fnEv = (ann.interactionFunctions?.functions || []).some((f) => nonEmpty(f.textualEvidence));
  const dfEv = (ann.drivingForceCandidates || []).some((d) => nonEmpty(d.evidence));
  const trEv = nonEmpty(ann.triggerSensitivity?.evidence);
  return actEv || fnEv || dfEv || trEv;
}

// A candidate whose final confidence rests on the character prior alone (no record-specific support).
export function restsOnPriorAlone(candidate) {
  return candidate.recordSpecificSupport === "none"
    && ["weak", "moderate", "strong"].includes(candidate.priorContribution);
}

function crossFieldRules(ann) {
  const out = [];
  const R = REVISED_RULE_CODES;
  const push = (code, detail, severity, path) => out.push({ code, detail, severity, path });

  // --- Multi-function role caps (§3) ---
  const fns = ann.interactionFunctions?.functions || [];
  const roleCount = { primary: 0, secondary: 0, supporting: 0 };
  for (const f of fns) if (f.role in roleCount) roleCount[f.role]++;
  if (roleCount.primary > FUNCTION_ROLE_CAPS.primary) push(R.FUNCTION_PRIMARY_CAP, `primary ${roleCount.primary} > ${FUNCTION_ROLE_CAPS.primary}`, "error", "interactionFunctions");
  if (roleCount.secondary > FUNCTION_ROLE_CAPS.secondary) push(R.FUNCTION_SECONDARY_CAP, `secondary ${roleCount.secondary} > ${FUNCTION_ROLE_CAPS.secondary}`, "error", "interactionFunctions");
  if (roleCount.supporting > FUNCTION_ROLE_CAPS.supporting) push(R.FUNCTION_SUPPORTING_CAP, `supporting ${roleCount.supporting} > ${FUNCTION_ROLE_CAPS.supporting}`, "error", "interactionFunctions");

  // --- Action sequence length + contiguous ordering (§2) ---
  const seq = ann.behaviorActionSequence || [];
  if (seq.length > MAX_ACTIONS) push(R.ACTION_SEQUENCE_TOO_LONG, `${seq.length} > ${MAX_ACTIONS}`, "error", "behaviorActionSequence");
  if (seq.length > 0) {
    const orders = seq.map((a) => a.order);
    const sorted = [...orders].sort((a, b) => a - b);
    const contiguous = sorted.every((v, i) => v === i + 1);
    if (!contiguous) push(R.ACTION_SEQUENCE_NONCONTIGUOUS, `orders ${JSON.stringify(orders)} are not a 1..N permutation`, "error", "behaviorActionSequence");
  }

  // --- Driving-force count + per-candidate rules (§5/§6/§9/§16) ---
  const dfs = ann.drivingForceCandidates || [];
  if (dfs.length > MAX_DRIVING_FORCES) push(R.DRIVING_FORCE_TOO_MANY, `${dfs.length} > ${MAX_DRIVING_FORCES}`, "error", "drivingForceCandidates");
  dfs.forEach((c, i) => {
    const path = `drivingForceCandidates[${i}]`;
    if (!nonEmpty(c.whatWouldChangeMyMind)) push(R.DRIVING_FORCE_NO_CHANGEMYMIND, `${c.candidate} lacks whatWouldChangeMyMind`, "error", path);
    // Affect alone cannot equal a driving force — a behavior/interaction mediator is required (§9).
    const from = Array.isArray(c.inferredFrom) ? c.inferredFrom : [];
    if (from.length === 1 && from[0] === "affect_leak") push(R.DRIVING_FORCE_FROM_AFFECT_ONLY, `${c.candidate} inferred from affect alone`, "error", path);
    // A character prior alone can never raise confidence to explicit (§6).
    if (c.confidence === "explicit" && c.recordSpecificSupport === "none") push(R.CHARACTER_PRIOR_ALONE_EXPLICIT, `${c.candidate} explicit with no record-specific support`, "error", path);
    // Prior-heavy, record-light, yet strongly confident → flag for review (§6).
    if (restsOnPriorAlone(c) && STRONG_STAT_CONFIDENCES.includes(c.confidence)) push(R.PRIOR_ONLY_SUPPORT, `${c.candidate} confidence ${c.confidence} rests on prior alone`, "warning", path);
    // Model-suggested inference may not be asserted as fact (§16).
    if (ann.modelSuggested && c.confidence === "explicit") push(R.MODEL_DRIVING_FORCE_EXPLICIT, `modelSuggested ${c.candidate} at explicit — must stay candidate`, "error", path);
    // If a character prior was used, it must be surfaced via the review flag (§17).
    if (from.includes("character_prior") && !(ann.reviewFlags || []).includes("character_prior_used")) push(R.CHARACTER_PRIOR_NOT_FLAGGED, `${c.candidate} used character_prior without reviewFlag character_prior_used`, "warning", path);
  });

  // --- Trigger sensitivity: characteristically_low needs a cross-corpus prior (§8) ---
  const ts = ann.triggerSensitivity;
  if (ts) {
    if (ts.thresholdInterpretation === "characteristically_low" && ts.requiresCrossCorpusSupport !== true) {
      push(R.TRIGGER_LOW_WITHOUT_PRIOR, "characteristically_low set without requiresCrossCorpusSupport", "error", "triggerSensitivity");
    }
    // Low observed trigger + high inferred activation is a signature candidate — must be flagged (§7/§18).
    const lowTrigger = ["minimal", "low"].includes(ts.observedTriggerIntensity);
    if (lowTrigger && ts.inferredInternalActivation === "high" && !(ann.reviewFlags || []).includes("low_trigger_high_activation_candidate")) {
      push(R.LOW_TRIGGER_HIGH_ACTIVATION_NOT_FLAGGED, "low trigger + high activation not flagged", "warning", "triggerSensitivity");
    }
  }

  // --- Single record grade discipline (§16) ---
  if (ann.evidenceGrade === "E3" || ann.evidenceGrade === "E4") push(R.SINGLE_RECORD_E3_E4, `single record cannot be ${ann.evidenceGrade}`, "error", "evidenceGrade");
  if (ann.evidenceGrade === "E2" && !hasWrittenEvidence(ann)) push(R.E2_WITHOUT_EVIDENCE, "E2 requires written evidence somewhere", "error", "evidenceGrade");

  // --- Relationship management never defaults true (§12) ---
  const rm = ann.relationshipManagement;
  if (rm) {
    const ops = rm.operations || [];
    if (rm.present !== true && ops.length > 0) push(R.REL_MGMT_ABSENT_WITH_OPS, "operations listed while present is not true", "error", "relationshipManagement");
    if (rm.present === true && ops.length === 0) push(R.REL_MGMT_PRESENT_NO_OPS, "present true but no operations listed", "warning", "relationshipManagement");
  }

  // --- Meta self-monitoring not defaulted (§13): a substantive tag needs evidence ---
  const meta = ann.metaSelfMonitoring;
  if (meta) {
    const tags = (meta.tags || []).filter((t) => t !== "none" && t !== "unknown");
    if (tags.length > 0 && !nonEmpty(meta.evidence)) push(R.META_TAG_WITHOUT_EVIDENCE, `meta tags ${JSON.stringify(tags)} without evidence`, "warning", "metaSelfMonitoring");
  }

  return out;
}

export function validateRevisedAnnotation(ann, { vocab = loadVocab() } = {}) {
  const schemaResult = validate(revisedSchema(), ann, vocab);
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

export function validateRevisedBatch(annotations, opts = {}) {
  const vocab = opts.vocab || loadVocab();
  const results = annotations.map((a) => ({ presentationId: a.presentationId, ...validateRevisedAnnotation(a, { vocab }) }));
  return {
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    results,
  };
}

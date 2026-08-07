// Behavior-pattern validator + evidence-grade gate.
//
// The schema validates a pattern's SHAPE. This module enforces the E3/E4 REQUIREMENTS from
// docs/EVIDENCE_GRADING.md, which depend on cross-record facts the schema cannot see:
//   E3: >=MIN_E3_SUPPORT distinct supporting records, >=2 wording variants, >=2 affect
//       variants, counterexample check performed, re-review consistent.
//   E4: E3 plus cross-cluster>=2, predictive value flagged, not single-keyword, human reviewed.
// A pattern whose CLAIMED grade exceeds what its evidence supports is downgraded, and the gap
// is reported. Nothing is deleted — rejected patterns keep their hashes for auditability.
//
// No verbatim text. Records are referenced by hash; variant counts come from the pattern's own
// declared counters (surfaceVariantCount / affectVariantCount), which the pilot tooling fills
// from the redacted annotations.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";
import { validate } from "../../../corpus/lib/mini-schema.mjs";
import { loadVocab } from "./vocab.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PATTERN_SCHEMA_PATH = join(HERE, "..", "schemas", "behavior-pattern.schema.json");

export const MIN_E3_SUPPORT = 8;      // §14: each E3 needs >=8 non-duplicate supporting samples
export const MIN_E4_CLUSTERS = 2;     // §3 E4: appears across multiple corpus clusters

export const GRADE_GATE_CODES = Object.freeze({
  INSUFFICIENT_SUPPORT: "INSUFFICIENT_SUPPORT",
  TOO_FEW_WORDING_VARIANTS: "TOO_FEW_WORDING_VARIANTS",
  TOO_FEW_AFFECT_VARIANTS: "TOO_FEW_AFFECT_VARIANTS",
  NO_COUNTEREXAMPLE_CHECK: "NO_COUNTEREXAMPLE_CHECK",
  NOT_REREVIEW_CONSISTENT: "NOT_REREVIEW_CONSISTENT",
  NOT_CROSS_CLUSTER: "NOT_CROSS_CLUSTER",
  NOT_HUMAN_REVIEWED: "NOT_HUMAN_REVIEWED",
  DUPLICATE_SUPPORT_HASHES: "DUPLICATE_SUPPORT_HASHES",
});

let schemaCache = null;
function patternSchema() {
  if (!schemaCache) schemaCache = readJson(PATTERN_SCHEMA_PATH);
  return schemaCache;
}

// Grade order derives from the vocab SSOT (evidenceGrades) — no hardcoded duplicate list.
const GRADE_ORDER = loadVocab().evidenceGrades;
function gradeIndex(g) { return GRADE_ORDER.indexOf(g); }

// Which requirements fail for a *target* grade. Returns array of { code, detail }.
function gradeGaps(p, targetGrade) {
  const gaps = [];
  const support = Array.isArray(p.supportingRecordHashes) ? p.supportingRecordHashes : [];
  const uniqueSupport = new Set(support);
  if (uniqueSupport.size !== support.length) {
    gaps.push({ code: GRADE_GATE_CODES.DUPLICATE_SUPPORT_HASHES, detail: `${support.length - uniqueSupport.size} duplicate support hashes` });
  }
  const needE3 = gradeIndex(targetGrade) >= gradeIndex("E3");
  const needE4 = gradeIndex(targetGrade) >= gradeIndex("E4");
  if (needE3) {
    if (uniqueSupport.size < MIN_E3_SUPPORT) {
      gaps.push({ code: GRADE_GATE_CODES.INSUFFICIENT_SUPPORT, detail: `${uniqueSupport.size} < ${MIN_E3_SUPPORT}` });
    }
    if ((p.surfaceVariantCount || 0) < 2) {
      gaps.push({ code: GRADE_GATE_CODES.TOO_FEW_WORDING_VARIANTS, detail: `surfaceVariantCount ${p.surfaceVariantCount || 0} < 2` });
    }
    if ((p.affectVariantCount || 0) < 2) {
      gaps.push({ code: GRADE_GATE_CODES.TOO_FEW_AFFECT_VARIANTS, detail: `affectVariantCount ${p.affectVariantCount || 0} < 2` });
    }
    // counterexample CHECK performed: the field must be present (empty array = checked, none
    // found; absent = not checked). We model "checked" as the property existing.
    if (!Array.isArray(p.counterexampleRecordHashes)) {
      gaps.push({ code: GRADE_GATE_CODES.NO_COUNTEREXAMPLE_CHECK, detail: "counterexampleRecordHashes missing" });
    }
    if (p.reReviewConsistent !== true) {
      gaps.push({ code: GRADE_GATE_CODES.NOT_REREVIEW_CONSISTENT, detail: "reReviewConsistent !== true" });
    }
  }
  if (needE4) {
    if ((p.crossClusterCount || 0) < MIN_E4_CLUSTERS) {
      gaps.push({ code: GRADE_GATE_CODES.NOT_CROSS_CLUSTER, detail: `crossClusterCount ${p.crossClusterCount || 0} < ${MIN_E4_CLUSTERS}` });
    }
    if (p.humanReviewed !== true) {
      gaps.push({ code: GRADE_GATE_CODES.NOT_HUMAN_REVIEWED, detail: "humanReviewed !== true" });
    }
  }
  return gaps;
}

// Highest grade the evidence actually supports (E0..E4).
export function supportedGrade(p) {
  for (let i = GRADE_ORDER.length - 1; i >= 0; i--) {
    const g = GRADE_ORDER[i];
    if (gradeIndex(g) < gradeIndex("E3")) return g; // E0-E2 have no cross-record gate here
    if (gradeGaps(p, g).length === 0) return g;
  }
  return "E0";
}

// Validate one pattern: schema + grade gate. Downgrades claimedGrade to supportedGrade if the
// evidence is short, and reports the gap. Never throws on evidence shortfall.
export function validatePattern(p, { vocab = loadVocab() } = {}) {
  const schemaResult = validate(patternSchema(), p, vocab);
  const claimed = p.evidenceGrade;
  const supported = supportedGrade(p);
  const downgraded = gradeIndex(supported) < gradeIndex(claimed);
  const gaps = downgraded ? gradeGaps(p, claimed) : [];
  return {
    patternId: p.patternId,
    valid: schemaResult.valid,
    schemaErrors: schemaResult.errors,
    claimedGrade: claimed,
    supportedGrade: supported,
    downgraded,
    gaps,
    // A pattern may inform generation rules ONLY if it validly holds at E3+ AND is reviewed.
    eligibleForBehaviorRule: schemaResult.valid
      && gradeIndex(supported) >= gradeIndex("E3")
      && p.reviewStatus === "reviewed",
  };
}

export function validatePatternBatch(patterns, opts = {}) {
  const vocab = opts.vocab || loadVocab();
  const results = patterns.map((p) => validatePattern(p, { vocab }));
  return {
    total: results.length,
    schemaValid: results.filter((r) => r.valid).length,
    downgraded: results.filter((r) => r.downgraded).length,
    eligibleForBehaviorRule: results.filter((r) => r.eligibleForBehaviorRule).length,
    e3plus: results.filter((r) => gradeIndex(r.supportedGrade) >= gradeIndex("E3")).length,
    results,
  };
}

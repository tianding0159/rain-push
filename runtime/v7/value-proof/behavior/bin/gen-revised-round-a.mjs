#!/usr/bin/env node
// Assemble + validate + emit the REVISED Round-A pass (P1-1A.2).
//
// This script is committed and VERBATIM-FREE. It reads two PRIVATE (gitignored) inputs:
//   1. private/pilot-50/round-a.private.json         — the pilot pack (presentationId + text)
//   2. private/pilot-50/round-a.revised.source.mjs   — the per-record analyses I authored
// and produces three PRIVATE outputs:
//   - private/pilot-50/round-a.revised.private.json         (full validated annotations, WITH text)
//   - private/pilot-50/round-a.review-priority.private.json (P1/P2/P3 buckets, verbatim-free)
//   - private/pilot-50/round-a.stats.private.json           (descriptive stats, verbatim-free)
//
// Each analysis is deep-merged over an empty makeRoundARevisedForm() so authors only specify
// meaningful fields; the merged annotation is then validated with revised-annotation.mjs. The run
// FAILS LOUD if any record is invalid, so an out-of-vocab label or a broken prior/record separation
// can never slip into the private output. The raw corpus is never opened here.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAILURE_RISK_PROMPTS } from "../lib/round-a-revised-form.mjs";
import { validateRevisedAnnotation } from "../lib/revised-annotation.mjs";
import { computeRoundAStats, computeReviewPriority } from "../lib/round-a-stats.mjs";
import { resolveRawPath } from "../lib/raw-corpus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "..", "private", "pilot-50");
const PACK = join(DIR, "round-a.private.json");
const SOURCE = join(DIR, "round-a.revised.source.mjs");
const OUT = join(DIR, "round-a.revised.private.json");
const OUT_PRIORITY = join(DIR, "round-a.review-priority.private.json");
const OUT_STATS = join(DIR, "round-a.stats.private.json");

// A SCHEMA-VALID skeleton (all enum/boolean fields at legal "unknown"/false defaults). The author's
// analysis is merged over this; anything the author omits stays at a valid default (not the empty-form
// "" / null placeholders, which are for human fill-in and are intentionally not schema-valid).
function validSkeleton(presentationId, text) {
  const unknownDim = () => ({ value: "other", confidence: "unknown" });
  const unknownReply = () => ({ classes: [], confidence: "unknown" });
  return {
    recordFormatVersion: 2,
    presentationId,
    text,
    annotator: "claude(model_assisted_research)",
    round: "A",
    modelSuggested: true,
    annotationNature: "model_assisted_research_annotation",
    l1_observable: { observableActs: ["(unspecified)"], grammaticalForm: [], target: "unknown" },
    behaviorActionSequence: [{ action: "no_clear_action", order: 1, confidence: "unknown", textualEvidence: "(unspecified)" }],
    interactionFunctions: { functions: [{ function: "unknown", role: "primary", confidence: "unknown" }] },
    affect: { primarySurface: unknownDim(), coexistenceType: "unknown" },
    drivingForceCandidates: [],
    triggerSensitivity: { domain: "other", observedTriggerIntensity: "unknown", inferredInternalActivation: "unknown", thresholdInterpretation: "unknown", confidence: "unknown", requiresCrossCorpusSupport: false },
    relationshipManagement: { present: false, operations: [] },
    metaSelfMonitoring: { tags: [] },
    stateContext: { domains: [] },
    expectedReply: { immediateReply: unknownReply(), relationshipReply: unknownReply(), longerTermReply: unknownReply(), likelyUnsatisfyingReplyClasses: [] },
    evidenceGrade: "E0",
    reviewFlags: [],
    failureRiskNotes: FAILURE_RISK_PROMPTS.map((p) => ({ id: p.id, note: "" })),
  };
}

// Deep-merge `patch` onto `base`. Arrays in the patch REPLACE the base array (we author full arrays).
function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.slice();
  if (patch && typeof patch === "object" && base && typeof base === "object" && !Array.isArray(base)) {
    const out = { ...base };
    for (const k of Object.keys(patch)) out[k] = deepMerge(base[k], patch[k]);
    return out;
  }
  return patch === undefined ? base : patch;
}

async function main() {
  if (!existsSync(PACK)) { process.stderr.write(`missing ${PACK}\n`); process.exit(1); }
  if (!existsSync(SOURCE)) { process.stderr.write(`missing ${SOURCE}\n`); process.exit(1); }

  const rawPath = resolveRawPath()?.path;
  const preHash = rawPath && existsSync(rawPath) ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  const pack = JSON.parse(readFileSync(PACK, "utf8"));
  const byId = new Map(pack.forms.map((f) => [f.presentationId, f.text]));
  const { ANALYSES } = await import("file://" + SOURCE);

  const annotations = [];
  const failures = [];
  for (const a of ANALYSES) {
    const text = byId.get(a.presentationId);
    if (text === undefined) { failures.push({ id: a.presentationId, why: "presentationId not in pack" }); continue; }
    const skel = validSkeleton(a.presentationId, text);
    const merged = deepMerge(skel, a);
    merged.modelSuggested = true;
    const v = validateRevisedAnnotation(merged);
    if (!v.valid) failures.push({ id: a.presentationId, schemaErrors: v.schemaErrors, ruleErrors: v.ruleErrors });
    annotations.push(merged);
  }

  if (failures.length > 0) {
    process.stderr.write("VALIDATION FAILURES:\n" + JSON.stringify(failures, null, 2) + "\n");
    process.exit(1);
  }
  if (annotations.length !== pack.forms.length) {
    process.stderr.write(`count mismatch: ${annotations.length} annotations vs ${pack.forms.length} forms\n`);
    process.exit(1);
  }

  // Warnings are informational (review signals), collected for the report but not fatal.
  const warnings = [];
  for (const ann of annotations) {
    const v = validateRevisedAnnotation(ann);
    for (const w of v.ruleWarnings) warnings.push({ id: ann.presentationId, code: w.code, detail: w.detail });
  }

  const stats = computeRoundAStats(annotations);
  const priority = computeReviewPriority(annotations);

  writeFileSync(OUT, JSON.stringify({
    formatVersion: 2, round: "A", visibility: "private",
    annotationNature: "model_assisted_research_annotation",
    note: "NOT human ground truth — user will review/edit/overturn.",
    annotations,
  }, null, 2) + "\n");
  writeFileSync(OUT_PRIORITY, JSON.stringify({ visibility: "private", ...priority }, null, 2) + "\n");
  writeFileSync(OUT_STATS, JSON.stringify({ visibility: "private", warnings, stats }, null, 2) + "\n");

  const postHash = rawPath && existsSync(rawPath) ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  process.stdout.write(JSON.stringify({
    status: "ROUND_A_REVISED_READY_FOR_HUMAN_REVIEW",
    records: annotations.length,
    warnings: warnings.length,
    priorityCounts: priority.counts,
    gradeDistribution: stats.evidenceGradeDistribution,
    rawHashUnchanged: preHash === postHash,
    outputs: ["round-a.revised.private.json", "round-a.review-priority.private.json", "round-a.stats.private.json"],
  }, null, 2) + "\n");
}

main().catch((e) => { process.stderr.write("fatal: " + e.message + "\n" + (e.stack || "") + "\n"); process.exit(1); });

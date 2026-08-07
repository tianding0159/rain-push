#!/usr/bin/env node
// P1-1C §5 — annotate the 200-record set with the deterministic heuristic annotator.
//
// Produces annotations for ALL 200 (so holdout can be validated later WITHOUT re-touching the
// annotator), but writes them into TWO sealed files:
//   private/behavior-200/annotation.private.json    ← 160 discovery/stability annotations
//   private/behavior-200/holdout-40.private.json     ← 40 holdout annotations (SEALED)
// plus the originals' refined annotations are reused verbatim for the 50 that carry over.
//
// The holdout file is written but must NOT be read by any discovery/stability/grammar engine until
// the grammar is frozen (§17). A separate flag file records the freeze gate.
//
// Enforces the guide freeze (§4): if the guide fingerprint drifted structurally since freeze, abort
// with GUIDE_FREEZE_BROKEN and emit nothing.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { resolveRawPath } from "../lib/raw-corpus.mjs";
import { annotateRecord } from "../lib/heuristic-annotator.mjs";
import { validateRevisedAnnotation } from "../lib/revised-annotation.mjs";
import { enforceFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const SEL = join(V7, "private", "behavior-200", "selection.private.json");
const REFINED_50 = join(V7, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const FREEZE = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");
const OUT_DIR = join(V7, "private", "behavior-200");

function sha256File(p) { return createHash("sha256").update(readFileSync(p)).digest("hex"); }

// The refined-50 skeleton lacks maskAnalysis on non-mask records; normalize so all 200 share shape.
function normalizeMask(ann) {
  if (!ann.maskAnalysis) {
    ann.maskAnalysis = { functionalMask: false, maskStrategy: null, revealWithoutMask: false, definition: "functional (§16)" };
  } else {
    if (typeof ann.maskAnalysis.revealWithoutMask !== "boolean") ann.maskAnalysis.revealWithoutMask = false;
    if (!("maskStrategy" in ann.maskAnalysis)) ann.maskAnalysis.maskStrategy = null;
  }
  return ann;
}

function main() {
  for (const p of [SEL, REFINED_50, FREEZE]) if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }

  // ---- §4 freeze enforcement ----
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8"));
  const { ok: freezeOk, freezeCheck } = enforceFreeze(freeze);
  if (!freezeOk) {
    process.stdout.write(canonicalJson({ status: "GUIDE_FREEZE_BROKEN", freezeCheck }) + "\n");
    process.exit(2);
  }

  const resolved = resolveRawPath();
  const rawPath = resolved ? resolved.path : null;
  const preHash = rawPath ? sha256File(rawPath) : null;

  const sel = JSON.parse(readFileSync(SEL, "utf8"));
  const refined50 = JSON.parse(readFileSync(REFINED_50, "utf8")).annotations;
  // refined-50 key on linkId (== recordHash); presentationId is a fallback.
  const refinedByHash = new Map(refined50.map((a) => [a.linkId || a.recordHash, a]));
  const refinedById = new Map(refined50.map((a) => [a.presentationId, a]));

  const discovery = [];
  const holdout = [];
  const failures = [];

  for (const rec of sel.records) {
    let ann;
    if (rec.source === "original") {
      // reuse the frozen refined-50 annotation (hand-authored ground for the carry-over 50)
      const prior = refinedByHash.get(rec.recordHash) || refinedById.get(rec.presentationId);
      if (!prior) { failures.push({ id: rec.presentationId, why: "original refined annotation missing" }); continue; }
      ann = normalizeMask(JSON.parse(JSON.stringify(prior)));
      ann.presentationId = rec.presentationId; // keep PA id
      ann.annotationProvenance = "carried_from_refined_50";
    } else {
      ann = normalizeMask(annotateRecord({ presentationId: rec.presentationId, recordHash: rec.recordHash, text: rec.text }));
      ann.recordFormatVersion = 2;
      ann.annotator = "heuristic(deterministic_conservative)";
      ann.round = "C";
      ann.modelSuggested = true;
      ann.annotationNature = "model_assisted_research_annotation";
      ann.annotationProvenance = "heuristic_200";
      if (!ann.failureRiskNotes) ann.failureRiskNotes = [];
      if (!ann.stateContext) ann.stateContext = { domains: [] };
    }
    ann.linkId = rec.recordHash;
    ann.split = rec.split;
    // Validate a copy stripped of extension fields (schema is additionalProperties:false; linkId /
    // maskAnalysis / split / provenance are 1-1C extensions carried alongside the schema-valid core).
    const core = JSON.parse(JSON.stringify(ann));
    for (const k of ["linkId", "maskAnalysis", "split", "annotationProvenance"]) delete core[k];
    if (core.triggerSensitivity) delete core.triggerSensitivity.refinedFrom; // refined-50 extension
    const v = validateRevisedAnnotation(core);
    if (!v.valid) failures.push({ id: rec.presentationId, schemaErrors: v.schemaErrors?.slice(0, 3), ruleErrors: v.ruleErrors?.slice(0, 3) });
    (rec.split === "holdout" ? holdout : discovery).push(ann);
  }

  if (failures.length) {
    process.stderr.write("VALIDATION FAILURES (" + failures.length + "):\n" + JSON.stringify(failures.slice(0, 10), null, 2) + "\n");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const sortById = (arr) => arr.slice().sort((a, b) => a.presentationId.localeCompare(b.presentationId));

  writeFileSync(join(OUT_DIR, "annotation.private.json"), canonicalJson({
    formatVersion: 1, visibility: "PRIVATE_DO_NOT_COMMIT", stage: "P1-1C-200",
    set: "discovery_stability_160",
    annotationNature: "model_assisted_research_annotation",
    note: "NOT human ground truth. 50 carried from refined-50; 110 new via deterministic heuristic annotator.",
    guideFreezeVersion: freeze.guideFreezeVersion,
    count: discovery.length,
    annotations: sortById(discovery),
  }) + "\n");

  writeFileSync(join(OUT_DIR, "holdout-40.private.json"), canonicalJson({
    formatVersion: 1, visibility: "PRIVATE_DO_NOT_COMMIT", stage: "P1-1C-200",
    set: "holdout_40",
    sealed: true,
    warning: "SEALED — must not be read by any discovery/stability/grammar engine until grammar is frozen (§17).",
    guideFreezeVersion: freeze.guideFreezeVersion,
    count: holdout.length,
    annotations: sortById(holdout),
  }) + "\n");

  const postHash = rawPath ? sha256File(rawPath) : null;
  const gradeDist = {};
  for (const a of discovery) gradeDist[a.evidenceGrade] = (gradeDist[a.evidenceGrade] || 0) + 1;

  process.stdout.write(canonicalJson({
    status: "ANNOTATION_200_READY",
    freezeStatus: freezeCheck.status,
    discoveryCount: discovery.length,
    holdoutCount: holdout.length,
    carriedFrom50: discovery.filter((a) => a.annotationProvenance === "carried_from_refined_50").length,
    heuristicNew: discovery.filter((a) => a.annotationProvenance === "heuristic_200").length,
    discoveryGradeDistribution: gradeDist,
    rawHashUnchanged: preHash === postHash,
  }) + "\n");
}

main();

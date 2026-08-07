#!/usr/bin/env node
// P1-1E — Instrument A isolation kit generator.
//
// Produces a SELF-CONTAINED annotation kit that an INDEPENDENT, context-clean session runs to produce
// the 150 Instrument A annotations. The kit deliberately contains ONLY:
//   - the frozen guide + protocol docs + schema + vocabulary
//   - the Instrument A identity manifest + freeze lock (so the fresh session can VERIFY it matches)
//   - the 150 raw single-sided texts, split-labeled; holdout SEALED in a separate file
//   - a per-record output template + a filled EXEMPLAR (one original-50 record) for depth calibration
//   - a QA checklist + a validator the fresh session runs before returning
//
// It contains NOTHING that would leak the study to the annotator: no Instrument B annotations, no
// mixed-200 grammar conclusions, no H1-H11 statuses, no GC lists, no P1-1D bias findings, no priors.
//
// The kit lives under private/ (gitignored) because it carries raw character text.

import { writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { buildInstrumentAManifest, matchClass } from "../lib/instrument-a-manifest.mjs";
import { buildFreezeLock } from "../lib/freeze-lock.mjs";
import { fingerprintAnnotations } from "../lib/instrument-a-validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..");                 // behavior/
const ROOT = join(HERE, "..", "..");         // value-proof/
const SEL = join(ROOT, "private", "behavior-200", "selection.private.json");
const REF50 = join(ROOT, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const ANN160 = join(ROOT, "private", "behavior-200", "annotation.private.json");
const HOLD40 = join(ROOT, "private", "behavior-200", "holdout-40.private.json");
const KIT = join(ROOT, "private", "behavior-200-a", "instrument-a-kit");

const sha = (s) => createHash("sha256").update(s).digest("hex");

// Per-record output template — the exact shape an Instrument A annotation must have (mirrors the
// original-50 records). Values are placeholders the annotator replaces; enum choices come from vocab.
function outputTemplate() {
  return {
    recordFormatVersion: 2,
    presentationId: "<from record>",
    annotator: "claude(model_assisted_research)",
    round: "A",
    modelSuggested: true,
    annotationNature: "model_assisted_research_annotation",
    l1_observable: {
      observableActs: [], grammaticalForm: [], target: "partner|self|third_party|ambiguous",
      selfDisclosure: false, personaSurfaceCandidate: "", punctuationRhythmNotes: "",
    },
    behaviorActionSequence: [
      { action: "<behaviorActions enum>", order: 1, confidence: "<confidenceTags>", textualEvidence: "", notes: "" },
    ],
    interactionFunctions: { functions: [
      { function: "<interactionFunctions enum>", role: "<functionRoles>", confidence: "<confidenceTags>", textualEvidence: "", alternatives: [], contextDependency: "low|medium|high" },
    ] },
    affect: {
      primarySurface: { value: "<affectLabels>", confidence: "<confidenceTags>" },
      coexistenceType: "<coexistenceTypes|null>",
      opposingAffect: null,
    },
    drivingForceCandidates: [
      { candidate: "<drivingForces enum>", confidence: "<confidenceTags>", evidence: "", alternativeExplanation: "", whatWouldChangeMyMind: "", contextDependency: "low|medium|high", inferredFrom: [], priorContribution: "none|weak|moderate|strong", recordSpecificSupport: "none|weak|moderate|strong" },
    ],
    triggerSensitivity: { domain: "<triggerDomains enum>", confidence: "<confidenceTags>", intensity: "<triggerIntensities|null>", evidence: "" },
    relationshipManagement: { present: false, operations: [], confidence: "<confidenceTags>", evidence: "" },
    metaSelfMonitoring: { present: false, tags: [], confidence: "<confidenceTags>", evidence: "" },
    stateContext: { domains: [] },
    expectedReply: {
      immediateReply: { classes: [], confidence: "<confidenceTags>", contextRequired: "low|medium|high" },
      relationshipReply: { classes: [], confidence: "<confidenceTags>" },
      longerTermReply: { classes: [], confidence: "<confidenceTags>" },
      likelyUnsatisfyingReplyClasses: [],
    },
    maskAnalysis: { functionalMask: false, maskStrategy: null, revealWithoutMask: false, definition: "functional (§16)" },
    evidenceGrade: "E0|E1|E2",
    reviewFlags: [],
    failureRiskNotes: [],
  };
}

function readAnnArray(p) {
  const d = JSON.parse(readFileSync(p, "utf8"));
  return d.annotations || d.records || (Array.isArray(d) ? d : []);
}

function main() {
  for (const p of [SEL, REF50, ANN160, HOLD40]) if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }

  const manifest = buildInstrumentAManifest();
  const cls = matchClass(manifest);
  if (cls === "INSTRUMENT_A_IDENTITY_UNRESOLVED") {
    process.stdout.write(canonicalJson({ status: "INSTRUMENT_A_IDENTITY_UNRESOLVED" })); process.exit(3);
  }
  const freeze = buildFreezeLock();

  const sel = JSON.parse(readFileSync(SEL, "utf8"));
  const selById = new Map(sel.records.map((r) => [r.presentationId, r]));

  // The 150 to re-annotate = everything NOT carried from the refined-50.
  const carried = new Set(readAnnArray(REF50).map((r) => r.presentationId));
  const discoveryNew = [];
  const holdoutNew = [];
  for (const r of sel.records) {
    if (carried.has(r.presentationId)) continue;
    const item = { presentationId: r.presentationId, split: r.split, text: r.text, textLen: [...(r.text || "")].length, recordHash: r.recordHash };
    if (r.split === "holdout") holdoutNew.push(item); else discoveryNew.push(item);
  }
  discoveryNew.sort((a, b) => (a.presentationId < b.presentationId ? -1 : 1));
  holdoutNew.sort((a, b) => (a.presentationId < b.presentationId ? -1 : 1));

  mkdirSync(KIT, { recursive: true });
  mkdirSync(join(KIT, "guide"), { recursive: true });

  // 1. frozen guide/protocol/schema/vocab — copied verbatim so the fresh session reads the SAME ruler.
  const guideFiles = [
    ["docs/ANNOTATION_GUIDE_REVISED.md", "guide/ANNOTATION_GUIDE_REVISED.md"],
    ["docs/EVIDENCE_GRADING.md", "guide/EVIDENCE_GRADING.md"],
    ["docs/EXPECTED_REPLY_GUIDE.md", "guide/EXPECTED_REPLY_GUIDE.md"],
    ["docs/TRANSITION_GUIDE.md", "guide/TRANSITION_GUIDE.md"],
    ["schemas/behavior-annotation-revised.schema.json", "guide/behavior-annotation-revised.schema.json"],
    ["policy/behavior-vocab.json", "guide/behavior-vocab.json"],
  ];
  for (const [src, dst] of guideFiles) copyFileSync(join(V7, src), join(KIT, dst));

  // 2. identity + freeze so the fresh session can VERIFY it is the same instrument before starting.
  writeFileSync(join(KIT, "instrument-a-manifest.json"), canonicalJson({ matchClass: cls, manifest }));
  writeFileSync(join(KIT, "freeze-lock.json"), canonicalJson(freeze));

  // 3. the raw texts to annotate — discovery OPEN, holdout SEALED separately.
  writeFileSync(join(KIT, "records-discovery-110.json"), canonicalJson({
    visibility: "PRIVATE", split: "discovery", count: discoveryNew.length, records: discoveryNew,
  }));
  writeFileSync(join(KIT, "records-holdout-40.SEALED.json"), canonicalJson({
    visibility: "PRIVATE_SEALED",
    warning: "DO NOT annotate or read these until the grammar is frozen on the 160-A discovery set. Annotate in a SEPARATE fresh session after freeze.",
    split: "holdout", count: holdoutNew.length, records: holdoutNew,
  }));

  // 4. output template + a filled exemplar (one original-50 record) for depth calibration.
  writeFileSync(join(KIT, "output-template.json"), canonicalJson(outputTemplate()));
  const exemplar = readAnnArray(REF50).slice().sort((a, b) => (b.behaviorActionSequence?.length || 0) - (a.behaviorActionSequence?.length || 0))[0];
  writeFileSync(join(KIT, "EXEMPLAR-filled.json"), canonicalJson(exemplar));

  // 5. expected output fingerprint anchor: the original-50 fingerprint, so the fresh session's
  //    returned 150 can be combined + checked deterministically on return.
  const fp50 = fingerprintAnnotations(readAnnArray(REF50));

  // 6. the instructions the fresh session follows.
  const instructions = kitInstructions({ cls, manifest, freeze, discovery: discoveryNew.length, holdout: holdoutNew.length, fp50: fp50.combined });
  writeFileSync(join(KIT, "README.md"), instructions);

  // 7. manifest-of-kit: hashes of every kit file so integrity is checkable.
  const files = [
    "README.md", "instrument-a-manifest.json", "freeze-lock.json",
    "records-discovery-110.json", "records-holdout-40.SEALED.json",
    "output-template.json", "EXEMPLAR-filled.json",
    ...guideFiles.map(([, dst]) => dst),
  ];
  const kitHashes = {};
  for (const f of files) kitHashes[f] = sha(readFileSync(join(KIT, f)));
  writeFileSync(join(KIT, "KIT-MANIFEST.json"), canonicalJson({
    kitVersion: "P1-1E.kit.1", protocolHash: manifest.protocolHash, freezeLockHash: freeze.lockHash,
    matchClass: cls, files: kitHashes,
  }));

  process.stdout.write(canonicalJson({
    status: "INSTRUMENT_A_KIT_READY",
    kitDir: "private/behavior-200-a/instrument-a-kit",
    matchClass: cls,
    toAnnotate: { discovery: discoveryNew.length, holdoutSealed: holdoutNew.length, total: discoveryNew.length + holdoutNew.length },
    carried50: carried.size,
    protocolHash: manifest.protocolHash,
    freezeLockHash: freeze.lockHash,
    original50Fingerprint: fp50.combined,
    kitFiles: files.length,
  }));
}

function kitInstructions({ cls, manifest, freeze, discovery, holdout, fp50 }) {
  return `# Instrument A Annotation Kit — P1-1E

You are an INDEPENDENT annotation session. Your ONLY job is to produce Instrument A annotations for the
records in this kit, by applying the frozen guide to raw single-sided text.

## Instrument A definition (do not redefine)

${manifest.instrumentADefinition}

You are NOT a human gold standard. You are a guide-following model-assisted research annotator.

## Isolation rules (critical to study validity)

You MUST work from ONLY:
- \`guide/\` (the frozen annotation guide, evidence-grading, expected-reply, transition guide, schema, vocabulary)
- the record texts in \`records-discovery-110.json\`
- \`output-template.json\` (shape) and \`EXEMPLAR-filled.json\` (depth calibration)

You MUST NOT seek out, request, or use:
- any prior annotations of these records (there exists an earlier "Instrument B" pass — do NOT look for it)
- any grammar / pattern / hypothesis conclusions, candidate lists, or bias findings
- any "expected" answer or downstream analysis
Annotate each record independently, from its text alone.

## Verify you are the same instrument first

1. Recompute the guide fingerprint and confirm it equals: \`${freeze.guideFingerprint}\`
2. Confirm the freeze lock hash equals: \`${freeze.lockHash}\`
3. Match class is \`${cls}\` (protocol frozen; model version is a variant — this is expected, do not claim byte-identical).
If the fingerprint does NOT match, STOP and report GUIDE_DRIFT — do not annotate against a changed ruler.

## Task

- Annotate ALL ${discovery} records in \`records-discovery-110.json\`.
- Do NOT open \`records-holdout-40.SEALED.json\` (${holdout} records). Those are annotated in a SEPARATE
  fresh session AFTER the grammar is frozen on the 160-A discovery set.
- One annotation per record, matching \`output-template.json\` exactly. Match the DEPTH of
  \`EXEMPLAR-filled.json\`: multi-action sequences where present, textualEvidence per action, driving
  forces with alternativeExplanation + whatWouldChangeMyMind, trigger domain, relationship operations,
  meta/self-monitoring, expected reply, functional-mask test, evidence grade (E0-E2 only in this pass).
- Every enum value must come from \`guide/behavior-vocab.json\`. Confidence ∈ {explicit,
  strongly_supported, weak_inference, unknown}. A character prior may never impersonate current-record
  evidence: keep priorContribution and recordSpecificSupport separate and honest.

## Return

Write \`annotation-a-110.json\` = \`{ "annotations": [ ...110 records... ] }\` using canonical JSON
(sorted keys, 2-space indent, trailing newline). Then a maintainer resumes the P1-1E pipeline to
validate (vocabulary + Round-A grades), assemble UNIFIED_A_200, and run the study.

## Do-not

Do not push, open PRs, run the grammar engine, or peek at holdout. Just annotate the 110 and return.

(For reference, the original 50 A-annotations fingerprint to \`${fp50}\`; your 110 are new and will be
combined with them downstream — you do not need this value to annotate.)
`;
}

main();

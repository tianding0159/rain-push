// P1-1E — Instrument A identity manifest.
//
// Instrument A is defined (P1-1E, superseding P1-1D's imprecise "hand-authored") as:
//   "guide-following model-assisted research annotation under the frozen annotation protocol."
// It is NOT human ground truth, NOT hand-authored, NOT gold. It is a model applying the frozen
// guide/schema/vocabulary to raw single-sided text, one record at a time.
//
// This module pins the instrument's identity so the 150 re-annotations can be certified as the SAME
// instrument as the original 50 (or honestly flagged as a model variant). It hashes every frozen
// input the annotation act depends on, and captures the rule vocabularies inline for auditability.
//
// SECURITY: model IDENTITY only (name/provider/proxy host). NEVER auth tokens, API keys, or user PII —
// those live in env and must not enter any manifest or committed artifact.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeGuideFingerprint, GUIDE_FREEZE_VERSION } from "./guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..");

export const INSTRUMENT_A_PROTOCOL_VERSION = "P1-1E.instrumentA.1";

// The annotation act reads these files. Guide artifacts are already covered by the guide fingerprint;
// we additionally hash the remaining docs the protocol references so the manifest is self-contained.
export const PROTOCOL_DOC_ARTIFACTS = [
  "docs/ANNOTATION_GUIDE_REVISED.md",
  "docs/EVIDENCE_GRADING.md",
  "docs/EXPECTED_REPLY_GUIDE.md",
  "docs/TRANSITION_GUIDE.md",
  "schemas/behavior-annotation-revised.schema.json",
  "policy/behavior-vocab.json",
];

function sha(s) { return createHash("sha256").update(s).digest("hex"); }

// Model identity from the environment — identity fields only, never secrets. We deliberately record
// that the exact model *version* at original-50 time is UNRECORDED (the annotator string carried no
// version), which is why the cross-run match is a protocol match, not a byte-identical-model claim.
export function modelIdentity(env = process.env) {
  const proxy = env.ANTHROPIC_BASE_URL || null;
  const provider = proxy ? "anthropic_via_roche_proxy" : (env.ANTHROPIC_BASE_URL === undefined ? "unknown" : "anthropic");
  // host only, no path/query, no creds
  let proxyHost = null;
  if (proxy) { try { proxyHost = new URL(proxy).host; } catch { proxyHost = "unparseable"; } }
  return {
    provider,
    proxyHost,
    // The wrapper is Claude (per annotator string "claude(model_assisted_research)").
    modelFamily: "claude",
    // Version at ORIGINAL-50 annotation time: not recorded in the artifact. Current session model is
    // not asserted here to avoid a false byte-identical claim — see matchClass().
    originalModelVersionRecorded: false,
    note: "identity only; no auth token / api key / user PII recorded",
  };
}

// Rule vocabularies that DEFINE the protocol's decision space. Sourced from the frozen vocab (SSOT) —
// we read, not hardcode. Each is what an Instrument A annotator must choose within.
export function ruleVocabularies(base = V7) {
  const v = JSON.parse(readFileSync(join(base, "policy/behavior-vocab.json"), "utf8"));
  const pick = (k) => v[k] ?? null;
  return {
    confidenceVocabulary: pick("confidenceTags"),                 // explicit / strongly_supported / weak_inference / unknown
    evidenceGradeRules: {
      allGrades: pick("evidenceGrades"),                          // E0-E4
      roundAGrades: pick("roundAGrades"),                         // E0-E2 only in a Round-A pass
      note: "E3/E4 are cross-corpus/holdout-gated; a single-record Round-A pass may only assign E0-E2.",
    },
    priorRules: {
      priorStrengths: pick("priorStrengths"),                     // none/weak/moderate/strong
      inferenceSources: pick("inferenceSources"),                 // includes character_prior
      note: "priorContribution and recordSpecificSupport are separated per record; a character prior may never impersonate current-record evidence (guide core stance).",
    },
    expectedReplyRules: {
      immediate: pick("immediateReplyClasses"),
      relationship: pick("relationshipReplyClasses"),
      longerTerm: pick("longerTermReplyClasses"),
      unsatisfying: pick("unsatisfyingReplyClasses"),
      classes: pick("expectedReplyClasses"),
    },
    maskRules: {
      maskStrategy: pick("maskStrategy"),
      note: "mask=true requires the FUNCTIONAL test (reduces visibility/accountability/exposure of a just-revealed vulnerability); maskStrategy is populated ONLY when mask=true.",
    },
    reviewFlagRules: pick("reviewFlags"),
    reviewPriorities: pick("reviewPriorities"),
    failureRiskRules: pick("failureRiskIds"),
    behaviorActions: pick("behaviorActions"),
    interactionFunctions: pick("interactionFunctions"),
    functionRoles: pick("functionRoles"),
    drivingForces: pick("drivingForces"),
    triggerDomains: pick("triggerDomains"),
    triggerIntensities: pick("triggerIntensities"),
    activationLevels: pick("activationLevels"),
    relationshipOperations: pick("relationshipOperations"),
    metaSelfMonitoring: pick("metaSelfMonitoring"),
    affectLabels: pick("affectLabels"),
    coexistenceTypes: pick("coexistenceTypes"),
    contextDependencyLevels: pick("contextDependencyLevels"),
  };
}

// Output canonicalization rules the instrument must obey so downstream is byte-deterministic.
export function canonicalizationRules() {
  return {
    serializer: "canonicalJson (v7/corpus/lib/io.mjs): JSON.stringify(sortKeys(v), null, 2) + trailing newline",
    keyOrder: "recursively sorted ascending",
    indent: 2,
    trailingNewline: true,
    numberPolicy: "confidences are enum tags, not floats; counts are integers",
    idPolicy: "records keyed by presentationId (public) and linkId (private hash); text never enters committed artifacts",
  };
}

function hashDocs(base = V7, artifacts = PROTOCOL_DOC_ARTIFACTS) {
  const perDoc = {}; const missing = [];
  for (const rel of artifacts) {
    const p = join(base, rel);
    if (!existsSync(p)) { missing.push(rel); continue; }
    perDoc[rel] = sha(readFileSync(p, "utf8"));
  }
  return { perDoc, missing };
}

// Build the full manifest. Deterministic given the frozen files (model identity is env-derived but
// version-agnostic, so it does not perturb the protocol hash).
export function buildInstrumentAManifest({ base = V7, env = process.env } = {}) {
  const guide = computeGuideFingerprint({ base });
  const docs = hashDocs(base);
  const rules = ruleVocabularies(base);
  const canon = canonicalizationRules();
  const model = modelIdentity(env);

  // protocolHash covers ONLY the frozen, model-version-independent inputs — guide fingerprint,
  // protocol docs, rule vocabularies, canonicalization, protocol version. This is the identity two
  // runs must share to be "the same Instrument A".
  const protocolCore = {
    protocolVersion: INSTRUMENT_A_PROTOCOL_VERSION,
    guideFreezeVersion: GUIDE_FREEZE_VERSION,
    guideFingerprint: guide.fingerprint,
    protocolDocHashes: docs.perDoc,
    ruleVocabularies: rules,
    canonicalizationRules: canon,
  };
  const protocolHash = sha(JSON.stringify(protocolCore));

  return {
    instrumentADefinition: "guide-following model-assisted research annotation under the frozen annotation protocol; NOT human, NOT hand-authored, NOT gold standard.",
    protocolVersion: INSTRUMENT_A_PROTOCOL_VERSION,
    protocolHash,
    guideFreezeVersion: GUIDE_FREEZE_VERSION,
    guideFingerprint: guide.fingerprint,
    guidePerArtifact: guide.perArtifact,
    guideMissing: guide.missing,
    protocolDocHashes: docs.perDoc,
    protocolDocMissing: docs.missing,
    modelIdentity: model,
    ruleVocabularies: rules,
    canonicalizationRules: canon,
    resolvable: guide.missing.length === 0 && docs.missing.length === 0,
  };
}

// Match class between two manifests (or a manifest vs itself across runs).
// - protocolHash equal + model version recorded-and-equal  → INSTRUMENT_A_EXACT (not achievable here)
// - protocolHash equal + model version unrecorded/uncertain → INSTRUMENT_A_PROTOCOL_MATCH_MODEL_VARIANT
// - protocolHash differs                                    → INSTRUMENT_A_IDENTITY_UNRESOLVED
export function matchClass(manifest) {
  if (!manifest.resolvable) return "INSTRUMENT_A_IDENTITY_UNRESOLVED";
  if (manifest.modelIdentity.originalModelVersionRecorded) return "INSTRUMENT_A_EXACT";
  return "INSTRUMENT_A_PROTOCOL_MATCH_MODEL_VARIANT";
}

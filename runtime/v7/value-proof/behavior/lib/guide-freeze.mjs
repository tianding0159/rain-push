// P1-1C §4 — Annotation Guide Freeze.
//
// Before the 200-record stage starts, the guide (schema + vocabulary + guide docs) is FROZEN. The
// falsification study must measure 200 records with ONE ruler; silently changing the ruler mid-way
// (e.g. because a hypothesis result looks bad) invalidates every comparison. This module:
//
//   1. computeGuideFingerprint(): a content hash over the frozen artifacts, plus a per-artifact
//      hash and — for the vocab — a per-section enum snapshot so we can classify HOW it changed.
//   2. captureFreeze(): the fingerprint at freeze time, tagged with a guideFreezeVersion.
//   3. checkFreeze(before, after): classifies drift into
//        - UNCHANGED
//        - ADDITIVE_ENUM_EXTENSION  (only new enum values appended — allowed change class C, still
//          recorded, does NOT break the freeze on its own)
//        - STRUCTURAL_CHANGE        (schema/doc bytes changed, enum values REMOVED or RENAMED, or a
//          section added/dropped) → GUIDE_FREEZE_BROKEN
//
// Allowed change classes (directive §4): A true bug, B schema invalidity, C a major enum gap that
// blocks expressing many real records. Only C is representable as an additive enum extension here;
// A/B require a code/schema edit which shows up as STRUCTURAL_CHANGE and must abort the round unless
// the operator explicitly records the reason + rerun/holdout impact.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..");

export const GUIDE_FREEZE_VERSION = "P1-1C.freeze.1";

export const FREEZE_STATUS = Object.freeze({
  UNCHANGED: "GUIDE_FREEZE_UNCHANGED",
  ADDITIVE: "GUIDE_FREEZE_ADDITIVE_ENUM_EXTENSION",
  BROKEN: "GUIDE_FREEZE_BROKEN",
});

// The artifacts that constitute "the guide". Schema + vocab are enforced (they gate validity); the
// guide docs are the human-facing instructions. Paths are relative to behavior/.
export const FROZEN_ARTIFACTS = [
  "schemas/behavior-annotation-revised.schema.json",
  "schemas/behavior-grammar-candidate.schema.json",
  "policy/behavior-vocab.json",
  "docs/ANNOTATION_GUIDE_REVISED.md",
  "docs/EVIDENCE_GRADING.md",
];

function sha(s) { return createHash("sha256").update(s).digest("hex"); }

// Enum-bearing vocab sections (arrays). __-prefixed keys are notes, skipped.
function vocabEnumSnapshot(vocabText) {
  const v = JSON.parse(vocabText);
  const snap = {};
  for (const [k, val] of Object.entries(v)) {
    if (k.startsWith("__")) continue;
    if (Array.isArray(val)) snap[k] = val.slice();
  }
  return snap;
}

export function computeGuideFingerprint({ base = V7, artifacts = FROZEN_ARTIFACTS } = {}) {
  const perArtifact = {};
  let vocabEnums = null;
  const missing = [];
  for (const rel of artifacts) {
    const p = join(base, rel);
    if (!existsSync(p)) { missing.push(rel); continue; }
    const text = readFileSync(p, "utf8");
    perArtifact[rel] = sha(text);
    if (rel.endsWith("behavior-vocab.json")) vocabEnums = vocabEnumSnapshot(text);
  }
  const combined = sha(artifacts.map((a) => `${a}:${perArtifact[a] || "MISSING"}`).join("\n"));
  return { fingerprint: combined, perArtifact, vocabEnums, missing };
}

export function captureFreeze(opts = {}) {
  const fp = computeGuideFingerprint(opts);
  return {
    guideFreezeVersion: opts.version || GUIDE_FREEZE_VERSION,
    frozenAt: opts.frozenAt || "P1-1C-start",
    ...fp,
  };
}

// Compare a section enum before/after → { added:[], removed:[], reordered:bool }.
function diffEnum(before = [], after = []) {
  const bs = new Set(before), as = new Set(after);
  const added = after.filter((x) => !bs.has(x));
  const removed = before.filter((x) => !as.has(x));
  // reordered only matters if membership identical but order differs (canonical vocab should be
  // stable-ordered; a reorder is a structural edit worth flagging).
  const reordered = added.length === 0 && removed.length === 0 && JSON.stringify(before) !== JSON.stringify(after);
  return { added, removed, reordered };
}

// Classify drift between a freeze snapshot and the current fingerprint.
export function checkFreeze(freeze, current = computeGuideFingerprint()) {
  if (freeze.fingerprint === current.fingerprint) {
    return { status: FREEZE_STATUS.UNCHANGED, guideFreezeVersion: freeze.guideFreezeVersion, changes: [], enumExtensions: [], structuralChanges: [] };
  }

  const structuralChanges = [];
  const enumExtensions = [];

  // Which artifacts changed by byte hash?
  const artifacts = new Set([...Object.keys(freeze.perArtifact || {}), ...Object.keys(current.perArtifact || {})]);
  for (const a of artifacts) {
    const b = (freeze.perArtifact || {})[a];
    const c = (current.perArtifact || {})[a];
    if (b === c) continue;
    if (a.endsWith("behavior-vocab.json")) {
      // classify the vocab change section-by-section
      const before = freeze.vocabEnums || {};
      const after = current.vocabEnums || {};
      const sections = new Set([...Object.keys(before), ...Object.keys(after)]);
      let anyStructural = false;
      for (const s of sections) {
        if (!(s in before)) { structuralChanges.push({ artifact: a, section: s, kind: "section_added" }); anyStructural = true; continue; }
        if (!(s in after)) { structuralChanges.push({ artifact: a, section: s, kind: "section_removed" }); anyStructural = true; continue; }
        const d = diffEnum(before[s], after[s]);
        if (d.removed.length > 0) { structuralChanges.push({ artifact: a, section: s, kind: "enum_removed", removed: d.removed }); anyStructural = true; }
        if (d.reordered) { structuralChanges.push({ artifact: a, section: s, kind: "enum_reordered" }); anyStructural = true; }
        if (d.added.length > 0) enumExtensions.push({ artifact: a, section: s, added: d.added });
      }
      if (!anyStructural && enumExtensions.length === 0) {
        // vocab hash changed but no enum change → a note/description/format edit. Treat as structural
        // (the frozen bytes moved) so it can't slip through unrecorded.
        structuralChanges.push({ artifact: a, kind: "vocab_nonenum_edit" });
      }
    } else {
      // any schema or doc byte change is structural — the ruler moved.
      structuralChanges.push({ artifact: a, kind: "content_changed" });
    }
  }

  let status;
  if (structuralChanges.length > 0) status = FREEZE_STATUS.BROKEN;
  else if (enumExtensions.length > 0) status = FREEZE_STATUS.ADDITIVE;
  else {
    // Fingerprints differ but no structural or additive change was localized. This should be
    // impossible if perArtifact accounting is complete; fail SAFE (BROKEN) rather than let an
    // unexplained ruler-move slip through as UNCHANGED.
    status = FREEZE_STATUS.BROKEN;
    structuralChanges.push({ kind: "fingerprint_mismatch_unlocalized", note: "combined fingerprint changed but no per-artifact drift was localized — failing safe" });
  }

  return {
    status,
    guideFreezeVersion: freeze.guideFreezeVersion,
    frozenFingerprint: freeze.fingerprint,
    currentFingerprint: current.fingerprint,
    enumExtensions,
    structuralChanges,
    broken: status === FREEZE_STATUS.BROKEN,
  };
}

// Enforcement helper for a stage driver: returns { ok, freezeCheck }. If broken, the driver must
// abort with status GUIDE_FREEZE_BROKEN and NOT emit statistics computed under a moved ruler.
export function enforceFreeze(freeze, current = computeGuideFingerprint()) {
  const freezeCheck = checkFreeze(freeze, current);
  return { ok: freezeCheck.status !== FREEZE_STATUS.BROKEN, freezeCheck };
}

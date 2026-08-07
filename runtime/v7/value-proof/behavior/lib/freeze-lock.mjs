// P1-1E §1 — freeze-conditions lock.
//
// Before any re-annotation, we snapshot the fingerprints of everything the spec requires frozen for
// the whole run: annotation guide, behavior vocabulary, schema, discovery thresholds, hypothesis
// definitions, holdout split, and the selection seed. The run must NOT change any of these because a
// result changed; if a TRUE bug is found it is recorded separately and the main analysis STOPS.
//
// "Discovery thresholds" and "hypothesis definitions" live in engine SOURCE (code-as-SSOT), so we
// fingerprint the exact source files that encode them. We do not modify the engine — we pin it.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeGuideFingerprint, GUIDE_FREEZE_VERSION } from "./guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// BEHAVIOR_BASE = the behavior/ tree (guide artifacts + engine source live here, matching guide-freeze.mjs).
const BEHAVIOR_BASE = join(HERE, "..");
// ROOT = value-proof root (private/ selection + corpus live here).
const ROOT = join(HERE, "..", "..");

const sha = (s) => createHash("sha256").update(s).digest("hex");

// Engine source files whose constants define discovery thresholds + hypothesis logic. Pinning their
// content hash proves the thresholds did not drift through the run.
export const THRESHOLD_SOURCES = [
  "lib/derive-patterns.mjs",          // E3>=8 / E2>=3 / E1>=1 support grades; confidence = support/8
  "lib/grammar-hypotheses.mjs",       // PRELIM_RATE, CONTRA_RATE, hypothesis status logic
  "lib/hypothesis-falsification.mjs", // falsification verdicts + directions
  "lib/grammar-gate.mjs",             // MIN_EVALUABLE_HYPOTHESES, proceed gate
  "lib/grammar-discovery.mjs",        // discovery pass definitions
  "lib/grammar-candidate.mjs",        // grammar candidate schema binding + production_ready ban
  "lib/counterexample.mjs",           // GC1-GC7 counterexample opportunities
  "lib/holdout-validation.mjs",       // holdout validation logic
  "lib/full-scale-gate.mjs",          // E3 rollup + full-scale gate
];

export const HYPOTHESIS_SOURCES = [
  "lib/hypotheses.mjs",
  "lib/grammar-hypotheses.mjs",
];

function hashFiles(rels, base = BEHAVIOR_BASE) {
  const per = {}; const missing = [];
  for (const rel of rels) {
    try { per[rel] = sha(readFileSync(join(base, rel), "utf8")); }
    catch { missing.push(rel); }
  }
  return { per, missing };
}

// Holdout split + selection seed come from the committed selection manifest (already frozen in P1-1C).
function selectionFreeze(root = ROOT) {
  const selPath = join(root, "private", "behavior-200", "selection.private.json");
  const sel = JSON.parse(readFileSync(selPath, "utf8"));
  const splitCounts = { discovery: 0, holdout: 0, other: 0 };
  const holdoutIds = [];
  for (const r of sel.records) {
    if (r.split === "discovery") splitCounts.discovery += 1;
    else if (r.split === "holdout") { splitCounts.holdout += 1; holdoutIds.push(r.presentationId); }
    else splitCounts.other += 1;
  }
  holdoutIds.sort();
  return {
    seeds: sel.seeds,
    splitCounts,
    holdoutSplitHash: sha(holdoutIds.join(",")),   // identity of WHICH records are holdout
    corpus: sel.corpus,                            // { sha256, lines } of raw corpus at selection time
  };
}

export function buildFreezeLock({ base = BEHAVIOR_BASE, root = ROOT } = {}) {
  const guide = computeGuideFingerprint({ base });
  const thresholds = hashFiles(THRESHOLD_SOURCES, base);
  const hypotheses = hashFiles(HYPOTHESIS_SOURCES, base);
  const selection = selectionFreeze(root);

  const core = {
    guideFreezeVersion: GUIDE_FREEZE_VERSION,
    guideFingerprint: guide.fingerprint,
    thresholdSourceHashes: thresholds.per,
    hypothesisSourceHashes: hypotheses.per,
    holdoutSplitHash: selection.holdoutSplitHash,
    seeds: selection.seeds,
  };
  return {
    freezeLockVersion: "P1-1E.freeze.1",
    guideFreezeVersion: GUIDE_FREEZE_VERSION,
    guideFingerprint: guide.fingerprint,
    guidePerArtifact: guide.perArtifact,
    guideMissing: guide.missing,
    thresholdSourceHashes: thresholds.per,
    thresholdSourcesMissing: thresholds.missing,
    hypothesisSourceHashes: hypotheses.per,
    hypothesisSourcesMissing: hypotheses.missing,
    holdoutSplitCounts: selection.splitCounts,
    holdoutSplitHash: selection.holdoutSplitHash,
    seeds: selection.seeds,
    rawCorpus: selection.corpus,
    lockHash: sha(JSON.stringify(core)),
    resolvable: guide.missing.length === 0 && thresholds.missing.length === 0 && hypotheses.missing.length === 0,
  };
}

// Verify a live rebuild matches a stored lock; returns per-domain drift.
export function verifyFreezeLock(stored, { base = BEHAVIOR_BASE, root = ROOT } = {}) {
  const now = buildFreezeLock({ base, root });
  const drift = [];
  if (now.guideFingerprint !== stored.guideFingerprint) drift.push("guideFingerprint");
  if (now.holdoutSplitHash !== stored.holdoutSplitHash) drift.push("holdoutSplitHash");
  if (JSON.stringify(now.seeds) !== JSON.stringify(stored.seeds)) drift.push("seeds");
  for (const [k, v] of Object.entries(stored.thresholdSourceHashes)) {
    if (now.thresholdSourceHashes[k] !== v) drift.push(`threshold:${k}`);
  }
  for (const [k, v] of Object.entries(stored.hypothesisSourceHashes)) {
    if (now.hypothesisSourceHashes[k] !== v) drift.push(`hypothesis:${k}`);
  }
  return { ok: drift.length === 0 && now.lockHash === stored.lockHash, drift, nowLockHash: now.lockHash, storedLockHash: stored.lockHash };
}

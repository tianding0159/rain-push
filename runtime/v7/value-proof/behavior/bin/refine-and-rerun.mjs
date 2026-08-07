#!/usr/bin/env node
// P1-1B.1 targeted refinement + controlled re-run driver.
//
// COMMITTED and VERBATIM-FREE. Reads the SAME 50 private revised annotations (no re-sampling), links
// them, applies the three evidence-backed guide refinements deterministically, re-runs the UNCHANGED
// discovery + hypotheses on the refined set, and emits a before/after diff.
//
// The discovery algorithm and its thresholds are byte-for-byte the same as P1-1B. If the grammar
// shifts, it is because the ANNOTATIONS changed, not the miner — which is the whole point of a
// controlled re-run.
//
// Private outputs (private/pilot-50/grammar/, gitignored, link-bearing):
//   trigger-domain-gap.private.json
//   behavior-action-gap.private.json
//   reveal-followup.private.json
//   single-action-audit.private.json
//   round-a.refined.private.json           (refined 50 — does NOT overwrite round-a.revised)
//   refined-change-log.private.json        (per-record changedFields)
//   grammar.refined.full.private.json
//   hypotheses.refined.private.json
//   grammar-refinement-diff.private.json
//
// Committed-safe (behavior/discovery/, verbatim-free):
//   refinement-summary.json                (gap counts, diff, dual status, PROCEED gate)

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDiscovery } from "../lib/grammar-discovery.mjs";
import { evaluateGrammarHypotheses } from "../lib/grammar-hypotheses.mjs";
import { detectChurn } from "../lib/grammar-churn.mjs";
import { validateGrammarCandidate } from "../lib/grammar-candidate.mjs";
import { loadVocab } from "../lib/vocab.mjs";
import { resolveRawPath } from "../lib/raw-corpus.mjs";
import { triggerDomainGap, behaviorActionGap } from "../lib/refinement-gap.mjs";
import { analyzeRevealFollowup } from "../lib/reveal-followup.mjs";
import { auditSingleActions } from "../lib/single-action-audit.mjs";
import { refineBatch } from "../lib/refinement-transform.mjs";
import { computeRefinementDiff, evaluateDualStatus, buildChangeLog } from "../lib/refinement-diff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIVATE_DIR = join(HERE, "..", "..", "private", "pilot-50");
const GRAMMAR_DIR = join(PRIVATE_DIR, "grammar");
const COMMITTED_DIR = join(HERE, "..", "discovery");
const REVISED = join(PRIVATE_DIR, "round-a.revised.private.json");
const KEY = join(PRIVATE_DIR, "selection-key.private.json");

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function loadLinked() {
  const annotations = JSON.parse(readFileSync(REVISED, "utf8")).annotations;
  const key = JSON.parse(readFileSync(KEY, "utf8")).key;
  const hashById = new Map(key.map((k) => [k.presentationId, k.recordHash]));
  for (const a of annotations) a.linkId = hashById.get(a.presentationId);
  const missing = annotations.filter((a) => !a.linkId).map((a) => a.presentationId);
  if (missing.length) { process.stderr.write(`missing links: ${JSON.stringify(missing)}\n`); process.exit(1); }
  return annotations;
}

function main() {
  for (const p of [REVISED, KEY]) if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }
  mkdirSync(GRAMMAR_DIR, { recursive: true });
  mkdirSync(COMMITTED_DIR, { recursive: true });

  const rawPath = resolveRawPath()?.path;
  const preHash = rawPath && existsSync(rawPath) ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  const vocab = loadVocab();
  const before = loadLinked();

  // ---- controlled re-run invariant: same 50 records, same ids ----
  const beforeIds = before.map((a) => a.presentationId).sort();

  // ---- gap reports + structural analyses (on BEFORE set) ----
  const tGap = triggerDomainGap(before);
  const bGap = behaviorActionGap(before);
  const followup = analyzeRevealFollowup(before);
  const singleAudit = auditSingleActions(before);

  // ---- apply refinement ----
  const batch = refineBatch(before);
  const after = batch.map((b) => ({ ...b.refined, linkId: b.linkId }));
  const afterIds = after.map((a) => a.presentationId).sort();
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    process.stderr.write("re-run invariant broken: record set changed\n"); process.exit(1);
  }

  // ---- discovery + hypotheses BEFORE and AFTER (UNCHANGED algorithm) ----
  const discBefore = runDiscovery(before);
  const hypBefore = evaluateGrammarHypotheses(before, discBefore);
  const discAfter = runDiscovery(after);
  const hypAfter = evaluateGrammarHypotheses(after, discAfter);
  const churnAfter = detectChurn(after, vocab);

  for (const [name, d] of [["before", discBefore], ["after", discAfter]]) {
    const v = validateGrammarCandidate(d);
    if (!v.valid) { process.stderr.write(`${name} discovery invalid: ${JSON.stringify(v.schemaErrors.concat(v.ruleErrors))}\n`); process.exit(1); }
  }

  // ---- diff + dual status ----
  const diff = computeRefinementDiff({ discBefore, discAfter, hypBefore, hypAfter, tGap, followup, singleAudit, batch });
  const dual = evaluateDualStatus({ diff, churnAfter, hypAfter, batch, tGap });

  // Change-log records only EFFECTIVE changes. noOp entries (old == new, e.g. an `other` sub-category
  // below the admission threshold that stays `other`) are omitted — they are not changes and were
  // inflating the per-record count (PA-013). See buildChangeLog in refinement-diff.mjs.
  const { totalChangedRecords, records: changeLog } = buildChangeLog(batch);

  // ---- write PRIVATE outputs ----
  writeJson(join(GRAMMAR_DIR, "trigger-domain-gap.private.json"), { visibility: "private", ...tGap });
  writeJson(join(GRAMMAR_DIR, "behavior-action-gap.private.json"), { visibility: "private", ...bGap });
  writeJson(join(GRAMMAR_DIR, "reveal-followup.private.json"), { visibility: "private", ...followup });
  writeJson(join(GRAMMAR_DIR, "single-action-audit.private.json"), { visibility: "private", ...singleAudit });
  writeJson(join(GRAMMAR_DIR, "round-a.refined.private.json"), { visibility: "private", note: "refined 50 — does NOT overwrite round-a.revised.private.json", annotations: after });
  writeJson(join(GRAMMAR_DIR, "refined-change-log.private.json"), { visibility: "private", totalChangedRecords, records: changeLog });
  writeJson(join(GRAMMAR_DIR, "grammar.refined.full.private.json"), { visibility: "private", ...discAfter });
  writeJson(join(GRAMMAR_DIR, "hypotheses.refined.private.json"), { visibility: "private", ...hypAfter });
  writeJson(join(GRAMMAR_DIR, "grammar-refinement-diff.private.json"), { visibility: "private", ...diff });

  // ---- committed-safe summary (no links, no text) ----
  const summary = {
    visibility: "committed_safe",
    verbatimFree: true,
    task: "P1-1B.1 targeted guide refinement + controlled re-run",
    n: after.length,
    sameRecordSet: true,
    algorithmChanged: false,
    grammarDiscoveryStatus: dual.grammarDiscoveryStatus,
    annotationGuideStatus: dual.annotationGuideStatus,
    proceedGate: dual.proceedGate,
    triggerOther: { before: tGap.otherCount, after: diff.triggerOtherAfter, reductionFraction: diff.triggerOtherReductionFraction },
    behaviorActionGap: { fallbackUses: bGap.fallbackActionUses, fallbackFraction: bGap.fallbackFraction },
    singleAction: { original: singleAudit.originalSingleActionRecords, trueSingle: singleAudit.revisedTrueSingleAction, flagged: singleAudit.annotationUnderSegmentationFlagged },
    revealFollowup: { revealBearing: followup.revealBearingRecords, messageFinal: followup.revealMessageFinalRecords, withFollowup: followup.revealWithFollowupRecords },
    mask: diff.mask,
    hypothesisStatusChanges: diff.hypothesisStatusChanges,
    totalChangedRecords,
    changedRecordFraction: Math.round((totalChangedRecords / after.length) * 1000) / 1000,
    additiveRecords: dual.additiveRecords,
    substantiveRecords: dual.substantiveRecords,
    substantiveFraction: dual.substantiveFraction,
  };
  writeJson(join(COMMITTED_DIR, "refinement-summary.json"), summary);

  const postHash = rawPath && existsSync(rawPath) ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  process.stdout.write(JSON.stringify({
    grammarDiscoveryStatus: dual.grammarDiscoveryStatus,
    annotationGuideStatus: dual.annotationGuideStatus,
    proceed: dual.proceedGate.decision,
    triggerOther: `${tGap.otherCount} -> ${diff.triggerOtherAfter}`,
    functionalMask: diff.mask,
    hypothesisStatusChanges: diff.hypothesisStatusChanges,
    totalChangedRecords,
    rawHashUnchanged: preHash === postHash,
  }, null, 2) + "\n");
}

main();

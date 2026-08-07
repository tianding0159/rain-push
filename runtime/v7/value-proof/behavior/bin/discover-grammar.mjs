#!/usr/bin/env node
// P1-1B Behavior Grammar discovery driver (Layer A → B).
//
// This script is COMMITTED and VERBATIM-FREE. It reads one PRIVATE (gitignored) input:
//   private/pilot-50/round-a.revised.private.json   — the 50 validated revised annotations (WITH text)
// links each record to its recordHash via selection-key.private.json, runs the deterministic
// discovery + hypotheses + churn passes, and emits:
//
//   PRIVATE  (private/pilot-50/grammar/, gitignored — carries recordHash links):
//     1  grammar.full.private.json                 full discovery bundle (all 9 sections + meta)
//     2  transitions.private.json                  §4 n-gram transitions
//     3  driving-force-strategy.private.json        §7 driver→strategy couplings
//     4  affect-strategy.private.json               §8 affect→strategy couplings
//     5  trigger-sensitivity.private.json           §9 trigger domains
//     6  reveal-mask.private.json                   §10 reveal→mask dynamic
//     7  relationship-operations.private.json       §11 relationship ops
//     8  partner-operations.private.json            §12 expected partner ops
//     9  performance-patterns.private.json          §13 performance patterns
//     10 intra-message-momentum.private.json        §13/§14 single-utterance arcs
//     11 hypotheses.private.json                    H1-H11 data-first evaluation
//
//   COMMITTED-SAFE (behavior/discovery/, verbatim-free, NO recordHash links):
//     - grammar-candidate.aggregate.json           the full bundle with every link stripped
//     - grammar-hypotheses.aggregate.json          H1-H11 (already link-free)
//     - annotation-guide-churn.json                churn signals + PROCEED_TO_200 gate
//
// The run FAILS LOUD if the discovery bundle does not validate against behavior-grammar-candidate
// schema (+ the production_ready ban), and reports whether the raw corpus hash is unchanged.
// The raw corpus is never opened here.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDiscovery, linkOf } from "../lib/grammar-discovery.mjs";
import { evaluateGrammarHypotheses } from "../lib/grammar-hypotheses.mjs";
import { detectChurn } from "../lib/grammar-churn.mjs";
import { validateGrammarCandidate } from "../lib/grammar-candidate.mjs";
import { loadVocab } from "../lib/vocab.mjs";
import { resolveRawPath } from "../lib/raw-corpus.mjs";
import { evaluateProceedGate } from "../lib/grammar-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIVATE_DIR = join(HERE, "..", "..", "private", "pilot-50");
const GRAMMAR_DIR = join(PRIVATE_DIR, "grammar");
const COMMITTED_DIR = join(HERE, "..", "discovery");
const ANNOTATIONS = join(PRIVATE_DIR, "round-a.revised.private.json");
const KEY = join(PRIVATE_DIR, "selection-key.private.json");

// Recursively strip every link-bearing field so the committed aggregate is verbatim-safe. A
// recordHash is not verbatim, but hashes still index specific private utterances, so the committed
// artifact drops them entirely — only counts and keys survive.
// Optional link fields are dropped entirely; required record-list fields are emptied to [] so the
// schema shape survives while no recordHash leaks into the committed artifact.
const DROP_FIELDS = new Set(["supportingLinks", "conflictingLinks", "link"]);
const EMPTY_FIELDS = new Set(["revealWithoutMaskRecords", "dropThenRestoreRecords", "privateContextPerformanceRecords"]);
function stripLinks(node) {
  if (Array.isArray(node)) return node.map(stripLinks);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (DROP_FIELDS.has(k)) continue;
      if (EMPTY_FIELDS.has(k)) { out[k] = []; continue; }
      out[k] = stripLinks(v);
    }
    return out;
  }
  return node;
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function main() {
  for (const p of [ANNOTATIONS, KEY]) {
    if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }
  }
  mkdirSync(GRAMMAR_DIR, { recursive: true });
  mkdirSync(COMMITTED_DIR, { recursive: true });

  const rawPath = resolveRawPath()?.path;
  const preHash = rawPath && existsSync(rawPath) ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  const annotations = JSON.parse(readFileSync(ANNOTATIONS, "utf8")).annotations;
  const key = JSON.parse(readFileSync(KEY, "utf8")).key;
  const hashById = new Map(key.map((k) => [k.presentationId, k.recordHash]));
  for (const a of annotations) a.linkId = hashById.get(a.presentationId);

  const missingLinks = annotations.filter((a) => !a.linkId).map((a) => a.presentationId);
  if (missingLinks.length > 0) {
    process.stderr.write(`records without a recordHash link: ${JSON.stringify(missingLinks)}\n`);
    process.exit(1);
  }

  const vocab = loadVocab();
  const discovery = runDiscovery(annotations);
  const hypotheses = evaluateGrammarHypotheses(annotations, discovery);
  const churn = detectChurn(annotations, vocab);
  const gate = evaluateProceedGate({ discovery, hypotheses, churn });

  // Validate the discovery bundle (private form, links present) against the candidate schema.
  const v = validateGrammarCandidate(discovery);
  if (!v.valid) {
    process.stderr.write("GRAMMAR CANDIDATE INVALID:\n" + JSON.stringify({ schemaErrors: v.schemaErrors, ruleErrors: v.ruleErrors }, null, 2) + "\n");
    process.exit(1);
  }

  // ---- 11 PRIVATE files (link-bearing) ----
  writeJson(join(GRAMMAR_DIR, "grammar.full.private.json"), { visibility: "private", ...discovery });
  writeJson(join(GRAMMAR_DIR, "transitions.private.json"), { visibility: "private", ...discovery.transitions });
  writeJson(join(GRAMMAR_DIR, "driving-force-strategy.private.json"), { visibility: "private", ...discovery.drivingForceStrategy });
  writeJson(join(GRAMMAR_DIR, "affect-strategy.private.json"), { visibility: "private", ...discovery.affectStrategy });
  writeJson(join(GRAMMAR_DIR, "trigger-sensitivity.private.json"), { visibility: "private", ...discovery.triggerSensitivity });
  writeJson(join(GRAMMAR_DIR, "reveal-mask.private.json"), { visibility: "private", ...discovery.revealMask });
  writeJson(join(GRAMMAR_DIR, "relationship-operations.private.json"), { visibility: "private", ...discovery.relationshipOperations });
  writeJson(join(GRAMMAR_DIR, "partner-operations.private.json"), { visibility: "private", ...discovery.partnerOperations });
  writeJson(join(GRAMMAR_DIR, "performance-patterns.private.json"), { visibility: "private", ...discovery.performancePatterns });
  writeJson(join(GRAMMAR_DIR, "intra-message-momentum.private.json"), { visibility: "private", ...discovery.intraMessageMomentum });
  writeJson(join(GRAMMAR_DIR, "hypotheses.private.json"), { visibility: "private", ...hypotheses });

  // ---- COMMITTED-SAFE aggregates (links stripped) ----
  const aggregate = stripLinks(discovery);
  // The committed aggregate must ALSO pass the candidate schema + production_ready ban.
  const va = validateGrammarCandidate(aggregate);
  if (!va.valid) {
    process.stderr.write("COMMITTED AGGREGATE INVALID:\n" + JSON.stringify({ schemaErrors: va.schemaErrors, ruleErrors: va.ruleErrors }, null, 2) + "\n");
    process.exit(1);
  }
  writeJson(join(COMMITTED_DIR, "grammar-candidate.aggregate.json"), { visibility: "committed_safe", verbatimFree: true, ...aggregate });
  writeJson(join(COMMITTED_DIR, "grammar-hypotheses.aggregate.json"), { visibility: "committed_safe", verbatimFree: true, ...hypotheses });
  writeJson(join(COMMITTED_DIR, "annotation-guide-churn.json"), { visibility: "committed_safe", verbatimFree: true, churn, proceedGate: gate });

  const postHash = rawPath && existsSync(rawPath) ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  process.stdout.write(JSON.stringify({
    status: gate.status,
    n: discovery.n,
    hypothesisSummary: hypotheses.hypotheses.reduce((acc, h) => { acc[h.status] = (acc[h.status] || 0) + 1; return acc; }, {}),
    churnSignals: churn.signalCount,
    proceedGate: { decision: gate.decision, blockers: gate.blockers.length, reasons: gate.reasons.length },
    rawHashUnchanged: preHash === postHash,
    privateFiles: 11,
    committedFiles: ["grammar-candidate.aggregate.json", "grammar-hypotheses.aggregate.json", "annotation-guide-churn.json"],
  }, null, 2) + "\n");
}

main();

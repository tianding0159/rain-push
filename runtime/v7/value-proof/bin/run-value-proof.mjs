#!/usr/bin/env node
// Value-proof pipeline runner (PHASE 13 CLI).
//
// Runs the full deterministic pipeline on the SYNTHETIC scenario suite (or a private corpus if
// RAIN_PUSH_PRIVATE_CORPUS is set) and emits the deliverable reports to stdout or a directory.
//
//   node run-value-proof.mjs               # print the characterProof conclusion to stdout
//   node run-value-proof.mjs --out DIR     # write all reports as canonical JSON into DIR
//   node run-value-proof.mjs --report NAME # print one report (perArm|metrics|source|punct|gate|blind|ledger|proof)
//
// In CI this runs with the deterministic stub provider and NO private corpus → it exercises the
// whole pipeline and asserts nothing leaks, but makes NO fidelity claim (blindEvalDone=false,
// usedRealPrivateCorpus=false → acceptance NOT_EVALUABLE for human criteria).
//
// No network, no clock, no LLM. Deterministic.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadScenarios } from "../lib/scenarios.mjs";
import { runArms } from "../lib/arms.mjs";
import { packSuite } from "../lib/blind-pack.mjs";
import { evaluateSuiteGate } from "../lib/dark-gate.mjs";
import { loadPrivateCorpus, redactedView, CORPUS_STATUS } from "../lib/private-corpus.mjs";
import {
  perArmReport,
  metricDistribution,
  punctuationRhythmReport,
  sourceLayerInfluenceReport,
  severeGateReport,
  failureLedger,
  characterProof,
  serialize,
} from "../lib/report.mjs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { out: null, report: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--report") args.report = argv[++i];
  }
  return args;
}

// Retrieval corpus: prefer the private corpus if present, else the synthetic retrieval corpus.
function loadRetrievalCorpus() {
  const priv = loadPrivateCorpus();
  if (priv.present && priv.events.length) {
    // Private events are validated corpus events; a registry must accompany them out-of-band.
    // For determinism in this runner we require a co-located registry; if absent, fall back to
    // synthetic retrieval so the runner never fabricates provenance.
    if (Array.isArray(priv.registry) && priv.registry.length) {
      return { corpus: { registry: priv.registry, events: priv.events }, private: true, status: priv.status };
    }
  }
  const raw = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "synthetic", "retrieval-corpus.json"), "utf8"));
  return { corpus: { registry: raw.registry.sources, events: raw.events }, private: false, status: priv.status };
}

export function runPipeline() {
  const scenarios = loadScenarios();
  const byId = Object.fromEntries(scenarios.map((s) => [s.scenarioId, s]));
  const { corpus, private: isPrivate, status } = loadRetrievalCorpus();

  const scenarioRuns = scenarios.map((s) => runArms(s, corpus));
  const { packs } = packSuite(scenarioRuns, byId);
  const gate = evaluateSuiteGate(scenarios);

  // Baseline rhythm: use the corpus events' structural annotation as a stand-in baseline is
  // NOT valid (no verbatim). With no real corpus text baseline available in CI, baseline is
  // empty and the punctuation-vs-corpus criterion is reported NOT_EVALUABLE downstream.
  const baselineCandidates = [];

  const reports = {
    perArm: perArmReport(scenarioRuns),
    metrics: metricDistribution(scenarioRuns),
    source: sourceLayerInfluenceReport(scenarioRuns),
    punct: punctuationRhythmReport(scenarioRuns, baselineCandidates),
    gate: severeGateReport(gate),
    blind: { kind: "blindEvalPack", packs },
    ledger: failureLedger(scenarioRuns),
    proof: characterProof({
      usedRealPrivateCorpus: isPrivate,
      allFourArmsRun: true,
      blindEvalDone: false,
      acceptanceOverall: "NOT_EVALUABLE",
      conclusion: isPrivate
        ? "Pipeline ran on a private corpus with the stub provider; human blind eval still required before any fidelity claim."
        : "Pipeline ran on SYNTHETIC fixtures with the stub provider. No real character validation is claimed. Status: " + status,
      implemented: [
        "private-corpus loader (env/path/default, READY_FOR_PRIVATE_CORPUS)",
        "character-signal sidecar (need/affect separation, roles)",
        "provenance-bounded retrieval (suspected_ai quarantine, C3 toggle)",
        "rhythm/punctuation diagnostics",
        "gptish diagnostics (接住 hard-ban) + immediate-reversal metric",
        "four-arm ablation composition (A/B/C/D, no answer leak)",
        "deterministic blind-eval packing (label-hidden)",
        "R-DARK bidirectional gate harness (spec vs engine FP/FN)",
        "acceptance + stop-rule evaluation",
        "report generation",
      ],
      tested: ["all of the above via node:test, deterministic"],
      privatelyEvaluated: [],
      syntheticOnly: isPrivate ? [] : ["all generation (stub provider)", "retrieval corpus", "scenario suite"],
      blocked: ["real online-provider generation", "human blind eval"],
      inferred: ["engine R-DARK positive-path FN (pinned gap, not run in engine)"],
      notYetRun: ["real private-corpus blind eval", "D-vs-A / B-vs-D real win rates"],
    }),
  };
  return { reports, status, isPrivate };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { reports } = runPipeline();

  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    const names = {
      "blind-eval-pack.json": reports.blind,
      "failure-ledger.json": reports.ledger,
      "per-arm-report.json": reports.perArm,
      "metric-distribution.json": reports.metrics,
      "source-layer-influence.json": reports.source,
      "punctuation-rhythm.json": reports.punct,
      "severe-gate.json": reports.gate,
      "character-proof.json": reports.proof,
    };
    for (const [file, report] of Object.entries(names)) {
      writeFileSync(join(args.out, file), serialize(report) + "\n");
    }
    process.stdout.write(`wrote ${Object.keys(names).length} reports to ${args.out}\n`);
    return;
  }

  const pick = args.report || "proof";
  const map = {
    perArm: reports.perArm, metrics: reports.metrics, source: reports.source,
    punct: reports.punct, gate: reports.gate, blind: reports.blind,
    ledger: reports.ledger, proof: reports.proof,
  };
  const report = map[pick];
  if (!report) {
    process.stderr.write(`unknown report: ${pick}\n`);
    process.exit(2);
  }
  process.stdout.write(serialize(report) + "\n");
}

// Only run main when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("run-value-proof.mjs")) {
  main();
}

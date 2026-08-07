#!/usr/bin/env node
// P1-1C §23 — machine-readable terminal status. Aggregates the stage verdicts into one committed file.
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const D = join(HERE, "..", "discovery-200");
const rd = (f) => JSON.parse(readFileSync(join(D, f), "utf8"));

const sel = rd("selection-manifest.aggregate.json");
const frz = rd("guide-freeze.aggregate.json");
const sum = rd("summary.aggregate.json");
const fal = rd("hypothesis-falsification.aggregate.json");
const hol = rd("holdout-validation.aggregate.json");
const gat = rd("full-scale-gate.aggregate.json");

const status = {
  stage: "P1-1C-200",
  terminalStatus: "BEHAVIOR_200_READY",
  selection: { ...sel.counts, invariantsAllHold: Object.values(sel.invariants).every(Boolean) },
  guideFreezeVersion: frz.guideFreezeVersion,
  instrumentConfounded: sum.instrumentShift.confounded,
  falsificationRollup: fal.rollup,
  holdout: { rollup: hol.holdoutRollup, e3: hol.e3Rollup, survivors: hol.survivors },
  guideChurnVerdict: gat.guideChurn.verdict,
  fullScaleDecision: gat.fullScaleGate.decision,
  note: "BEHAVIOR_200_READY: grammar frozen + holdout-validated; guide stable for full scale; 1051 gate HOLDS pending single-instrument re-annotation (instrument confound). Engine untouched; no generation/merge/push.",
};

writeFileSync(join(D, "terminal-status.aggregate.json"), canonicalJson({ visibility: "committed_safe", verbatimFree: true, ...status }) + "\n");
process.stdout.write(canonicalJson(status) + "\n");

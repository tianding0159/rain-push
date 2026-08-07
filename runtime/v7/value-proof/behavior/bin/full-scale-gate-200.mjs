#!/usr/bin/env node
// P1-1C §19-20 — guide-churn assessment + the 1051 full-scale gate.
// Reads the frozen-guide check, the annotated 160 set, and the committed aggregates from §6/§9/§17-18.
// Emits GUIDE_STABLE_FOR_FULL_SCALE|GUIDE_NOT_READY_FOR_1051 and PROCEED_TO_1051|HOLD_BEFORE_FULL_SCALE.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { assessGuideChurn, decideFullScaleGate } from "../lib/full-scale-gate.mjs";
import { enforceFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const ANN_160 = join(V7, "private", "behavior-200", "annotation.private.json");
const FREEZE = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");
const SUMMARY = join(HERE, "..", "discovery-200", "summary.aggregate.json");
const HOLDOUT = join(HERE, "..", "discovery-200", "holdout-validation.aggregate.json");
const FALSIFY = join(HERE, "..", "discovery-200", "hypothesis-falsification.aggregate.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200");
const OUT_COMMITTED = join(HERE, "..", "discovery-200");

function main() {
  for (const p of [ANN_160, FREEZE, SUMMARY, HOLDOUT, FALSIFY]) {
    if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }
  }
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8"));
  const { ok, freezeCheck } = enforceFreeze(freeze);
  // A broken freeze does not abort here — it is an INPUT to the churn verdict (a broken guide is the
  // strongest possible NOT_READY signal). We still record it.
  const annotations = JSON.parse(readFileSync(ANN_160, "utf8")).annotations;
  const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
  const holdout = JSON.parse(readFileSync(HOLDOUT, "utf8"));
  const falsify = JSON.parse(readFileSync(FALSIFY, "utf8"));

  const guideChurn = assessGuideChurn(annotations, { freezeBroken: !ok });
  const gate = decideFullScaleGate({
    guideChurn,
    instrumentShift: summary.instrumentShift,
    e3Rollup: holdout.e3Rollup,
    survivors: holdout.survivors,
    falsificationRollup: falsify.rollup,
  });

  const payload = {
    stage: "P1-1C-200",
    guideFreezeVersion: freeze.guideFreezeVersion,
    freezeIntact: ok,
    guideChurn,
    fullScaleGate: gate,
  };

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  writeFileSync(join(OUT_PRIVATE, "full-scale-gate.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", ...payload, freezeCheck,
  }) + "\n");
  writeFileSync(join(OUT_COMMITTED, "full-scale-gate.aggregate.json"), canonicalJson({
    visibility: "committed_safe", verbatimFree: true,
    note: "§19 guide-churn measures how often the FROZEN guide fell back to escape-hatch tokens / weak_inference on the broader corpus. §20 HOLDS for full scale while stability is confounded by the mixed annotation instrument — the remediation is a single-instrument re-annotation, not more data.",
    ...payload,
  }) + "\n");

  process.stdout.write(canonicalJson({
    status: "FULL_SCALE_GATE_200_READY",
    guideChurnVerdict: guideChurn.verdict,
    fallbackRate: guideChurn.fallbackRate,
    weakInferenceRate: guideChurn.weakInferenceRate,
    fullScaleDecision: gate.decision,
    blockers: gate.blockers,
  }) + "\n");
}

main();

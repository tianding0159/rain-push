// Report generation (PHASE 13).
//
// Assembles the value-proof deliverable reports from a pipeline run. Every report is a plain
// JSON object serialised with the corpus canonicalJson (sorted keys → byte-stable), so a
// replay produces identical bytes. Reports carry ONLY public-safe content: synthetic results,
// anonymised aggregates, redacted evidence ids/hashes, public failure categories. No private
// verbatim, no rater identities.
//
// Reports produced:
//   - blindEvalPack        : the shuffled evaluator packs (no arm labels)
//   - failureLedger        : replayable failure entries keyed by taxonomy code
//   - perArmReport         : per-arm aggregate auto diagnostics
//   - metricDistribution   : metric distributions across arms
//   - sourceLayerInfluence : retrieval source-layer distribution + C3 influence
//   - punctuationRhythm    : punctuation/rhythm vs corpus baseline
//   - severeGate           : R-DARK bidirectional gate FP/FN (spec vs engine)
//   - characterProof       : the honest conclusion (implemented/tested/evaluated/blocked)
//
// Zero runtime dependencies beyond the corpus io. Pure, deterministic.

import { canonicalJson } from "../../corpus/lib/io.mjs";
import { aggregateArmAuto } from "./metrics.mjs";
import { aggregateRhythm, comparedToBaseline } from "./rhythm.mjs";
import { ARMS } from "./arms.mjs";

// Group a suite's runArms results by arm → list of candidate message arrays.
function candidatesByArm(scenarioRuns) {
  const byArm = { A: [], B: [], C: [], D: [] };
  for (const run of scenarioRuns) {
    for (const c of run.candidates) {
      byArm[c.input.arm].push(c.candidate.messages);
    }
  }
  return byArm;
}

export function perArmReport(scenarioRuns) {
  const byArm = candidatesByArm(scenarioRuns);
  const arms = {};
  for (const a of ARMS) arms[a] = aggregateArmAuto(byArm[a]);
  return { kind: "perArmReport", arms };
}

export function metricDistribution(scenarioRuns) {
  const byArm = candidatesByArm(scenarioRuns);
  const dist = {};
  for (const a of ARMS) dist[a] = aggregateRhythm(byArm[a]);
  return { kind: "metricDistribution", arms: dist };
}

export function punctuationRhythmReport(scenarioRuns, baselineCandidates) {
  const byArm = candidatesByArm(scenarioRuns);
  const baseline = aggregateRhythm(baselineCandidates || []);
  const arms = {};
  for (const a of ARMS) {
    const agg = aggregateRhythm(byArm[a]);
    arms[a] = { aggregate: agg, vsBaseline: comparedToBaseline(agg, baseline) };
  }
  return { kind: "punctuationRhythm", baseline, arms };
}

// Source-layer influence, aggregated over the retrieval arms' recorded refs.
export function sourceLayerInfluenceReport(scenarioRuns) {
  const dist = {};
  let c3Sum = 0;
  let c3Count = 0;
  for (const run of scenarioRuns) {
    for (const c of run.candidates) {
      for (const turn of c.input.retrieval || []) {
        for (const [layer, n] of Object.entries(turn.sourceDistribution || {})) {
          dist[layer] = (dist[layer] || 0) + n;
        }
        c3Sum += turn.c3Influence || 0;
        c3Count += 1;
      }
    }
  }
  return {
    kind: "sourceLayerInfluence",
    distribution: dist,
    meanC3Influence: c3Count ? c3Sum / c3Count : 0,
  };
}

export function severeGateReport(gateResult) {
  return {
    kind: "severeGate",
    total: gateResult.total,
    severeCount: gateResult.severeCount,
    nonSevereCount: gateResult.nonSevereCount,
    spec: gateResult.spec,
    engine: gateResult.engine,
    rows: gateResult.rows.map((r) => ({
      scenarioId: r.scenarioId,
      type: r.type,
      expectedSevere: r.expectedSevere,
      expectedPath: r.expectedPath,
      specSevere: r.spec.severe,
      specPath: r.spec.path,
      engineSevere: r.engine.severe,
      specFalsePositive: r.specFalsePositive,
      specFalseNegative: r.specFalseNegative,
      engineFalseNegative: r.engineFalseNegative,
    })),
  };
}

// The failure ledger: one entry per detected failure, keyed by taxonomy code, replayable (it
// records the scenario + arm + the deterministic detector output, never private text).
export function failureLedger(scenarioRuns) {
  const entries = [];
  const byArm = (run, arm) => run.candidates.find((c) => c.input.arm === arm);
  for (const run of scenarioRuns) {
    for (const c of run.candidates) {
      const agg = aggregateArmAuto([c.candidate.messages]);
      if (agg.gptishHardBanHitsTotal > 0) {
        entries.push({ code: "ERR_JIEZHU", scenarioId: run.scenarioId, arm: c.input.arm, detail: `hardBan hits ${agg.gptishHardBanHitsTotal}` });
      }
    }
  }
  return { kind: "failureLedger", entries };
}

// The honest conclusion. status fields are the directive's required honesty split. The caller
// supplies what was actually implemented / tested / evaluated / blocked so this never
// overstates. usedRealCorpus / blindEvalDone gate the fidelity claim.
export function characterProof(summary) {
  return {
    kind: "characterProof",
    usedRealPrivateCorpus: summary.usedRealPrivateCorpus === true,
    allFourArmsRun: summary.allFourArmsRun === true,
    blindEvalDone: summary.blindEvalDone === true,
    acceptanceOverall: summary.acceptanceOverall || "NOT_EVALUABLE",
    conclusion: summary.conclusion,
    honesty: {
      implemented: summary.implemented || [],
      tested: summary.tested || [],
      privatelyEvaluated: summary.privatelyEvaluated || [],
      syntheticOnly: summary.syntheticOnly || [],
      blocked: summary.blocked || [],
      inferred: summary.inferred || [],
      notYetRun: summary.notYetRun || [],
    },
  };
}

// Serialise any report to canonical (byte-stable) JSON.
export function serialize(report) {
  return canonicalJson(report);
}

// P1-1D synthesis — taxonomy (§2), heatmap (§7), impact (§8), robustness (§9), ranking (§10),
// remediation (§11), simulation (§12), stop rule (§13). All built ON TOP of the paired measurements
// in instrument-bias.mjs. Nothing here re-annotates; it reads the A-vs-B deltas and reasons about them.

import {
  pairAll, actionBias, triggerBias, maskBias, longMessageBias, layerCoverages, inferenceQualityDelta, _acc,
} from "./instrument-bias.mjs";

const r3 = _acc.r3;

// ================================================================================================
// §2 — Bias Taxonomy. 14 named instrument biases. Each is DEFINED, given a measured support figure
// from the paired audit (its magnitude), and scoped to the layers it corrupts. Magnitude is expressed
// as a severity in [0,1] so §10 can rank and §7 can shade the heatmap.
// ================================================================================================
export function buildTaxonomy(pairs) {
  const ab = actionBias(pairs);
  const tb = triggerBias(pairs);
  const mb = maskBias(pairs);
  const lc = layerCoverages(pairs);
  const iq = inferenceQualityDelta(pairs);
  const n = pairs.length || 1;

  // helper: severity = 1 - retention for under-detection layers; capped [0,1]
  const underSev = (cov) => r3(Math.min(1, Math.max(0, 1 - cov.retention)));
  const overSev = (cov) => r3(Math.min(1, Math.max(0, cov.retention - 1)));

  const T = [
    {
      id: "under_segmentation",
      definition: "Instrument collapses a multi-action utterance into fewer actions than the reference marked.",
      layer: "L1_actions",
      support: { underSegmentationRecords: ab.underSegmentationRecords, actionDetectionRatio: ab.netDetectionRatio },
      severity: r3(ab.underSegmentationRecords / n),
      scope: ["transition_grammar", "momentum_grammar"],
    },
    {
      id: "over_segmentation",
      definition: "Instrument invents actions the reference did not mark (chiefly fallback tokens like no_clear_action).",
      layer: "L1_actions",
      support: { overDetectedTotal: ab.overDetectedTotal, topOver: ab.topOverDetectedActions.slice(0, 3) },
      severity: r3(Math.min(1, ab.overDetectedTotal / (ab.aActionTotal || 1))),
      scope: ["transition_grammar"],
    },
    {
      id: "action_vocabulary_bias",
      definition: "Specific action types are disproportionately missed or swapped (systematic per-token gaps).",
      layer: "L1_actions",
      support: { topUnderDetected: ab.topUnderDetectedActions.slice(0, 5), topConfused: ab.topConfusedActionPairs.slice(0, 5) },
      severity: underSev(lc.actions),
      scope: ["transition_grammar", "reveal_grammar", "performance_grammar"],
    },
    {
      id: "trigger_fallback_bias",
      definition: "Instrument routes triggers it cannot classify into escape-hatch domains instead of the specific one the reference used.",
      layer: "L2_trigger",
      support: { referenceEscape: tb.aEscapeToOther, instrumentEscape: tb.bEscapeToOther, agreement: tb.domainAgreementRate },
      severity: r3(1 - tb.domainAgreementRate),
      scope: ["trigger_sensitivity", "priors_grammar"],
    },
    {
      id: "trigger_confusion",
      definition: "Instrument maps one specific trigger domain onto a different specific domain (off-diagonal confusion).",
      layer: "L2_trigger",
      support: { topConfusions: tb.topConfusions.slice(0, 5), disagreements: tb.domainDisagreements },
      severity: r3(tb.domainDisagreements / n),
      scope: ["trigger_sensitivity", "priors_grammar"],
    },
    {
      id: "mask_detection_bias",
      definition: "Instrument fails to detect functional masks — dominated here by not seeing the reveal at all (see reveal under-detection).",
      layer: "L3_mask",
      support: { fn: mb.falseNegatives, fp: mb.falsePositives, ambiguousUnjudgeable: mb.ambiguousUnjudgeable, revealSurvival: mb.revealSurvivalRate },
      severity: r3(1 - mb.revealSurvivalRate),
      scope: ["reveal_grammar", "mask_grammar"],
    },
    {
      id: "driving_force_suppression",
      definition: "Instrument emits far fewer driving-force candidates than the reference (under-attribution of motive).",
      layer: "L2_driving_force",
      support: { retention: lc.drivingForce.retention, aTotal: lc.drivingForce.aTotal, bTotal: lc.drivingForce.bTotal },
      severity: underSev(lc.drivingForce),
      scope: ["priors_grammar", "driver_strategy_grammar"],
    },
    {
      id: "driving_force_inflation",
      definition: "Instrument emits MORE driving forces than the reference (over-attribution / guessing motive).",
      layer: "L2_driving_force",
      support: { retention: lc.drivingForce.retention },
      severity: overSev(lc.drivingForce),
      scope: ["priors_grammar"],
    },
    {
      id: "interaction_function_collapse",
      definition: "Instrument under-detects interaction functions relative to the reference.",
      layer: "L2_functions",
      support: { retention: lc.interactionFunctions.retention, fullyCollapsed: lc.interactionFunctions.recordsFullyCollapsed },
      severity: underSev(lc.interactionFunctions),
      scope: ["expected_partner_grammar", "performance_grammar"],
    },
    {
      id: "relationship_operation_collapse",
      definition: "Instrument under-detects explicit relationship operations.",
      layer: "L_relationship",
      support: { retention: lc.relationshipOps.retention, presentRetention: lc.relationshipPresent.retention },
      severity: underSev(lc.relationshipOps),
      scope: ["partner_operation_grammar", "relationship_grammar"],
    },
    {
      id: "expected_partner_collapse",
      definition: "Instrument under-detects the specific partner operation the utterance is engineered to elicit.",
      layer: "L_expected_partner",
      support: { retention: lc.expectedPartner.retention },
      severity: underSev(lc.expectedPartner),
      scope: ["expected_partner_grammar"],
    },
    {
      id: "performance_collapse",
      definition: "Instrument under-detects perform_confidence (surface confidence display).",
      layer: "L_performance",
      support: { retention: lc.performance.retention },
      severity: underSev(lc.performance),
      scope: ["performance_grammar", "reveal_grammar"],
    },
    {
      id: "meta_self_monitoring_miss",
      definition: "Instrument almost never detects meta self-monitoring tags the reference marked.",
      layer: "L_meta",
      support: { retention: lc.metaSelfMonitoring.retention, aTotal: lc.metaSelfMonitoring.aTotal, bTotal: lc.metaSelfMonitoring.bTotal },
      severity: underSev(lc.metaSelfMonitoring),
      scope: ["self_monitoring_grammar"],
    },
    {
      id: "weak_inference_inflation",
      definition: "Instrument marks judgements weak_inference far more often than the reference (systematic under-commitment).",
      layer: "L_confidence",
      support: { triggerWeakA: iq.triggerWeakInferenceA, triggerWeakB: iq.triggerWeakInferenceB, inflation: iq.triggerWeakInflation },
      severity: r3(Math.min(1, Math.max(0, iq.triggerWeakInflation))),
      scope: ["all_grammar_confidence"],
    },
    {
      id: "prior_leakage",
      definition: "Instrument attributes forces/affect from priors rather than the record text (guessing beyond evidence). Measured indirectly as driving-force emitted while trigger is weak_inference.",
      layer: "L2_driving_force",
      support: { note: "measured via driving-force present under weak trigger confidence in instrument output" },
      severity: r3(priorLeakageSeverity(pairs)),
      scope: ["priors_grammar"],
    },
  ];
  return T;
}

function priorLeakageSeverity(pairs) {
  let leak = 0, elig = 0;
  for (const { b } of pairs) {
    const weakTrig = b.triggerSensitivity?.confidence === "weak_inference";
    if (weakTrig) { elig++; if ((b.drivingForceCandidates || []).length > 0) leak++; }
  }
  return elig > 0 ? leak / elig : 0;
}

// ================================================================================================
// §7 — Bias Heatmap. rows = bias types, cols = annotation layers. Cell = severity if the bias touches
// that layer, else 0. Plus a per-layer reliability roll-up (1 - max bias severity on that layer).
// ================================================================================================
export const HEATMAP_LAYERS = [
  "L1_actions", "L2_trigger", "L2_functions", "L2_driving_force",
  "L3_mask", "L_relationship", "L_expected_partner", "L_performance", "L_meta", "L_confidence",
];

export function buildHeatmap(taxonomy) {
  const cells = taxonomy.map((t) => ({
    biasType: t.id,
    primaryLayer: t.layer,
    severity: t.severity,
  }));
  // layer reliability = 1 - (max severity of any bias whose primary layer is this layer)
  const layerReliability = HEATMAP_LAYERS.map((layer) => {
    const sevs = taxonomy.filter((t) => t.layer === layer).map((t) => t.severity);
    const worst = sevs.length ? Math.max(...sevs) : 0;
    return { layer, worstBiasSeverity: r3(worst), reliability: r3(1 - worst) };
  }).sort((a, b) => b.reliability - a.reliability);
  return {
    cells,
    layerReliability,
    mostReliableLayer: layerReliability[0],
    leastReliableLayer: layerReliability[layerReliability.length - 1],
  };
}

// ================================================================================================
// §8 — Impact Analysis. Map each bias to the grammar families it corrupts (from taxonomy scope), and
// invert to get, per grammar family, which biases threaten it and the aggregate threat.
// ================================================================================================
export function buildImpact(taxonomy) {
  const byBias = taxonomy.map((t) => ({ biasType: t.id, severity: t.severity, affectsGrammar: t.scope }));
  const byGrammar = new Map();
  for (const t of taxonomy) {
    for (const g of t.scope) {
      if (!byGrammar.has(g)) byGrammar.set(g, []);
      byGrammar.get(g).push({ biasType: t.id, severity: t.severity });
    }
  }
  const grammarThreat = [...byGrammar.entries()].map(([grammar, biases]) => {
    const sorted = biases.sort((a, b) => b.severity - a.severity);
    // aggregate threat: max severity dominates, others add diminishing weight
    const agg = r3(Math.min(1, sorted.reduce((s, b, i) => s + b.severity / (i + 1), 0)));
    return { grammar, aggregateThreat: agg, biases: sorted };
  }).sort((a, b) => b.aggregateThreat - a.aggregateThreat);
  return { byBias, grammarThreat };
}

// ================================================================================================
// §9 — Grammar Robustness. For each grammar candidate, bias sensitivity = the aggregate threat from
// §8 on the families it belongs to, bucketed LOW/MEDIUM/HIGH. A candidate whose evidence rides on a
// high-severity layer is fragile: if the instrument changes, the pattern can vanish.
// ================================================================================================
// map each grammar CANDIDATE id to the grammar family/families its evidence depends on.
export const CANDIDATE_DEPENDENCIES = {
  GC1_delayed_reply_to_accuse_or_seek: ["trigger_sensitivity", "transition_grammar", "expected_partner_grammar"],
  GC2_reveal_to_mask: ["reveal_grammar", "mask_grammar"],
  GC3_accusation_seeks_reassurance: ["transition_grammar", "expected_partner_grammar"],
  GC4_exclusivity_trigger_to_unique: ["trigger_sensitivity", "priors_grammar", "relationship_grammar"],
  GC5_relationship_management_explicit: ["relationship_grammar", "partner_operation_grammar"],
  GC6_low_trigger_high_activation: ["trigger_sensitivity"],
  GC7_self_monitoring_present: ["self_monitoring_grammar"],
};

export function buildRobustness(impact) {
  const threatByGrammar = new Map(impact.grammarThreat.map((g) => [g.grammar, g.aggregateThreat]));
  const bucket = (s) => (s >= 0.6 ? "HIGH" : s >= 0.3 ? "MEDIUM" : "LOW");
  return Object.entries(CANDIDATE_DEPENDENCIES).map(([candidate, deps]) => {
    const sev = deps.map((d) => threatByGrammar.get(d) || 0);
    const worst = sev.length ? Math.max(...sev) : 0;
    return {
      candidate,
      dependsOn: deps,
      maxDependencyThreat: r3(worst),
      biasSensitivity: bucket(worst),
      fragile: worst >= 0.6,
    };
  }).sort((a, b) => b.maxDependencyThreat - a.maxDependencyThreat);
}

// ================================================================================================
// §10 — Priority Ranking. Top biases by REMEDIATION BENEFIT = severity × grammar-reach × fixability.
// grammar-reach = number of grammar families the bias touches. fixability is a fixed heuristic per bias
// (some biases are cheap to fix with a validator, others need vocabulary work).
// ================================================================================================
const FIXABILITY = {
  under_segmentation: 0.8, action_vocabulary_bias: 0.7, trigger_fallback_bias: 0.6,
  trigger_confusion: 0.5, mask_detection_bias: 0.9, driving_force_suppression: 0.6,
  driving_force_inflation: 0.7, interaction_function_collapse: 0.5,
  relationship_operation_collapse: 0.6, expected_partner_collapse: 0.5,
  performance_collapse: 0.7, meta_self_monitoring_miss: 0.4, weak_inference_inflation: 0.5,
  prior_leakage: 0.6, over_segmentation: 0.8,
};

export function buildPriority(taxonomy) {
  const ranked = taxonomy.map((t) => {
    const reach = t.scope.length;
    const fix = FIXABILITY[t.id] ?? 0.5;
    const benefit = r3(t.severity * Math.min(1, reach / 3) * fix);
    return { biasType: t.id, severity: t.severity, grammarReach: reach, fixability: fix, remediationBenefit: benefit, stars: Math.max(1, Math.round(benefit * 5)) };
  }).sort((a, b) => b.remediationBenefit - a.remediationBenefit);
  return ranked.slice(0, 10);
}

// ================================================================================================
// §11 — Remediation Proposals. Minimal fix per top bias: a guide rule, validator, enum add, review
// question, or QA test. NO rewrite. These are PROPOSALS ONLY — the directive forbids applying them.
// ================================================================================================
const REMEDIATION = {
  under_segmentation: { type: "validator", proposal: "add a segmentation validator: when an utterance contains a coordinating/turn marker (a CJK coordinating conjunction or a newline) flag single-action annotations for a second segmentation pass." },
  action_vocabulary_bias: { type: "guide_rule + qa_test", proposal: "add explicit lexical cues for the top-missed action (reveal) to the annotator; add a QA test asserting reveal recall on a fixed mini-set." },
  mask_detection_bias: { type: "review_question", proposal: "make mask conditional on reveal detection first; a mask review question only fires once a reveal is detected (the FN here is a reveal miss, not a mask miss)." },
  trigger_fallback_bias: { type: "guide_rule", proposal: "add a decision rule that prefers the nearest specific trigger domain before falling back to other/indeterminate." },
  trigger_confusion: { type: "review_question", proposal: "add disambiguation questions for the top confused pairs (e.g. public_evaluation vs humiliation)." },
  driving_force_suppression: { type: "guide_rule", proposal: "lower the evidence bar for emitting a driving-force CANDIDATE (candidate, not committed) so motive coverage matches the reference." },
  interaction_function_collapse: { type: "qa_test", proposal: "add a function-recall QA test against the reference mini-set; extend function lexical cues." },
  relationship_operation_collapse: { type: "validator", proposal: "add a validator: partner-targeted utterances with 2nd-person address get a relationship-operation prompt." },
  performance_collapse: { type: "guide_rule", proposal: "add perform_confidence lexical cues (boast/flex markers) to the annotator." },
  meta_self_monitoring_miss: { type: "enum + guide_rule", proposal: "add meta-tag lexical cues; accept that meta is inherently low-recall and down-weight meta-derived grammar." },
  weak_inference_inflation: { type: "review_question", proposal: "add a calibration step: only mark weak_inference when no lexical cue is present, to stop blanket under-commitment." },
  prior_leakage: { type: "validator", proposal: "add a validator forbidding committed driving-force when trigger confidence is weak_inference (force candidate-only)." },
  over_segmentation: { type: "validator", proposal: "strip no_clear_action when any real action is present in the same record." },
  driving_force_inflation: { type: "validator", proposal: "cap driving-force candidates and require a lexical anchor per candidate." },
  expected_partner_collapse: { type: "guide_rule", proposal: "add expected-partner cues for the most common immediate-reply classes." },
};

export function buildRemediation(priority) {
  return priority.map((p) => ({
    biasType: p.biasType,
    remediationBenefit: p.remediationBenefit,
    ...REMEDIATION[p.biasType],
  }));
}

// ================================================================================================
// §12 — Simulation. WITHOUT re-annotating: model "what if we fixed bias K" as recovering a fraction of
// the measured A↔B gap on the layers that bias owns, then estimate how much the instrument's layer
// coverage would move toward the reference. This is a projection over MEASURED gaps, not new data.
// fixEffectiveness = fixability (how much of the gap a minimal fix plausibly closes).
// ================================================================================================
export function simulateFixes(pairs, priority, topK = 2) {
  const lc = layerCoverages(pairs);
  const layerFor = {
    under_segmentation: "actions", action_vocabulary_bias: "actions",
    mask_detection_bias: "functionalMask", driving_force_suppression: "drivingForce",
    interaction_function_collapse: "interactionFunctions", relationship_operation_collapse: "relationshipOps",
    performance_collapse: "performance", meta_self_monitoring_miss: "metaSelfMonitoring",
    expected_partner_collapse: "expectedPartner",
  };
  const sims = [];
  let cumulativeRecovered = 0;
  priority.slice(0, topK).forEach((p, i) => {
    const layerKey = layerFor[p.biasType];
    const cov = layerKey ? lc[layerKey] : null;
    const gap = cov ? Math.max(0, cov.aTotal - cov.bTotal) : 0;
    const recovered = Math.round(gap * p.fixability);
    const newRetention = cov ? r3((cov.bTotal + recovered) / (cov.aTotal || 1)) : null;
    cumulativeRecovered += recovered;
    sims.push({
      rank: i + 1, biasType: p.biasType, layer: layerKey || p.biasType,
      measuredGap: gap, projectedRecovered: recovered,
      retentionBefore: cov ? cov.retention : null, retentionAfter: newRetention,
      grammarDeltaNote: `closing this gap moves ${p.biasType}'s layer from ${cov ? cov.retention : "n/a"} toward reference; affects ${p.grammarReach} grammar families.`,
    });
  });
  return { topK, simulations: sims, cumulativeUnitsRecovered: cumulativeRecovered };
}

// ================================================================================================
// §13 — Stop Rule. Bias is ACCEPTABLE only if no grammar family is under HIGH threat AND the headline
// action detection ratio is within tolerance AND no E3-relevant candidate (GC4/GC5, the P1-1C survivors)
// is fragile. Otherwise BIAS_TOO_HIGH → must fix instrument before 1051.
// ================================================================================================
export const ACTION_RATIO_FLOOR = 0.85; // instrument must retain >=85% of reference actions
export const E3_SURVIVORS = ["GC4_exclusivity_trigger_to_unique", "GC5_relationship_management_explicit"];

export function decideStopRule({ pairs, robustness, impact }) {
  const ab = actionBias(pairs);
  const reasons = [];

  const highThreatGrammars = impact.grammarThreat.filter((g) => g.aggregateThreat >= 0.6).map((g) => g.grammar);
  if (highThreatGrammars.length > 0) reasons.push(`grammar families under HIGH instrument threat: ${highThreatGrammars.join(", ")}`);

  if (ab.netDetectionRatio < ACTION_RATIO_FLOOR) reasons.push(`action detection ratio ${ab.netDetectionRatio} < floor ${ACTION_RATIO_FLOOR}: the instrument loses too many actions vs the reference`);

  const fragileSurvivors = robustness.filter((r) => E3_SURVIVORS.includes(r.candidate) && r.fragile).map((r) => r.candidate);
  if (fragileSurvivors.length > 0) reasons.push(`P1-1C E3 survivors are instrument-fragile: ${fragileSurvivors.join(", ")}`);

  const status = reasons.length === 0 ? "BIAS_ACCEPTABLE" : "BIAS_TOO_HIGH";
  const proceed = status === "BIAS_ACCEPTABLE" ? "PROCEED_TO_1051" : "HOLD_FIX_INSTRUMENT_FIRST";
  return {
    status,
    proceed,
    actionDetectionRatio: ab.netDetectionRatio,
    highThreatGrammars,
    fragileSurvivors,
    reasons,
  };
}

// ================================================================================================
// Orchestrator — runs the whole audit from the reference records.
// ================================================================================================
export function runInstrumentBiasAudit(referenceRecords) {
  const pairs = pairAll(referenceRecords);
  const taxonomy = buildTaxonomy(pairs);
  const heatmap = buildHeatmap(taxonomy);
  const impact = buildImpact(taxonomy);
  const robustness = buildRobustness(impact);
  const priority = buildPriority(taxonomy);
  const remediation = buildRemediation(priority);
  const simulation = simulateFixes(pairs, priority, 2);
  const stopRule = decideStopRule({ pairs, robustness, impact });
  return {
    n: referenceRecords.length,
    actionBias: actionBias(pairs),
    triggerBias: triggerBias(pairs),
    maskBias: maskBias(pairs),
    longMessageBias: longMessageBias(pairs),
    layerCoverages: layerCoverages(pairs),
    inferenceQuality: inferenceQualityDelta(pairs),
    taxonomy, heatmap, impact, robustness, priority, remediation, simulation, stopRule,
  };
}

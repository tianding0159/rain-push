import test from "node:test";
import assert from "node:assert/strict";

import {
  pairAll, actionBias, triggerBias, maskBias, longMessageBias,
  layerCoverages, inferenceQualityDelta, _acc,
} from "../lib/instrument-bias.mjs";
import {
  buildTaxonomy, buildHeatmap, buildImpact, buildRobustness, buildPriority,
  buildRemediation, simulateFixes, decideStopRule, runInstrumentBiasAudit,
  HEATMAP_LAYERS, CANDIDATE_DEPENDENCIES, ACTION_RATIO_FLOOR, E3_SURVIVORS,
} from "../lib/instrument-bias-synthesis.mjs";

// ------------------------------------------------------------------------------------------------
// Fixtures. The paired design's whole point: B (heuristic) is run on the SAME record A annotated,
// consuming rec.text. If we give a reference record NEUTRAL text, B collapses to no_clear_action /
// empty layers (verified against the annotator), so any rich A annotation becomes a *measured*
// A-vs-B gap on identical input — an instrument effect, character held constant. That lets us
// construct records with a KNOWN bias magnitude and assert the engine measures exactly it.
// ------------------------------------------------------------------------------------------------
let SEQ = 0;
function refRec(over = {}) {
  SEQ += 1;
  return {
    presentationId: `PA-${String(SEQ).padStart(3, "0")}`,
    linkId: `link${SEQ.toString(16).padStart(4, "0")}`,
    evidenceGrade: "E2",
    text: over.text ?? "",                       // neutral text ⇒ B collapses
    behaviorActionSequence: [],
    interactionFunctions: { functions: [] },
    drivingForceCandidates: [],
    triggerSensitivity: { domain: "no_external_trigger", confidence: "explicit" },
    affect: { primarySurface: { value: "neutral", confidence: "explicit" } },
    expectedReply: { immediateReply: { classes: [], confidence: "explicit" } },
    relationshipManagement: { present: false, operations: [] },
    maskAnalysis: { functionalMask: false },
    metaSelfMonitoring: { tags: [] },
    ...over,
  };
}
const acts = (...names) => ({ behaviorActionSequence: names.map((action, i) => ({ action, order: i + 1 })) });
const fns = (...names) => ({ interactionFunctions: { functions: names.map((f) => ({ function: f })) } });

// Sanity: confirm the annotator really collapses on neutral text (the assumption every fixture rests on).
test("assumption: Instrument B collapses on neutral text", () => {
  const [{ b }] = pairAll([refRec({ text: "" })]);
  assert.deepEqual(_acc.actionsOf(b), ["no_clear_action"]);
  assert.equal(_acc.triggerDomainOf(b), "no_external_trigger");
  assert.equal(_acc.maskOf(b), false);
});

// ================================================================================================
// §1 — Paired design
// ================================================================================================
test("§1 pairAll pairs every reference record with B on the same input, preserving id", () => {
  const recs = [refRec(), refRec(), refRec()];
  const pairs = pairAll(recs);
  assert.equal(pairs.length, 3);
  for (let i = 0; i < pairs.length; i++) {
    assert.equal(pairs[i].id, recs[i].presentationId);
    assert.equal(pairs[i].a, recs[i]);
    assert.ok(pairs[i].b, "B annotation present");
  }
});

test("§1 audit is deterministic — same reference in ⇒ byte-identical serialization", () => {
  const recs = [refRec({ ...acts("reveal", "seek_confirmation") }), refRec({ ...acts("self_devalue") })];
  const one = JSON.stringify(runInstrumentBiasAudit(recs));
  const two = JSON.stringify(runInstrumentBiasAudit(recs));
  assert.equal(one, two);
});

// ================================================================================================
// §3 — Action bias
// ================================================================================================
test("§3 under-detection: A actions B misses are counted, detection ratio < 1", () => {
  // A marks 2 actions on each of 2 records (4 total); B (neutral text) marks no_clear_action each.
  const pairs = pairAll([
    refRec({ ...acts("reveal", "seek_confirmation") }),
    refRec({ ...acts("self_devalue", "reveal") }),
  ]);
  const ab = actionBias(pairs);
  assert.equal(ab.aActionTotal, 4);
  // B emits one fallback token per record ⇒ overDetected counts those, underDetected counts the 4 A actions.
  assert.equal(ab.underDetectedTotal, 4);
  assert.ok(ab.netDetectionRatio < 1, "instrument detects fewer actions than reference");
  const under = new Map(ab.topUnderDetectedActions.map((x) => [x.key, x.count]));
  assert.equal(under.get("reveal"), 2);
  assert.equal(under.get("seek_confirmation"), 1);
});

test("§3 under-segmentation: multi-action A record collapsed by B is flagged once", () => {
  const pairs = pairAll([refRec({ ...acts("reveal", "seek_confirmation", "self_devalue") })]);
  const ab = actionBias(pairs);
  assert.equal(ab.underSegmentationRecords, 1);
});

test("§3 over-detection: fallback tokens B invents are counted as over-detected", () => {
  // A record with zero actions; B stamps no_clear_action ⇒ pure over-detection.
  const pairs = pairAll([refRec({ behaviorActionSequence: [] })]);
  const ab = actionBias(pairs);
  const over = new Map(ab.topOverDetectedActions.map((x) => [x.key, x.count]));
  assert.equal(over.get("no_clear_action"), 1);
});

test("§3 confused pair: A action missed + B action added within one record ⇒ X=>Y", () => {
  const pairs = pairAll([refRec({ ...acts("reveal") })]); // A=reveal, B=no_clear_action
  const ab = actionBias(pairs);
  const conf = new Map(ab.topConfusedActionPairs.map((x) => [x.key, x.count]));
  assert.equal(conf.get("reveal=>no_clear_action"), 1);
});

// ================================================================================================
// §4 — Trigger bias
// ================================================================================================
test("§4 domain disagreement + agreement rate computed against reference", () => {
  const pairs = pairAll([
    refRec({ triggerSensitivity: { domain: "exclusivity_challenge", confidence: "explicit" } }),
    refRec({ triggerSensitivity: { domain: "no_external_trigger", confidence: "explicit" } }),
  ]);
  const tb = triggerBias(pairs);
  // record 1: A=exclusivity_challenge, B=no_external_trigger ⇒ disagree; record 2 agrees.
  assert.equal(tb.domainDisagreements, 1);
  assert.equal(tb.domainAgreementRate, 0.5);
});

test("§4 fallback-to-other counted only when a domain is an escape hatch", () => {
  const pairs = pairAll([
    refRec({ triggerSensitivity: { domain: "other", confidence: "explicit" } }),
    refRec({ triggerSensitivity: { domain: "indeterminate", confidence: "explicit" } }),
    refRec({ triggerSensitivity: { domain: "exclusivity_challenge", confidence: "explicit" } }),
  ]);
  const tb = triggerBias(pairs);
  assert.equal(tb.aEscapeToOther, 2, "reference used escape domain twice");
});

// ================================================================================================
// §5 — Mask bias (reference-anchored, reveal-conditional)
// ================================================================================================
test("§5 mask ambiguous: A reveal-bearing but B doesn't see the reveal ⇒ unjudgeable, not FN", () => {
  // A marks reveal + mask true; B (neutral text) has no reveal ⇒ cannot judge mask.
  const pairs = pairAll([refRec({ ...acts("reveal"), maskAnalysis: { functionalMask: true } })]);
  const mb = maskBias(pairs);
  assert.equal(mb.revealBearingInReference, 1);
  assert.equal(mb.ambiguousUnjudgeable, 1);
  assert.equal(mb.falseNegatives, 0, "a reveal miss must NOT be miscounted as a mask FN");
  assert.equal(mb.revealSurvivalRate, 0, "B kept none of the reveals");
});

test("§5 non-reveal records are excluded from the mask denominator", () => {
  const pairs = pairAll([refRec({ ...acts("seek_confirmation") })]);
  const mb = maskBias(pairs);
  assert.equal(mb.revealBearingInReference, 0);
});

// ================================================================================================
// §6 — Long-message bias
// ================================================================================================
test("§6 length buckets by reference text length; retention reported per bucket", () => {
  const short = refRec({ text: "ok", ...acts("reveal") });                 // 0-14
  const long = refRec({ text: "x".repeat(70), ...acts("reveal", "self_devalue") }); // 60+
  const lm = longMessageBias(pairAll([short, long]));
  const byBucket = new Map(lm.rows.map((r) => [r.lengthBucket, r]));
  assert.equal(byBucket.get("0-14").n, 1);
  assert.equal(byBucket.get("60+").n, 1);
  assert.ok(byBucket.get("0-14").meanActionsA >= 1);
  assert.equal(typeof lm.actionRetentionDropsWithLength, "boolean");
});

// ================================================================================================
// Layer coverage + inference-quality primitives (feed §2/§7)
// ================================================================================================
test("layerCoverages: driving-force layer collapses when B emits none on neutral text", () => {
  // Driving-force is a clean collapse layer: B emits [] on neutral text, so an A candidate is a full
  // measured gap. (Functions are NOT clean — B stamps an "unknown" fallback token, exercised below.)
  const pairs = pairAll([
    refRec({ drivingForceCandidates: [{ candidate: "attachment_security" }] }),
    refRec({ drivingForceCandidates: [] }),
  ]);
  const lc = layerCoverages(pairs);
  assert.equal(lc.drivingForce.aTotal, 1);
  assert.equal(lc.drivingForce.bTotal, 0);
  assert.equal(lc.drivingForce.retention, 0);
  assert.equal(lc.drivingForce.recordsFullyCollapsed, 1);
});

test("layerCoverages: functions layer sees B's 'unknown' fallback, not a clean zero", () => {
  const pairs = pairAll([refRec({ ...fns("reassurance_seeking", "exclusivity_assertion") })]);
  const lc = layerCoverages(pairs);
  assert.equal(lc.interactionFunctions.aTotal, 2);
  assert.equal(lc.interactionFunctions.bTotal, 1, "B emits one 'unknown' fallback function");
});

test("inferenceQualityDelta: reference weak-inference vs instrument weak-inference", () => {
  const pairs = pairAll([refRec({ triggerSensitivity: { domain: "no_external_trigger", confidence: "weak_inference" } })]);
  const iq = inferenceQualityDelta(pairs);
  assert.equal(iq.triggerWeakInferenceA, 1);
});

// ================================================================================================
// §2 — Taxonomy
// ================================================================================================
test("§2 taxonomy has ≥14 named bias types, each with definition/layer/severity/scope", () => {
  const tax = buildTaxonomy(pairAll([refRec({ ...acts("reveal") })]));
  assert.ok(tax.length >= 14, `expected ≥14 bias types, got ${tax.length}`);
  const ids = new Set(tax.map((t) => t.id));
  assert.equal(ids.size, tax.length, "bias ids are unique");
  for (const t of tax) {
    assert.equal(typeof t.definition, "string");
    assert.ok(t.definition.length > 0);
    assert.ok(HEATMAP_LAYERS.includes(t.layer), `layer ${t.layer} is a known heatmap layer`);
    assert.ok(t.severity >= 0 && t.severity <= 1, "severity in [0,1]");
    assert.ok(Array.isArray(t.scope) && t.scope.length > 0, "bias maps to at least one grammar family");
  }
});

// ================================================================================================
// §7 — Heatmap
// ================================================================================================
test("§7 heatmap: reliability = 1 − worst severity on a layer; most/least reliable identified", () => {
  const hm = buildHeatmap(buildTaxonomy(pairAll([refRec({ ...acts("reveal") })])));
  assert.equal(hm.layerReliability.length, HEATMAP_LAYERS.length);
  // sorted best→worst
  for (let i = 1; i < hm.layerReliability.length; i++) {
    assert.ok(hm.layerReliability[i - 1].reliability >= hm.layerReliability[i].reliability);
  }
  assert.equal(hm.mostReliableLayer, hm.layerReliability[0]);
  assert.equal(hm.leastReliableLayer, hm.layerReliability[hm.layerReliability.length - 1]);
  for (const l of hm.layerReliability) {
    assert.ok(Math.abs(l.reliability - (1 - l.worstBiasSeverity)) < 1e-9);
  }
});

// ================================================================================================
// §8 — Impact
// ================================================================================================
test("§8 impact: every taxonomy scope entry appears as a threatened grammar family", () => {
  const tax = buildTaxonomy(pairAll([refRec({ ...acts("reveal") })]));
  const impact = buildImpact(tax);
  const families = new Set(impact.grammarThreat.map((g) => g.grammar));
  for (const t of tax) for (const g of t.scope) assert.ok(families.has(g), `family ${g} present in impact`);
  // aggregate threat is sorted desc and bounded
  for (let i = 1; i < impact.grammarThreat.length; i++) {
    assert.ok(impact.grammarThreat[i - 1].aggregateThreat >= impact.grammarThreat[i].aggregateThreat);
  }
  for (const g of impact.grammarThreat) assert.ok(g.aggregateThreat >= 0 && g.aggregateThreat <= 1);
});

// ================================================================================================
// §9 — Robustness
// ================================================================================================
test("§9 robustness: every grammar candidate bucketed LOW/MEDIUM/HIGH; fragile ⇔ threat ≥ 0.6", () => {
  const tax = buildTaxonomy(pairAll([refRec({ ...acts("reveal") })]));
  const rob = buildRobustness(buildImpact(tax));
  assert.equal(rob.length, Object.keys(CANDIDATE_DEPENDENCIES).length);
  for (const r of rob) {
    assert.ok(["LOW", "MEDIUM", "HIGH"].includes(r.biasSensitivity));
    assert.equal(r.fragile, r.maxDependencyThreat >= 0.6);
    assert.equal(r.biasSensitivity === "HIGH", r.maxDependencyThreat >= 0.6);
  }
});

// ================================================================================================
// §10 — Priority
// ================================================================================================
test("§10 priority: Top-10 ranked by remediationBenefit = severity × reach × fixability", () => {
  const tax = buildTaxonomy(pairAll([refRec({ ...acts("reveal", "self_devalue") })]));
  const pri = buildPriority(tax);
  assert.ok(pri.length <= 10);
  for (let i = 1; i < pri.length; i++) {
    assert.ok(pri[i - 1].remediationBenefit >= pri[i].remediationBenefit, "sorted desc by benefit");
  }
  for (const p of pri) {
    const expected = _acc.r3(p.severity * Math.min(1, p.grammarReach / 3) * p.fixability);
    assert.equal(p.remediationBenefit, expected);
    assert.ok(p.stars >= 1 && p.stars <= 5);
  }
});

// ================================================================================================
// §11 — Remediation
// ================================================================================================
test("§11 remediation: each prioritized bias gets a typed, minimal proposal", () => {
  const tax = buildTaxonomy(pairAll([refRec({ ...acts("reveal") })]));
  const rem = buildRemediation(buildPriority(tax));
  assert.ok(rem.length > 0);
  for (const r of rem) {
    assert.equal(typeof r.type, "string");
    assert.ok(r.type.length > 0);
    assert.equal(typeof r.proposal, "string");
    assert.ok(r.proposal.length > 0);
  }
});

test("§11 remediation proposals carry no CJK (committed-safe strings)", () => {
  const tax = buildTaxonomy(pairAll([refRec({ ...acts("reveal") })]));
  const rem = buildRemediation(buildPriority(tax));
  const blob = JSON.stringify(rem);
  assert.equal(blob.match(/[\u4e00-\u9fff]/g), null, "remediation text must be CJK-free");
});

// ================================================================================================
// §12 — Simulation
// ================================================================================================
test("§12 simulation projects recovery over MEASURED gaps without re-annotating", () => {
  // A has 4 reveal-family actions across records B collapses ⇒ a real measured action gap.
  const recs = [
    refRec({ ...acts("reveal", "self_devalue") }),
    refRec({ ...acts("reveal", "seek_confirmation") }),
  ];
  const pairs = pairAll(recs);
  const pri = buildPriority(buildTaxonomy(pairs));
  const sim = simulateFixes(pairs, pri, 2);
  assert.equal(sim.topK, 2);
  assert.ok(sim.simulations.length <= 2);
  let sum = 0;
  for (const s of sim.simulations) {
    assert.ok(s.measuredGap >= 0);
    assert.ok(s.projectedRecovered >= 0);
    assert.ok(s.projectedRecovered <= s.measuredGap, "cannot recover more than the measured gap");
    if (s.retentionAfter !== null) assert.ok(s.retentionAfter >= (s.retentionBefore ?? 0) - 1e-9);
    sum += s.projectedRecovered;
  }
  assert.equal(sim.cumulativeUnitsRecovered, sum);
});

// ================================================================================================
// §13 — Stop rule (both branches)
// ================================================================================================
test("§13 stop rule = BIAS_TOO_HIGH when action ratio below floor / grammars under threat", () => {
  const recs = Array.from({ length: 6 }, () => refRec({ ...acts("reveal", "self_devalue") }));
  const pairs = pairAll(recs);
  const impact = buildImpact(buildTaxonomy(pairs));
  const rob = buildRobustness(impact);
  const sr = decideStopRule({ pairs, robustness: rob, impact });
  assert.equal(sr.status, "BIAS_TOO_HIGH");
  assert.equal(sr.proceed, "HOLD_FIX_INSTRUMENT_FIRST");
  assert.ok(sr.actionDetectionRatio < ACTION_RATIO_FLOOR);
  assert.ok(sr.reasons.length > 0);
});

test("§13 stop rule = BIAS_ACCEPTABLE when no grammar under threat, ratio ok, survivors robust", () => {
  // The stop rule is a pure decision over {pairs, impact, robustness}. Real corpus + neutral fixtures
  // both trip TOO_HIGH (the honest audit verdict), so to exercise the ACCEPTABLE branch we feed the
  // decision hand-built inputs representing a low-bias world: high action retention, all grammar
  // threats below 0.6, and no fragile E3 survivor.
  const goodImpact = { grammarThreat: [{ grammar: "reveal_grammar", aggregateThreat: 0.2, biases: [] }] };
  const goodRobustness = [
    { candidate: "GC4_exclusivity_trigger_to_unique", maxDependencyThreat: 0.2, biasSensitivity: "LOW", fragile: false },
    { candidate: "GC5_relationship_management_explicit", maxDependencyThreat: 0.1, biasSensitivity: "LOW", fragile: false },
  ];
  // ratio-safe pairs: A and B both mark exactly the same single action ⇒ ratio 1.0.
  const ratioSafe = pairAll([{ ...refRec(), behaviorActionSequence: [{ action: "no_clear_action", order: 1 }] }]);
  const sr = decideStopRule({ pairs: ratioSafe, robustness: goodRobustness, impact: goodImpact });
  assert.equal(sr.status, "BIAS_ACCEPTABLE");
  assert.equal(sr.proceed, "PROCEED_TO_1051");
  assert.equal(sr.highThreatGrammars.length, 0);
  assert.equal(sr.fragileSurvivors.length, 0);
  assert.ok(sr.actionDetectionRatio >= ACTION_RATIO_FLOOR);
});

test("§13 E3 survivor constant matches the P1-1C survivors under audit", () => {
  assert.ok(E3_SURVIVORS.includes("GC4_exclusivity_trigger_to_unique"));
  assert.ok(E3_SURVIVORS.includes("GC5_relationship_management_explicit"));
});

// ================================================================================================
// Orchestrator shape — the driver serializes exactly these keys.
// ================================================================================================
test("runInstrumentBiasAudit returns the full audit surface the driver emits", () => {
  const audit = runInstrumentBiasAudit([refRec({ ...acts("reveal") }), refRec({ text: "ok" })]);
  for (const k of [
    "n", "actionBias", "triggerBias", "maskBias", "longMessageBias", "layerCoverages",
    "inferenceQuality", "taxonomy", "heatmap", "impact", "robustness", "priority",
    "remediation", "simulation", "stopRule",
  ]) assert.ok(k in audit, `audit has ${k}`);
  assert.equal(audit.n, 2);
  assert.ok(audit.taxonomy.length >= 14);
});

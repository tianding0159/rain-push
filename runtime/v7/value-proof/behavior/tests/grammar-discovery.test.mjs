// Tests for the P1-1B Behavior Grammar pipeline:
//   grammar-discovery.mjs   (transition / coupling mining, unique-record support)
//   grammar-hypotheses.mjs  (H1-H11 data-first evaluation)
//   grammar-churn.mjs       (annotation-guide churn signals)
//   grammar-gate.mjs        (PROCEED_TO_200 gate)
//   grammar-candidate.mjs   (schema + production_ready ban + rate rule)
//
// Fixtures are SYNTHETIC and text-free. Each test isolates one behavior and would FAIL if the
// corresponding rule were removed. Determinism is asserted by byte-comparing two runs.

import test from "node:test";
import assert from "node:assert/strict";
import {
  runDiscovery,
  discoverTransitions,
  discoverRevealMask,
  discoverDrivingForceStrategy,
  discoverRelationshipOperations,
  discoverIntraMessageMomentum,
  pilotRate,
  PILOT_TAG,
} from "../lib/grammar-discovery.mjs";
import {
  evaluateGrammarHypotheses,
  GRAMMAR_HYP_STATUS,
  MIN_ELIGIBLE,
} from "../lib/grammar-hypotheses.mjs";
import { detectChurn, CHURN_CODES, FALLBACK_FRACTION } from "../lib/grammar-churn.mjs";
import { evaluateProceedGate, GATE_STATUS } from "../lib/grammar-gate.mjs";
import { validateGrammarCandidate, GRAMMAR_RULE_CODES, BANNED_TOKEN } from "../lib/grammar-candidate.mjs";

// ---------------------------------------------------------------------------
// Synthetic annotation builder. Only the fields the discovery libraries read are populated.
// `actions` is a list of [action, confidence] pairs turned into an ordered behaviorActionSequence.
// ---------------------------------------------------------------------------
function ann(id, actions, extra = {}) {
  return {
    presentationId: id,
    linkId: extra.linkId || `hash_${id}`,
    behaviorActionSequence: actions.map(([action, confidence], i) => ({
      action,
      order: i + 1,
      confidence: confidence || "strongly_supported",
      textualEvidence: "ev",
    })),
    affect: extra.affect || { primarySurface: { value: "affection", confidence: "weak_inference" }, coexistenceType: "unknown" },
    drivingForceCandidates: extra.drivingForceCandidates || [],
    triggerSensitivity: extra.triggerSensitivity || { domain: "other", observedTriggerIntensity: "unknown", inferredInternalActivation: "unknown" },
    relationshipManagement: extra.relationshipManagement || { present: false, operations: [] },
    interactionFunctions: extra.interactionFunctions || { functions: [{ function: "reduce_distance", role: "primary", confidence: "weak_inference" }] },
    expectedReply: extra.expectedReply || { immediateReply: { classes: [], confidence: "unknown" }, relationshipReply: { classes: [], confidence: "unknown" } },
    metaSelfMonitoring: extra.metaSelfMonitoring || { tags: [] },
    reviewFlags: extra.reviewFlags || [],
    l1_observable: extra.l1_observable || { observableActs: ["(x)"], target: "partner" },
  };
}

// A small synthetic vocab for churn tests (only the keys the detector audits).
function vocab() {
  return {
    affectLabels: ["affection", "anger", "joy", "desire"],
    triggerDomains: ["perceived_rejection", "delayed_reply", "other"],
    targets: ["partner", "self", "unknown"],
    behaviorActions: ["reveal", "self_devalue", "demand", "accuse", "perform_confidence", "other", "no_clear_action"],
    relationshipOperations: ["test_bond", "repair_bond", "seek_exclusivity"],
  };
}

// ===========================================================================
// 1. Transitions — unique-record support is the primary weight (§4/§5)
// ===========================================================================
test("bigram recordSupport counts distinct records, not raw occurrences", () => {
  const data = [
    ann("A", [["reveal"], ["self_devalue"]]),
    ann("B", [["reveal"], ["self_devalue"]]),
  ];
  const t = discoverTransitions(data);
  const bg = t.bigrams.find((b) => b.key === "reveal>self_devalue");
  assert.equal(bg.recordSupport, 2);
});

test("a transition repeated inside ONE message does not inflate recordSupport beyond +1", () => {
  // reveal>reveal appears twice in the same message; recordSupport must be 1, occurrenceCount 2.
  const data = [ann("A", [["reveal"], ["reveal"], ["reveal"]])];
  const t = discoverTransitions(data);
  const bg = t.bigrams.find((b) => b.key === "reveal>reveal");
  assert.equal(bg.recordSupport, 1);
  assert.equal(bg.occurrenceCount, 2);
});

test("confidenceWeightedSupport only counts STRONG-confidence steps", () => {
  const strong = [ann("A", [["reveal", "explicit"], ["self_devalue", "strongly_supported"]])];
  const weak = [ann("B", [["reveal", "weak_inference"], ["self_devalue", "unknown"]])];
  const ts = discoverTransitions(strong).bigrams.find((b) => b.key === "reveal>self_devalue");
  const tw = discoverTransitions(weak).bigrams.find((b) => b.key === "reveal>self_devalue");
  assert.equal(ts.confidenceWeightedSupport, 1);
  assert.equal(tw.confidenceWeightedSupport, 0);
});

test("single-action records produce no bigrams (recordsWithAnyBigram excludes them)", () => {
  const data = [ann("A", [["reveal"]]), ann("B", [["demand"]])];
  const t = discoverTransitions(data);
  assert.equal(t.recordsWithAnyBigram, 0);
  assert.equal(t.bigrams.length, 0);
});

test("trigrams require three contiguous actions", () => {
  const data = [ann("A", [["accuse"], ["escalate"], ["retract"]])];
  const t = discoverTransitions(data);
  assert.ok(t.trigrams.find((g) => g.key === "accuse>escalate>retract"));
});

// ===========================================================================
// 2. Reveal → mask dynamic (§10) — counterexamples are first-class
// ===========================================================================
test("mask counts ONLY when conceal directly follows a reveal", () => {
  const masked = discoverRevealMask([ann("A", [["reveal"], ["mask"]])]);
  assert.equal(masked.revealThenConcealRecords, 1);
});

test("reveal WITHOUT a following mask is recorded as a counterexample", () => {
  const rm = discoverRevealMask([ann("A", [["reveal"], ["demand"]])]);
  assert.equal(rm.revealBearingRecords, 1);
  assert.equal(rm.revealThenConcealRecords, 0);
  assert.equal(rm.revealWithoutMaskRecords.length, 1);
});

test("a conceal NOT immediately after a reveal does not count as a mask", () => {
  // reveal, demand, mask — mask is not directly after reveal
  const rm = discoverRevealMask([ann("A", [["reveal"], ["demand"], ["mask"]])]);
  assert.equal(rm.revealThenConcealRecords, 0);
});

// ===========================================================================
// 3. Driving-force → strategy tiers (§6/§7) — prior-only never enters primary
// ===========================================================================
test("record-specific STRONG driving force lands in tierA", () => {
  const data = [ann("A", [["reveal"]], {
    drivingForceCandidates: [{ candidate: "fear_of_abandonment", confidence: "strongly_supported", recordSpecificSupport: "strong", priorContribution: "moderate" }],
    interactionFunctions: { functions: [{ function: "obtain_specific_reassurance", role: "primary", confidence: "strongly_supported" }] },
  })];
  const d = discoverDrivingForceStrategy(data);
  assert.ok(d.tierA_recordSpecificStrong.some((c) => c.key.startsWith("fear_of_abandonment>")));
});

test("prior-only driving force (recordSpecificSupport none) never enters tierA", () => {
  const data = [ann("A", [["reveal"]], {
    drivingForceCandidates: [{ candidate: "fear_of_abandonment", confidence: "weak_inference", recordSpecificSupport: "none", priorContribution: "strong" }],
    interactionFunctions: { functions: [{ function: "obtain_specific_reassurance", role: "primary", confidence: "weak_inference" }] },
  })];
  const d = discoverDrivingForceStrategy(data);
  assert.equal(d.tierA_recordSpecificStrong.length, 0);
  assert.ok(d.exploratory_priorOrWeakOnly.some((c) => c.key.startsWith("fear_of_abandonment>")));
});

// ===========================================================================
// 4. Relationship operations (§11) — count-based, directional
// ===========================================================================
test("relationship operation frequency counts distinct records", () => {
  const mk = (id) => ann(id, [["demand"]], { relationshipManagement: { present: true, operations: ["test_bond"] } });
  const d = discoverRelationshipOperations([mk("A"), mk("B"), mk("C")]);
  const tb = d.operationFrequency.find((o) => o.key === "test_bond");
  assert.equal(tb.recordSupport, 3);
  assert.equal(d.relationshipManagementPresentRecords, 3);
});

// ===========================================================================
// 5. Intra-message momentum (§13/§14) — single-utterance arcs only
// ===========================================================================
test("multi-action record yields an arc; single-action does not", () => {
  const d = discoverIntraMessageMomentum([ann("A", [["accuse"], ["escalate"]]), ann("B", [["reveal"]])]);
  assert.equal(d.multiBeatRecords, 1);
  assert.equal(d.arcs.length, 1);
});

test("momentum note explicitly disclaims cross-turn grammar", () => {
  const d = discoverIntraMessageMomentum([ann("A", [["accuse"], ["escalate"]])]);
  assert.match(d.note, /NOT cross-turn/i);
});

// ===========================================================================
// 6. pilotRate — never a bare percentage
// ===========================================================================
test("pilotRate returns null rate and an anecdote note when eligible < 5", () => {
  const r = pilotRate(1, 2);
  assert.equal(r.status, PILOT_TAG);
  assert.match(r.uncertainty_note, /not interpretable|anecdote/i);
});

test("pilotRate returns null when eligible is 0", () => {
  assert.equal(pilotRate(0, 0).pilot_observed_rate, null);
});

// ===========================================================================
// 7. H1-H11 hypotheses — data-first, honest status vocabulary
// ===========================================================================
test("a hypothesis with too few eligible opportunities is insufficient_evidence, not a weak yes", () => {
  // only 1 record has a reveal-with-following-action → H2 eligible < MIN_ELIGIBLE
  const data = [ann("A", [["reveal"], ["self_devalue"]])];
  const d = runDiscovery(data);
  const h = evaluateGrammarHypotheses(data, d);
  const h2 = h.hypotheses.find((x) => x.id === "H2");
  assert.ok(h2.eligible_opportunity_count < MIN_ELIGIBLE);
  assert.equal(h2.status, GRAMMAR_HYP_STATUS.INSUFFICIENT);
});

test("no hypothesis status is ever the string 'supported' (only pilot gates exist)", () => {
  const data = Array.from({ length: 12 }, (_, i) => ann(`A${i}`, [["reveal"], ["self_devalue"]]));
  const d = runDiscovery(data);
  const h = evaluateGrammarHypotheses(data, d);
  for (const x of h.hypotheses) {
    assert.notEqual(x.status, "supported");
    assert.notEqual(x.status, "confirmed");
  }
});

test("H3 (reveal usually masked) is contradicted when masking is rare", () => {
  // 10 reveal records, none masked → low rate → contradicted (direction positive)
  const data = Array.from({ length: 10 }, (_, i) => ann(`R${i}`, [["reveal"], ["demand"]]));
  const d = runDiscovery(data);
  const h = evaluateGrammarHypotheses(data, d);
  const h3 = h.hypotheses.find((x) => x.id === "H3");
  assert.equal(h3.status, GRAMMAR_HYP_STATUS.CONTRADICTED);
});

test("H1 reaches preliminary_support when most multi-action records carry a bigram", () => {
  const data = Array.from({ length: 8 }, (_, i) => ann(`A${i}`, [["reveal"], ["self_devalue"]]));
  const d = runDiscovery(data);
  const h = evaluateGrammarHypotheses(data, d);
  const h1 = h.hypotheses.find((x) => x.id === "H1");
  assert.equal(h1.status, GRAMMAR_HYP_STATUS.PRELIMINARY_SUPPORT);
});

test("every hypothesis carries observed + eligible + counterexample counts", () => {
  const data = [ann("A", [["reveal"], ["self_devalue"]])];
  const h = evaluateGrammarHypotheses(data, runDiscovery(data));
  for (const x of h.hypotheses) {
    assert.equal(typeof x.observed_count, "number");
    assert.equal(typeof x.eligible_opportunity_count, "number");
    assert.equal(typeof x.counterexample_count, "number");
  }
});

// ===========================================================================
// 8. Churn detection (§19) — enum long-tail leak + sparse structure
// ===========================================================================
test("FALLBACK_OVERUSE fires when a catch-all enum covers >= threshold of records", () => {
  const data = Array.from({ length: 10 }, (_, i) =>
    ann(`A${i}`, [["demand"]], { triggerSensitivity: { domain: "other", observedTriggerIntensity: "low" } }));
  const c = detectChurn(data, vocab());
  const sig = c.signals.find((s) => s.code === CHURN_CODES.FALLBACK_OVERUSE && s.dimension === "triggerDomain");
  assert.ok(sig, "expected triggerDomain fallback overuse");
  assert.ok(sig.fraction >= FALLBACK_FRACTION);
});

test("DEAD_ENUM lists vocab values never used", () => {
  const data = [ann("A", [["reveal"]], { affect: { primarySurface: { value: "affection", confidence: "weak_inference" }, coexistenceType: "unknown" } })];
  const c = detectChurn(data, vocab());
  const dead = c.signals.find((s) => s.code === CHURN_CODES.DEAD_ENUM && s.dimension === "affectPrimarySurface");
  assert.ok(dead.unused.includes("desire"));
});

test("SPARSE_STRUCTURE fires when most records are single-action", () => {
  const data = Array.from({ length: 10 }, (_, i) => ann(`A${i}`, [["reveal"]]));
  const c = detectChurn(data, vocab());
  assert.ok(c.signals.some((s) => s.code === CHURN_CODES.SPARSE_STRUCTURE));
});

// ===========================================================================
// 9. PROCEED_TO_200 gate (§20)
// ===========================================================================
test("gate returns NEEDS_GUIDE_REVISION when a hard fallback signal is present but pipeline works", () => {
  const data = Array.from({ length: 12 }, (_, i) =>
    ann(`A${i}`, [["reveal"], ["self_devalue"]], { triggerSensitivity: { domain: "other", observedTriggerIntensity: "low" } }));
  const d = runDiscovery(data);
  const h = evaluateGrammarHypotheses(data, d);
  const c = detectChurn(data, vocab());
  const g = evaluateProceedGate({ discovery: d, hypotheses: h, churn: c });
  assert.equal(g.status, GATE_STATUS.NEEDS_GUIDE_REVISION);
});

test("gate returns FAILED when too few hypotheses are evaluable", () => {
  const data = [ann("A", [["reveal"]])]; // almost nothing eligible
  const d = runDiscovery(data);
  const h = evaluateGrammarHypotheses(data, d);
  const c = detectChurn(data, vocab());
  const g = evaluateProceedGate({ discovery: d, hypotheses: h, churn: c });
  assert.equal(g.status, GATE_STATUS.FAILED);
});

test("gate never claims the grammar is validated", () => {
  const data = Array.from({ length: 12 }, (_, i) => ann(`A${i}`, [["reveal"], ["self_devalue"]]));
  const g = evaluateProceedGate({ discovery: runDiscovery(data), hypotheses: evaluateGrammarHypotheses(data, runDiscovery(data)), churn: detectChurn(data, vocab()) });
  assert.ok(g.notes.some((n) => /does NOT mean the grammar is validated/i.test(n)));
});

// ===========================================================================
// 10. Candidate schema + validator (§16) — production_ready ban, rate rule
// ===========================================================================
test("a real discovery bundle validates against the candidate schema", () => {
  const data = Array.from({ length: 6 }, (_, i) => ann(`A${i}`, [["reveal"], ["self_devalue"]]));
  const res = validateGrammarCandidate(runDiscovery(data));
  assert.equal(res.valid, true, JSON.stringify(res.schemaErrors.concat(res.ruleErrors)));
});

test("the banned token 'production_ready' is rejected anywhere in the document", () => {
  const d = runDiscovery([ann("A", [["reveal"], ["self_devalue"]])]);
  d.transitions.note = `this is ${BANNED_TOKEN}`;
  const res = validateGrammarCandidate(d);
  assert.equal(res.valid, false);
  assert.ok(res.ruleErrors.some((e) => e.code === GRAMMAR_RULE_CODES.PRODUCTION_READY_BANNED));
});

test("pilot_observed_rate must be a number when eligible_opportunity_count > 0", () => {
  const d = runDiscovery([ann("A", [["reveal"], ["mask"]])]);
  d.revealMask.maskRate.eligible_opportunity_count = 10;
  d.revealMask.maskRate.pilot_observed_rate = null;
  const res = validateGrammarCandidate(d);
  assert.ok(res.ruleErrors.some((e) => e.code === GRAMMAR_RULE_CODES.RATE_NULL_WITH_OPPORTUNITY));
});

test("pilot_observed_rate must be null when eligible_opportunity_count is 0", () => {
  const d = runDiscovery([ann("A", [["reveal"], ["mask"]])]);
  d.revealMask.maskRate.eligible_opportunity_count = 0;
  d.revealMask.maskRate.pilot_observed_rate = 0.5;
  const res = validateGrammarCandidate(d);
  assert.ok(res.ruleErrors.some((e) => e.code === GRAMMAR_RULE_CODES.RATE_NUMBER_WITHOUT_OPPORTUNITY));
});

// ===========================================================================
// 11. Determinism — the whole pipeline is byte-identical run to run
// ===========================================================================
test("runDiscovery output is byte-identical across two runs (deterministic)", () => {
  const data = Array.from({ length: 10 }, (_, i) => ann(`A${i}`, [["reveal"], ["self_devalue"], ["demand"]]));
  const a = JSON.stringify(runDiscovery(data));
  const b = JSON.stringify(runDiscovery(data.slice().reverse()));
  // reversing input must not change output (sorted emission), so both serialize identically
  assert.equal(a, b);
});

test("discovery output carries the PILOT_ESTIMATE tag at the top level and in every section", () => {
  const d = runDiscovery([ann("A", [["reveal"], ["self_devalue"]])]);
  assert.equal(d.status, PILOT_TAG);
  for (const section of ["transitions", "drivingForceStrategy", "affectStrategy", "triggerSensitivity", "revealMask", "relationshipOperations", "partnerOperations", "performancePatterns", "intraMessageMomentum"]) {
    assert.equal(d[section].status, PILOT_TAG, `${section} missing PILOT_ESTIMATE`);
  }
});

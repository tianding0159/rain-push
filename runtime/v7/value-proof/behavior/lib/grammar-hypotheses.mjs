// P1-1B Behavior-Grammar hypotheses H1-H11 (Layer B), evaluated DATA-FIRST.
//
// Discipline (directive §15/§18):
//   - Compute the observed/eligible counts FIRST from the discovery bundle, THEN map to a status by
//     a fixed rule. The evaluator never starts from "the grammar says X" and looks for confirmation.
//   - The status vocabulary deliberately has NO "supported" / "confirmed" terminal. At n=50 the best
//     any pattern earns is `preliminary_support` — "worth testing at larger n", not "true".
//   - Every result carries observed_count + eligible_opportunity_count + the counterexample count, so
//     a reviewer can overturn any call by recomputation.
//   - A hypothesis with < MIN_ELIGIBLE eligible opportunities is `insufficient_evidence`, never a
//     weak yes/no dressed up as a finding.
//
// These H1-H11 are GRAMMAR-STRUCTURE hypotheses (transitions, couplings, arcs). They are distinct
// from hypotheses.mjs H1-H7, which are the value-proof character-claim hypotheses.

export const GRAMMAR_HYPOTHESES = Object.freeze({
  H1: "behavior actions chain into recurring intra-message transitions (a grammar exists at all)",
  H2: "reveal is frequently followed by self-devaluation within the same message",
  H3: "a reveal is usually masked/retracted right after it (defensive concealment)",
  H4: "fear-of-abandonment couples to reassurance-seeking strategies (driver→strategy grammar)",
  H5: "a low observed trigger co-occurs with high inferred activation (hair-trigger sensitivity)",
  H6: "single-valence affect dominates; mixed simultaneous affect is rare",
  H7: "test_bond is the most frequent relationship operation",
  H8: "utterances are designed to elicit a specific partner operation (expected-reply grammar)",
  H9: "multi-beat messages carry an escalation arc more often than not",
  H10: "confident self-presentation precedes vulnerability reveal (perform→reveal)",
  H11: "most records are single-action, so cross-action grammar is sparse at this n (a limitation, stated as a hypothesis to test)",
});

export const GRAMMAR_HYP_STATUS = Object.freeze({
  PRELIMINARY_SUPPORT: "preliminary_support",
  MIXED: "mixed",
  WEAK_SUPPORT: "weak_support",
  INSUFFICIENT: "insufficient_evidence",
  CONTRADICTED: "contradicted",
});

// n=50 pilot thresholds. Intentionally conservative — these gate "worth testing later", not truth.
export const MIN_ELIGIBLE = 5; // below this the rate is anecdote, not a signal
const PRELIM_RATE = 0.5; // >= half of eligible opportunities → preliminary_support
const WEAK_RATE = 0.2; // >= a fifth → weak_support
const CONTRA_RATE = 0.1; // <= a tenth (with enough eligible) → contradicted

// Map an observed/eligible pair to an honest status. `direction` = "positive" means a HIGH rate
// supports the hypothesis; "negative" means a LOW rate supports it (used by H3/H11-style claims).
function statusFor(observed, eligible, direction = "positive") {
  if (eligible < MIN_ELIGIBLE) return GRAMMAR_HYP_STATUS.INSUFFICIENT;
  const rate = observed / eligible;
  if (direction === "negative") {
    // hypothesis predicts the phenomenon is RARE
    if (rate <= CONTRA_RATE) return GRAMMAR_HYP_STATUS.PRELIMINARY_SUPPORT;
    if (rate < WEAK_RATE) return GRAMMAR_HYP_STATUS.WEAK_SUPPORT;
    if (rate >= PRELIM_RATE) return GRAMMAR_HYP_STATUS.CONTRADICTED;
    return GRAMMAR_HYP_STATUS.MIXED;
  }
  if (rate >= PRELIM_RATE) return GRAMMAR_HYP_STATUS.PRELIMINARY_SUPPORT;
  if (rate >= WEAK_RATE) return GRAMMAR_HYP_STATUS.WEAK_SUPPORT;
  if (rate <= CONTRA_RATE) return GRAMMAR_HYP_STATUS.CONTRADICTED;
  return GRAMMAR_HYP_STATUS.MIXED;
}

function result(id, observed, eligible, counterexamples, direction, note) {
  return {
    id,
    claim: GRAMMAR_HYPOTHESES[id],
    observed_count: observed,
    eligible_opportunity_count: eligible,
    counterexample_count: counterexamples,
    pilot_observed_rate: eligible > 0 ? Math.round((observed / eligible) * 1000) / 1000 : null,
    status: statusFor(observed, eligible, direction),
    direction,
    note,
  };
}

// Count records whose action sequence contains a given ordered bigram at least once.
function recordsWithBigram(annotations, a, b) {
  let n = 0;
  for (const ann of annotations) {
    const acts = orderedActionList(ann);
    for (let i = 0; i + 1 < acts.length; i++) {
      if (acts[i] === a && acts[i + 1] === b) { n++; break; }
    }
  }
  return n;
}

function seqLen(ann) {
  return (ann.behaviorActionSequence || []).length;
}

// Ordered action list (sorted by `order`, mirroring the discovery library).
function orderedActionList(ann) {
  return (ann.behaviorActionSequence || [])
    .slice()
    .sort((x, y) => (x.order || 0) - (y.order || 0))
    .map((s) => s.action);
}

export function evaluateGrammarHypotheses(annotations, discovery) {
  const N = annotations.length;
  const multiActionRecords = annotations.filter((a) => seqLen(a) >= 2).length;
  const out = [];

  // H1: a grammar exists — do recurring transitions appear across records?
  // observed = records that carry ANY bigram; eligible = records that COULD (>=2 actions).
  {
    const observed = discovery.transitions.recordsWithAnyBigram;
    const eligible = multiActionRecords;
    out.push(result("H1", observed, eligible, eligible - observed, "positive",
      "Eligible = records with >=2 actions. Sparse eligibility itself is the H11 caveat."));
  }

  // H2: reveal → self_devalue. eligible = records containing a reveal that is not the last action.
  {
    let eligible = 0;
    for (const ann of annotations) {
      const acts = orderedActionList(ann);
      const idx = acts.indexOf("reveal");
      if (idx >= 0 && idx < acts.length - 1) eligible++;
    }
    const observed = recordsWithBigram(annotations, "reveal", "self_devalue");
    out.push(result("H2", observed, eligible, eligible - observed, "positive",
      "Eligible = records where a reveal has a following action."));
  }

  // H3: reveal usually masked right after. eligible = reveal-bearing records; observed = masked.
  // Direction NEGATIVE would be "masking is rare"; the hypothesis as stated predicts it is COMMON,
  // so direction is positive and a low rate CONTRADICTS it.
  {
    const eligible = discovery.revealMask.revealBearingRecords;
    const observed = discovery.revealMask.revealThenConcealRecords;
    out.push(result("H3", observed, eligible, eligible - observed, "positive",
      "Counterexamples = reveal-without-mask records, reported explicitly to block an overclaim."));
  }

  // H4: fear_of_abandonment → reassurance-seeking. eligible = records naming fear_of_abandonment as
  // a driving force with record-specific (A) evidence; observed = those coupling to a reassurance
  // strategy in tierA/tierB.
  {
    let eligible = 0;
    for (const ann of annotations) {
      for (const df of ann.drivingForceCandidates || []) {
        if (df.candidate === "fear_of_abandonment" && (df.recordSpecificSupport === "strong" || df.recordSpecificSupport === "moderate")) { eligible++; break; }
      }
    }
    const couplings = [...discovery.drivingForceStrategy.tierA_recordSpecificStrong, ...discovery.drivingForceStrategy.tierB_recordSpecificModerate];
    const observed = couplings
      .filter((c) => c.key.startsWith("fear_of_abandonment>") && /reassur|future_bond|repair/.test(c.key))
      .reduce((s, c) => s + c.recordSupport, 0);
    out.push(result("H4", Math.min(observed, eligible), eligible, Math.max(eligible - observed, 0), "positive",
      "Eligible = records with A-grade fear_of_abandonment; tierA+tierB reassurance couplings counted."));
  }

  // H5: low trigger + high activation (hair-trigger). eligible = records with an OBSERVED trigger
  // intensity that is low/minimal; observed = those with high inferred activation.
  {
    let eligible = 0;
    for (const ann of annotations) {
      const ti = ann.triggerSensitivity?.observedTriggerIntensity;
      if (ti === "low" || ti === "minimal") eligible++;
    }
    const observed = discovery.triggerSensitivity.domains.reduce((s, d) => s + d.lowTriggerHighActivationSupport, 0);
    out.push(result("H5", Math.min(observed, eligible), eligible, Math.max(eligible - observed, 0), "positive",
      "Eligible = low/minimal observed trigger; observed = those also high inferred activation."));
  }

  // H6: single-valence dominates; simultaneous mixed affect is rare. Direction NEGATIVE (rare = support).
  // eligible = all records with a known coexistence type; observed = simultaneous.
  {
    let eligible = 0, observed = 0;
    for (const ann of annotations) {
      const c = ann.affect?.coexistenceType;
      if (c && c !== "unknown") { eligible++; if (c === "simultaneous") observed++; }
    }
    out.push(result("H6", observed, eligible, eligible - observed, "negative",
      "Eligible = records with a known coexistence type; 'unknown' excluded (not evidence of rarity)."));
  }

  // H7: test_bond is the top relationship operation. eligible = records doing relationship mgmt;
  // observed = records whose operations include test_bond.
  {
    const eligible = discovery.relationshipOperations.relationshipManagementPresentRecords;
    const tb = discovery.relationshipOperations.operationFrequency.find((o) => o.key === "test_bond");
    const observed = tb ? tb.recordSupport : 0;
    const topKey = discovery.relationshipOperations.operationFrequency[0]?.key;
    out.push(result("H7", observed, eligible, eligible - observed, "positive",
      `Top operation observed = ${topKey || "none"}. H7 asks whether test_bond leads.`));
  }

  // H8: designed to elicit a specific partner operation. eligible = records with a known immediate
  // expectedReply class; observed = same (every such record encodes an expected operation).
  {
    let eligible = 0, observed = 0;
    for (const ann of annotations) {
      const cls = ann.expectedReply?.immediateReply?.classes || [];
      const conf = ann.expectedReply?.immediateReply?.confidence;
      if (cls.length > 0 && conf && conf !== "unknown") { eligible++; observed++; }
    }
    out.push(result("H8", observed, Math.max(eligible, N), N - observed, "positive",
      "Eligible = all records; observed = records with a confident immediate expected-reply class."));
  }

  // H9: multi-beat messages carry an escalation arc more often than not. eligible = multi-beat arcs;
  // observed = arcs with >=1 escalation point.
  {
    const eligible = discovery.intraMessageMomentum.multiBeatRecords;
    const observed = discovery.intraMessageMomentum.arcs.filter((a) => (a.escalationPoints || 0) > 0).length;
    out.push(result("H9", observed, eligible, eligible - observed, "positive",
      "Eligible = multi-beat (>=2 action) records; observed = those with an escalation step."));
  }

  // H10: perform_confidence → reveal. eligible = records containing perform_confidence not last.
  {
    let eligible = 0;
    for (const ann of annotations) {
      const acts = orderedActionList(ann);
      const idx = acts.indexOf("perform_confidence");
      if (idx >= 0 && idx < acts.length - 1) eligible++;
    }
    const observed = recordsWithBigram(annotations, "perform_confidence", "reveal");
    out.push(result("H10", observed, eligible, eligible - observed, "positive",
      "Eligible = records where perform_confidence has a following action."));
  }

  // H11: cross-action grammar is sparse at this n (single-action records dominate). This is a
  // LIMITATION hypothesis: observed = single-action records, eligible = all records; a HIGH rate
  // supports the sparsity claim (direction positive), and confirming it caps how strong H1-H10 can be.
  {
    const observed = annotations.filter((a) => seqLen(a) === 1).length;
    const eligible = N;
    out.push(result("H11", observed, eligible, eligible - observed, "positive",
      "Sparsity is a finding: if most records are single-action, transition grammar needs more data."));
  }

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    n: N,
    thresholds: { MIN_ELIGIBLE, PRELIM_RATE, WEAK_RATE, CONTRA_RATE },
    note: "Statuses are pilot gates ('worth testing at larger n'), NOT truth claims. No 'supported' terminal exists.",
    hypotheses: out,
  };
}

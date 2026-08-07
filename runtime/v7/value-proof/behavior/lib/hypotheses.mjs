// Hypotheses H1-H7 evaluator (directive §13).
//
// Each hypothesis is scored ONLY from graded evidence (annotations + validated patterns), never
// from prior design intent. A hypothesis with too little evidence is `not_evaluable` — never
// silently `supported`. This mirrors the value-proof harness's NOT_EVALUABLE honesty gate.
//
// Inputs are redacted annotations (hash-keyed, no text) and validated patterns. Each evaluator
// counts supporting vs counterexample records using ONLY A_explicit / B_context_strong affect
// evidence (C_designed_inference is excluded from statistics, §6).

export const HYPOTHESES = Object.freeze({
  H1: "confirmation/attention/availability need recurs across many surface emotions",
  H2: "shame sometimes masks as attack/joke/bold-escalation rather than withdrawal",
  H3: "direct requests are often converted to command/accusation/test/spectacle",
  H4: "surface push-away co-occurs with functional pursuit-seeking",
  H5: "Ame vs KAngel differ in interaction goal / audience / vulnerability visibility, not only wording",
  H6: "dark/drug/adult/manic expression is not automatically a severe state",
  H7: "strong possessiveness can coexist with preserving the other's free choice",
});

export const HYP_RESULT = Object.freeze({
  SUPPORTED: "supported",
  PARTIAL: "partially_supported",
  UNSUPPORTED: "unsupported",
  NOT_EVALUABLE: "not_evaluable",
});

const MIN_SAMPLES_EVALUABLE = 5;   // below this → not_evaluable
const SUPPORT_RATIO_STRONG = 0.6;  // support / (support+counter) for "supported"
const SUPPORT_RATIO_WEAK = 0.3;    // above weak but below strong → partially_supported

function evidentialAffect(ann) {
  const c = ann.affect?.concurrencyClass;
  return c === "A_explicit" || c === "B_context_strong";
}

// §6: C_designed_inference is a design goal, NOT observed evidence — it must never enter any
// hypothesis statistic. Affect-dependent hypotheses (H2/H4/H7) additionally require A/B via
// evidentialAffect(); need/function-based hypotheses (H1/H3/H5/H6) at minimum drop C here so a
// design goal can't launder itself into "canon evidence."
function inStats(ann) {
  return ann.affect?.concurrencyClass !== "C_designed_inference";
}

function needsSet(ann) { return new Set((ann.l3?.candidates || []).map((c) => c.need)); }
function atomsSet(ann) { return new Set(ann.l1?.behaviorAtoms || []); }
function functionsSet(ann) { return new Set(ann.l2?.functions || []); }

// Generic scorer: given predicates for support/counter, count and classify.
function score(annotations, isSupport, isCounter) {
  let support = 0;
  let counter = 0;
  const supportHashes = [];
  for (const a of annotations) {
    if (isSupport(a)) { support += 1; supportHashes.push(a.recordHash); }
    else if (isCounter && isCounter(a)) counter += 1;
  }
  const total = support + counter;
  let result;
  if (total < MIN_SAMPLES_EVALUABLE) result = HYP_RESULT.NOT_EVALUABLE;
  else {
    const ratio = support / total;
    if (ratio >= SUPPORT_RATIO_STRONG) result = HYP_RESULT.SUPPORTED;
    else if (ratio >= SUPPORT_RATIO_WEAK) result = HYP_RESULT.PARTIAL;
    else result = HYP_RESULT.UNSUPPORTED;
  }
  return {
    result,
    sampleCount: total,
    supportCount: support,
    counterexampleCount: counter,
    confidence: total < MIN_SAMPLES_EVALUABLE ? 0 : round(support / total),
    supportingHashes: supportHashes.slice().sort(),
  };
}

function round(x) { return Math.round(x * 1000) / 1000; }

const ATTENTION_NEEDS = new Set(["recognition", "attunement", "exclusive_attention", "reassurance", "admiration", "desire_confirmation"]);
const MASK_ATOMS = new Set(["insult_playfully", "tease", "accuse", "escalate", "perform_confidence"]);
const CONVERT_ATOMS = new Set(["demand", "accuse", "test", "perform_confidence"]);

export function evaluateHypotheses(annotations, patterns = []) {
  // §6 baseline: drop C_designed_inference from EVERY hypothesis statistic.
  const stat = annotations.filter(inStats);
  // Affect-dependent hypotheses need the stricter A/B evidence (which also excludes C).
  const evid = annotations.filter(evidentialAffect);

  const H1 = score(stat,
    (a) => [...needsSet(a)].some((n) => ATTENTION_NEEDS.has(n)),
    (a) => needsSet(a).size > 0 && ![...needsSet(a)].some((n) => ATTENTION_NEEDS.has(n)));

  const H2 = score(evid,
    (a) => (a.affect?.masked === "shame" || a.affect?.opposing === "shame")
      && [...atomsSet(a)].some((x) => MASK_ATOMS.has(x)),
    (a) => (a.affect?.masked === "shame" || a.affect?.opposing === "shame")
      && atomsSet(a).has("withdraw"));

  const H3 = score(stat,
    (a) => a.expectedReply?.literalRequest !== true && [...atomsSet(a)].some((x) => CONVERT_ATOMS.has(x)),
    (a) => a.expectedReply?.literalRequest === true && atomsSet(a).has("request_practical_action"));

  const H4 = score(evid,
    (a) => atomsSet(a).has("withdraw") && (functionsSet(a).has("provoke_pursuit") || functionsSet(a).has("test_availability")),
    (a) => atomsSet(a).has("withdraw") && functionsSet(a).has("establish_boundary"));

  // H5 needs persona-surface signal; single-sided data with one speaker rarely distinguishes
  // Ame vs KAngel without a surface tag → typically not_evaluable in the pilot.
  const H5 = score(stat,
    (a) => a.l1?.attentionTarget === "audience" && functionsSet(a).has("maintain_performance"),
    (a) => a.l1?.attentionTarget === "partner" && functionsSet(a).has("intensify_intimacy"));

  const H6 = score(stat,
    (a) => functionsSet(a).has("discharge_overload") || functionsSet(a).has("maintain_performance") || functionsSet(a).has("intensify_intimacy"),
    (a) => a.l1?.behaviorAtoms?.includes("threaten_symbolically") && functionsSet(a).has("punish_perceived_neglect"));

  const H7 = score(evid,
    (a) => functionsSet(a).has("demand_reciprocation") || needsSet(a).has("exclusive_attention"),
    (a) => needsSet(a).has("autonomy") && functionsSet(a).has("establish_boundary"));

  return {
    H1: { statement: HYPOTHESES.H1, ...H1, limitations: "attention-need proxy from L3 needs" },
    H2: { statement: HYPOTHESES.H2, ...H2, limitations: "requires A/B affect + shame tag" },
    H3: { statement: HYPOTHESES.H3, ...H3, limitations: "literalRequest flag proxy" },
    H4: { statement: HYPOTHESES.H4, ...H4, limitations: "requires A/B affect" },
    H5: { statement: HYPOTHESES.H5, ...H5, limitations: "no persona surface tag in single-sided pilot" },
    H6: { statement: HYPOTHESES.H6, ...H6, limitations: "function-of-dark-surface proxy" },
    H7: { statement: HYPOTHESES.H7, ...H7, limitations: "requires A/B affect" },
  };
}

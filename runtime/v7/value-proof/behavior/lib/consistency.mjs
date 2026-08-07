// Inter-round annotation consistency + §14 quality gates.
//
// Given round-1 and round-2 annotations keyed by recordHash, computes per-field agreement and
// checks it against the pilot gates. Agreement for set-valued fields (arrays) is Jaccard;
// for scalars it is exact match. All inputs are redacted annotations (hash-keyed, no text).

// §14 pilot gates (agreement thresholds).
export const PILOT_GATES = Object.freeze({
  observableActs: 0.90,       // l1.behaviorAtoms
  interactionFunction: 0.80,  // l2.functions
  expectedReplyClass: 0.80,   // expectedReply.functionalExpectedReply
  latentNeedCandidate: 0.70,  // l3 needs (set)
  evidenceGradeField: 0.85,   // primary evidence grade proxy: affect.concurrencyClass presence
});

function jaccard(a = [], b = []) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : inter / union;
}

function needsSet(ann) {
  return (ann.l3?.candidates || []).map((c) => c.need);
}

// Compare two annotations of the same record. Returns per-field agreement in [0,1].
export function compareAnnotationPair(a, b) {
  return {
    observableActs: jaccard(a.l1?.behaviorAtoms, b.l1?.behaviorAtoms),
    interactionFunction: jaccard(a.l2?.functions, b.l2?.functions),
    expectedReplyClass: jaccard(a.expectedReply?.functionalExpectedReply, b.expectedReply?.functionalExpectedReply),
    latentNeedCandidate: jaccard(needsSet(a), needsSet(b)),
    // evidence-grade proxy: do both rounds agree on whether affect is evidential (A/B) vs not?
    evidenceGradeField: (isEvidentialAffect(a) === isEvidentialAffect(b)) ? 1 : 0,
  };
}

function isEvidentialAffect(ann) {
  const c = ann.affect?.concurrencyClass;
  return c === "A_explicit" || c === "B_context_strong";
}

function round(x) { return Math.round(x * 1000) / 1000; }

// Aggregate agreement across all paired records + gate verdict.
export function consistencyReport(round1, round2) {
  const r1 = new Map(round1.map((a) => [a.recordHash, a]));
  const r2 = new Map(round2.map((a) => [a.recordHash, a]));
  const commonHashes = [...r1.keys()].filter((h) => r2.has(h)).sort();

  const fields = Object.keys(PILOT_GATES);
  const sums = Object.fromEntries(fields.map((f) => [f, 0]));
  for (const h of commonHashes) {
    const cmp = compareAnnotationPair(r1.get(h), r2.get(h));
    for (const f of fields) sums[f] += cmp[f];
  }
  const n = commonHashes.length || 1;
  const agreement = Object.fromEntries(fields.map((f) => [f, round(sums[f] / n)]));

  const gateResults = {};
  let allPass = true;
  for (const f of fields) {
    const pass = agreement[f] >= PILOT_GATES[f];
    gateResults[f] = { agreement: agreement[f], threshold: PILOT_GATES[f], pass };
    if (!pass) allPass = false;
  }

  return {
    pairedRecords: commonHashes.length,
    round1Only: round1.length - commonHashes.length,
    round2Only: round2.length - commonHashes.length,
    agreement,
    gates: gateResults,
    allGatesPass: allPass,
    verdict: allPass ? "PILOT_GATES_PASS" : "PILOT_GATES_FAIL",
  };
}

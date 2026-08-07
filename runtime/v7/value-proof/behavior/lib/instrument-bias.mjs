// P1-1D — Annotation Instrument Bias Audit.
//
// RESEARCH OBJECT = the annotation instrument, NOT the character. We treat the heuristic annotator
// (Instrument B) as a MEASUREMENT DEVICE and ask: what does it systematically mis-measure?
//
// EXPERIMENTAL DESIGN (the whole reason this audit is possible): the 50 pilot records were annotated by
// hand (Instrument A). Instrument B is deterministic code that consumes the same raw `text`. So we run B
// on the exact 50 records A annotated and treat A as the REFERENCE. Every A↔B disagreement on the same
// input is a measured instrument effect — it cannot be a character difference, because the character
// (the text) is held constant. This is the only clean separation of instrument from character available
// without new human annotation, which the directive forbids.
//
// A is not "ground truth" in an absolute sense (it is one human pass), but it is the reference the
// downstream grammar was built on, so "how far does B drift from A" is exactly the quantity that decides
// whether B-annotated records can be pooled with A-annotated records for grammar discovery.

import { annotateRecord } from "./heuristic-annotator.mjs";

// ---- field accessors, tolerant to both A and B shapes -------------------------------------------
const actionsOf = (r) => (r.behaviorActionSequence || []).map((s) => s.action).filter(Boolean);
const functionsOf = (r) => (r.interactionFunctions?.functions || []).map((f) => (typeof f === "string" ? f : f.function)).filter(Boolean);
const drivingOf = (r) => (r.drivingForceCandidates || []).map((c) => (typeof c === "string" ? c : c.candidate)).filter(Boolean);
const triggerDomainOf = (r) => r.triggerSensitivity?.domain || "unknown";
const triggerConfOf = (r) => r.triggerSensitivity?.confidence || "unknown";
const maskOf = (r) => !!r.maskAnalysis?.functionalMask;
const revealBearing = (r) => actionsOf(r).includes("reveal") || actionsOf(r).includes("self_devalue");
const relPresentOf = (r) => !!r.relationshipManagement?.present;
const relOpsOf = (r) => (r.relationshipManagement?.operations || []).filter(Boolean);
const metaTagsOf = (r) => (r.metaSelfMonitoring?.tags || []).filter(Boolean);
const expectedOf = (r) => (r.expectedReply?.immediateReply?.classes || []).filter((c) => c && c !== "unknown");
const affectValOf = (r) => r.affect?.primarySurface?.value || "unknown";
const affectWeakOf = (r) => r.affect?.primarySurface?.confidence === "weak_inference";
const performBearing = (r) => actionsOf(r).includes("perform_confidence") || functionsOf(r).includes("perform_confidence");
const textLen = (r) => [...(r.text || "")].length;
const idOf = (r) => r.presentationId || r.linkId;

const ESCAPE_DOMAINS = new Set(["other", "indeterminate"]);

// Pair each reference record with Instrument B run on the same text.
export function pairAll(referenceRecords) {
  return referenceRecords.map((a) => ({ id: idOf(a), a, b: annotateRecord(a) }));
}

// ---- primitive multiset diff -------------------------------------------------------------------
function multisetDiff(aArr, bArr) {
  const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(aArr);
  const cb = count(bArr);
  const keys = new Set([...ca.keys(), ...cb.keys()]);
  let missed = 0; // in A, not covered by B (false negative of B)
  let added = 0;  // in B, not in A (false positive of B)
  const perKeyMissed = new Map();
  const perKeyAdded = new Map();
  for (const k of keys) {
    const d = (ca.get(k) || 0) - (cb.get(k) || 0);
    if (d > 0) { missed += d; perKeyMissed.set(k, d); }
    else if (d < 0) { added += -d; perKeyAdded.set(k, -d); }
  }
  return { missed, added, perKeyMissed, perKeyAdded };
}

function topMap(map, k = 12) {
  return [...map.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, k).map(([key, count]) => ({ key, count }));
}
const r3 = (n) => Math.round(n * 1000) / 1000;

// ================================================================================================
// §3 — action bias: under/over-detection + confused pairs.
// A confused pair = within one record, A has action X that B lacks AND B has action Y that A lacks;
// (X→Y) is a candidate confusion (B saw the utterance as Y where A saw X).
// ================================================================================================
export function actionBias(pairs) {
  let aTotal = 0, bTotal = 0, missed = 0, added = 0;
  const underByAction = new Map();
  const overByAction = new Map();
  const confusion = new Map(); // "X=>Y" -> count
  let underSegRecords = 0; // A had >=2 actions, B collapsed to fewer

  for (const { a, b } of pairs) {
    const aa = actionsOf(a), bb = actionsOf(b);
    aTotal += aa.length; bTotal += bb.length;
    const d = multisetDiff(aa, bb);
    missed += d.missed; added += d.added;
    for (const [k, v] of d.perKeyMissed) underByAction.set(k, (underByAction.get(k) || 0) + v);
    for (const [k, v] of d.perKeyAdded) overByAction.set(k, (overByAction.get(k) || 0) + v);
    if (aa.length >= 2 && bb.length < aa.length) underSegRecords++;
    const misses = [...d.perKeyMissed.keys()];
    const adds = [...d.perKeyAdded.keys()];
    for (const x of misses) for (const y of adds) confusion.set(`${x}=>${y}`, (confusion.get(`${x}=>${y}`) || 0) + 1);
  }
  return {
    aActionTotal: aTotal, bActionTotal: bTotal,
    netDetectionRatio: r3(bTotal / (aTotal || 1)),
    underDetectedTotal: missed, overDetectedTotal: added,
    underSegmentationRecords: underSegRecords,
    topUnderDetectedActions: topMap(underByAction),
    topOverDetectedActions: topMap(overByAction),
    topConfusedActionPairs: topMap(confusion),
  };
}

// ================================================================================================
// §4 — trigger bias: confusion matrix (A domain -> B domain) + fallback-to-other rate.
// ================================================================================================
export function triggerBias(pairs) {
  const matrix = new Map(); // "Adomain=>Bdomain" -> count
  let aEscape = 0, bEscape = 0, disagree = 0;
  for (const { a, b } of pairs) {
    const ad = triggerDomainOf(a), bd = triggerDomainOf(b);
    matrix.set(`${ad}=>${bd}`, (matrix.get(`${ad}=>${bd}`) || 0) + 1);
    if (ESCAPE_DOMAINS.has(ad)) aEscape++;
    if (ESCAPE_DOMAINS.has(bd)) bEscape++;
    if (ad !== bd) disagree++;
  }
  const offDiagonal = [...matrix.entries()].filter(([k]) => { const [x, y] = k.split("=>"); return x !== y; });
  return {
    n: pairs.length,
    aEscapeToOther: aEscape, bEscapeToOther: bEscape,
    domainDisagreements: disagree,
    domainAgreementRate: r3((pairs.length - disagree) / (pairs.length || 1)),
    topConfusions: topMap(new Map(offDiagonal)),
  };
}

// ================================================================================================
// §5 — mask bias: A is reference. Among reveal-bearing records:
//   FN = A mask true, B mask false (B missed a real mask)
//   FP = A mask false, B mask true (B invented a mask)
//   ambiguous = reveal-bearing in A but B didn't even see the reveal (can't judge mask)
// ================================================================================================
export function maskBias(pairs) {
  let revealA = 0, fn = 0, fp = 0, agree = 0, ambiguous = 0;
  const fnIds = [], fpIds = [], ambiguousIds = [];
  for (const { id, a, b } of pairs) {
    if (!revealBearing(a)) continue;
    revealA++;
    if (!revealBearing(b)) { ambiguous++; ambiguousIds.push(id); continue; }
    const ma = maskOf(a), mb = maskOf(b);
    if (ma && !mb) { fn++; fnIds.push(id); }
    else if (!ma && mb) { fp++; fpIds.push(id); }
    else agree++;
  }
  return {
    revealBearingInReference: revealA,
    falseNegatives: fn, falsePositives: fp, agreements: agree, ambiguousUnjudgeable: ambiguous,
    fnRateAmongReferenceReveals: r3(fn / (revealA || 1)),
    revealSurvivalRate: r3((revealA - ambiguous) / (revealA || 1)), // fraction where B even kept the reveal
    fnIds, fpIds, ambiguousIds,
  };
}

// ================================================================================================
// §6 — long-message bias: does B drop proportionally more as text grows?
// Buckets by char length; report mean action/function counts per bucket for A and B.
// ================================================================================================
export function longMessageBias(pairs) {
  const bounds = [0, 15, 30, 60, 1e9];
  const labels = ["0-14", "15-29", "30-59", "60+"];
  const buckets = labels.map(() => ({ n: 0, aAct: 0, bAct: 0, aFn: 0, bFn: 0 }));
  for (const { a, b } of pairs) {
    const L = textLen(a);
    let bi = bounds.findIndex((_, i) => L >= bounds[i] && L < bounds[i + 1]);
    if (bi < 0) bi = labels.length - 1;
    const bk = buckets[bi];
    bk.n++; bk.aAct += actionsOf(a).length; bk.bAct += actionsOf(b).length;
    bk.aFn += functionsOf(a).length; bk.bFn += functionsOf(b).length;
  }
  const rows = buckets.map((bk, i) => ({
    lengthBucket: labels[i], n: bk.n,
    meanActionsA: r3(bk.aAct / (bk.n || 1)), meanActionsB: r3(bk.bAct / (bk.n || 1)),
    meanFunctionsA: r3(bk.aFn / (bk.n || 1)), meanFunctionsB: r3(bk.bFn / (bk.n || 1)),
    actionRetention: r3(bk.bAct / (bk.aAct || 1)),
  }));
  // is retention monotonically decreasing with length? (systematic long-message drop)
  const ret = rows.filter((r) => r.n > 0).map((r) => r.actionRetention);
  let monotoneDrop = true;
  for (let i = 1; i < ret.length; i++) if (ret[i] > ret[i - 1] + 0.05) monotoneDrop = false;
  return { rows, actionRetentionDropsWithLength: monotoneDrop };
}

// ================================================================================================
// Generic layer under/over detection — feeds §2 taxonomy + §7 heatmap.
// Returns { aTotal, bTotal, retention } for a chosen accessor.
// ================================================================================================
function layerCoverage(pairs, accessor) {
  let a = 0, b = 0, recordsBmissedAll = 0;
  for (const { a: ra, b: rb } of pairs) {
    const av = accessor(ra).length ?? 0;
    const bv = accessor(rb).length ?? 0;
    a += av; b += bv;
    if (av > 0 && bv === 0) recordsBmissedAll++;
  }
  return { aTotal: a, bTotal: b, retention: r3(b / (a || 1)), recordsFullyCollapsed: recordsBmissedAll };
}

export function layerCoverages(pairs) {
  const boolCount = (fn) => (r) => (fn(r) ? [1] : []);
  return {
    actions: layerCoverage(pairs, actionsOf),
    interactionFunctions: layerCoverage(pairs, functionsOf),
    drivingForce: layerCoverage(pairs, drivingOf),
    relationshipOps: layerCoverage(pairs, relOpsOf),
    relationshipPresent: layerCoverage(pairs, boolCount(relPresentOf)),
    metaSelfMonitoring: layerCoverage(pairs, metaTagsOf),
    expectedPartner: layerCoverage(pairs, expectedOf),
    functionalMask: layerCoverage(pairs, boolCount(maskOf)),
    performance: layerCoverage(pairs, boolCount(performBearing)),
  };
}

// weak-inference + prior signals (for taxonomy: weak-inference inflation, prior leakage)
export function inferenceQualityDelta(pairs) {
  let aWeakT = 0, bWeakT = 0, aWeakAff = 0, bWeakAff = 0;
  for (const { a, b } of pairs) {
    if (triggerConfOf(a) === "weak_inference") aWeakT++;
    if (triggerConfOf(b) === "weak_inference") bWeakT++;
    if (affectWeakOf(a)) aWeakAff++;
    if (affectWeakOf(b)) bWeakAff++;
  }
  return {
    triggerWeakInferenceA: aWeakT, triggerWeakInferenceB: bWeakT,
    affectWeakInferenceA: aWeakAff, affectWeakInferenceB: bWeakAff,
    triggerWeakInflation: r3((bWeakT - aWeakT) / (pairs.length || 1)),
  };
}

// expose accessors for tests + downstream sections
export const _acc = {
  actionsOf, functionsOf, drivingOf, triggerDomainOf, maskOf, revealBearing,
  relPresentOf, relOpsOf, metaTagsOf, expectedOf, performBearing, textLen, idOf, r3, multisetDiff,
};

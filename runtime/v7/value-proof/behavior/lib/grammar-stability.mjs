// P1-1C §6 — grammar stability engine.
//
// Compares the 50-record discovery grammar against the 160-record discovery/stability grammar across
// the 12 metric families the directive lists. For each pattern family it does NOT just diff counts;
// it computes:
//   - rank stability   : Spearman rank correlation over shared keys
//   - overlap@K         : Jaccard-style overlap of the top-K keys
//   - support growth    : how support changed (absolute + relative)
//   - direction         : sign/consistency of the change
// and labels EACH key: STABLE / SHIFTED / COLLAPSED / NEWLY_EMERGED.
//
// Key label rules (per pattern key present in either run):
//   NEWLY_EMERGED : absent at 50, present with support>=EMERGE_MIN at 160
//   COLLAPSED     : present (support>=1) at 50, absent OR support drops to 0 at 160
//   SHIFTED       : present in both but rank moved > RANK_SHIFT positions OR relative support change
//                   crossed SHIFT_REL in a way that flips its tier
//   STABLE        : present in both, rank held, support grew or held proportionally
//
// All inputs are the discovery bundles produced by grammar-discovery.mjs (private, link-bearing).

const EMERGE_MIN = 3;     // a newly-seen key needs >=3 record support to count as emerged (not noise)
const RANK_SHIFT = 3;     // rank move beyond this many positions => SHIFTED
const SHIFT_REL = 0.5;    // relative support change beyond +/-50% (per-record-normalized) => SHIFTED

export const PATTERN_LABEL = Object.freeze({
  STABLE: "STABLE",
  SHIFTED: "SHIFTED",
  COLLAPSED: "COLLAPSED",
  NEWLY_EMERGED: "NEWLY_EMERGED",
});

// --- rank + overlap primitives -------------------------------------------------------------------
export function spearman(rankA, rankB) {
  // rankA/rankB: Map(key -> rank). Compute over the intersection of keys.
  const shared = [...rankA.keys()].filter((k) => rankB.has(k));
  const n = shared.length;
  if (n < 2) return null; // undefined for <2 shared points
  let d2 = 0;
  for (const k of shared) { const d = rankA.get(k) - rankB.get(k); d2 += d * d; }
  return Math.round((1 - (6 * d2) / (n * (n * n - 1))) * 1000) / 1000;
}

export function overlapAtK(keysA, keysB, k) {
  const a = new Set(keysA.slice(0, k));
  const b = new Set(keysB.slice(0, k));
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const denom = Math.min(k, Math.max(a.size, b.size)) || 1;
  return Math.round((inter / denom) * 1000) / 1000;
}

// rows: [{key, recordSupport}]. Returns { rankMap, keysByRank, supportMap }.
function indexRows(rows) {
  const sorted = rows.slice().sort((a, b) => b.recordSupport - a.recordSupport || (a.key < b.key ? -1 : 1));
  const rankMap = new Map();
  const supportMap = new Map();
  sorted.forEach((r, i) => { rankMap.set(r.key, i + 1); supportMap.set(r.key, r.recordSupport); });
  return { rankMap, keysByRank: sorted.map((r) => r.key), supportMap };
}

// Label a single key given its before/after support + rank and the per-run record counts.
function labelKey(key, beforeIdx, afterIdx, nBefore, nAfter) {
  const sB = beforeIdx.supportMap.get(key) || 0;
  const sA = afterIdx.supportMap.get(key) || 0;
  const rB = beforeIdx.rankMap.get(key) || null;
  const rA = afterIdx.rankMap.get(key) || null;

  if (sB === 0 && sA >= EMERGE_MIN) return { key, label: PATTERN_LABEL.NEWLY_EMERGED, supportBefore: sB, supportAfter: sA, rankBefore: rB, rankAfter: rA };
  if (sB === 0 && sA < EMERGE_MIN) return { key, label: PATTERN_LABEL.NEWLY_EMERGED, supportBefore: sB, supportAfter: sA, rankBefore: rB, rankAfter: rA, weak: true };
  if (sB >= 1 && sA === 0) return { key, label: PATTERN_LABEL.COLLAPSED, supportBefore: sB, supportAfter: sA, rankBefore: rB, rankAfter: rA };

  // present in both — decide STABLE vs SHIFTED
  const relBefore = sB / nBefore;
  const relAfter = sA / nAfter;
  const relChange = relBefore > 0 ? (relAfter - relBefore) / relBefore : 0;
  const rankMove = rB !== null && rA !== null ? Math.abs(rA - rB) : 0;
  const shifted = rankMove > RANK_SHIFT || Math.abs(relChange) > SHIFT_REL;
  return {
    key,
    label: shifted ? PATTERN_LABEL.SHIFTED : PATTERN_LABEL.STABLE,
    supportBefore: sB, supportAfter: sA, rankBefore: rB, rankAfter: rA,
    relChange: Math.round(relChange * 1000) / 1000, rankMove,
  };
}

// Compare one pattern family. before/after: arrays of {key, recordSupport}.
export function compareFamily(name, before, after, { nBefore, nAfter, k = 5 } = {}) {
  const bi = indexRows(before || []);
  const ai = indexRows(after || []);
  const allKeys = new Set([...(before || []).map((r) => r.key), ...(after || []).map((r) => r.key)]);
  const perKey = [...allKeys].sort().map((key) => labelKey(key, bi, ai, nBefore, nAfter));
  const tally = { STABLE: 0, SHIFTED: 0, COLLAPSED: 0, NEWLY_EMERGED: 0 };
  for (const r of perKey) tally[r.label] += 1;
  return {
    family: name,
    spearman: spearman(bi.rankMap, ai.rankMap),
    overlapAtK: overlapAtK(bi.keysByRank, ai.keysByRank, k),
    k,
    sharedKeys: [...bi.rankMap.keys()].filter((x) => ai.rankMap.has(x)).length,
    keysBefore: bi.keysByRank.length,
    keysAfter: ai.keysByRank.length,
    tally,
    topBefore: bi.keysByRank.slice(0, k),
    topAfter: ai.keysByRank.slice(0, k),
    perKey,
  };
}

// A family's overall verdict from its per-key tally + rank stability.
export function familyVerdict(cmp) {
  const t = cmp.tally;
  const total = t.STABLE + t.SHIFTED + t.COLLAPSED + t.NEWLY_EMERGED || 1;
  const stableFrac = t.STABLE / total;
  if (cmp.spearman !== null && cmp.spearman >= 0.6 && stableFrac >= 0.5) return "STABLE";
  if (t.COLLAPSED > t.STABLE) return "COLLAPSED";
  if (t.NEWLY_EMERGED > t.STABLE && t.NEWLY_EMERGED > t.SHIFTED) return "NEWLY_EMERGED";
  return "SHIFTED";
}

// Map the discovery bundle (grammar-discovery.mjs runDiscovery output) to the comparable families as
// {key, recordSupport} rows. Keys are the discovery edge keys (record-grounded only where tiers exist).
export function extractFamilies(disc) {
  const rows = (arr) => (arr || []).map((r) => ({ key: r.key, recordSupport: r.recordSupport ?? 0 }));
  // driving-force: STRONG tiers only (record-grounded). exploratory (prior/weak) is excluded from
  // stability comparison by design (§5: weak/prior-only must not drive strong grammar).
  const dfStrong = [
    ...(disc.drivingForceStrategy?.tierA_recordSpecificStrong || []),
    ...(disc.drivingForceStrategy?.tierB_recordSpecificModerate || []),
  ];
  // merge duplicate keys across tiers by max support
  const dfMap = new Map();
  for (const r of dfStrong) dfMap.set(r.key, Math.max(dfMap.get(r.key) || 0, r.recordSupport || 0));
  const drivingForceStrategy = [...dfMap.entries()].map(([key, recordSupport]) => ({ key, recordSupport }));

  const affect = [
    ...rows(disc.affectStrategy?.simultaneous),
    ...rows(disc.affectStrategy?.sequential),
  ];
  const triggerStrat = (disc.triggerSensitivity?.domains || []).map((d) => ({ key: d.domain, recordSupport: d.domainRecordCount ?? 0 }));

  return {
    behaviorBigrams: rows(disc.transitions?.bigrams),
    behaviorTrigrams: rows(disc.transitions?.trigrams),
    drivingForceStrategy,
    triggerStrategy: triggerStrat,
    affectStrategy: affect,
    revealFollowup: rows(disc.revealMask?.maskEdges),
    relationshipOps: rows(disc.relationshipOperations?.operationFrequency),
    partnerOps: rows(disc.partnerOperations?.strategyToExpectedPartnerOperation),
    performance: rows(disc.performancePatterns?.performanceEdges),
    // maskStrategy distribution is derived in the annotations (maskAnalysis), not the discovery bundle;
    // handled by the stability driver which passes it explicitly.
  };
}

// Scalar rate stability (single-action rate, multi-function rate). Returns delta + verdict.
export function rateStability(name, before, after, { tol = 0.15 } = {}) {
  const delta = Math.round((after - before) * 1000) / 1000;
  let verdict = "STABLE";
  if (Math.abs(delta) > tol) verdict = "SHIFTED";
  return { metric: name, before: Math.round(before * 1000) / 1000, after: Math.round(after * 1000) / 1000, delta, verdict };
}

// Full 12-metric comparison. disc50 / disc160 are discovery bundles; rates are precomputed scalars.
export function compareStability({ disc50, disc160, n50, n160, rates50, rates160 }) {
  const f50 = extractFamilies(disc50);
  const f160 = extractFamilies(disc160);
  const families = {};
  const familyNames = Object.keys(f50);
  for (const name of familyNames) {
    families[name] = compareFamily(name, f50[name], f160[name], { nBefore: n50, nAfter: n160 });
    families[name].verdict = familyVerdict(families[name]);
  }
  const rateMetrics = {
    singleActionRate: rateStability("singleActionRate", rates50.singleActionRate, rates160.singleActionRate),
    multiFunctionRate: rateStability("multiFunctionRate", rates50.multiFunctionRate, rates160.multiFunctionRate),
  };
  return { n50, n160, families, rateMetrics };
}

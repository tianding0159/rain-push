// Anti-template / GPT-ish phrase diagnostics + immediate-reversal metric.
//
// Two very different forces, kept distinct (see gptish-policy.json):
//   - hardBan: "接住" and its collocations. These must NEVER appear in character output.
//     hardBanHits() returning anything is an acceptance FAILURE (ERR_JIEZHU). Zero tolerance.
//   - candidate: suspected model-speak. candidateHits() COUNTS them for human review and
//     corpus comparison; a hit is NOT an automatic failure. We only promote a phrase to
//     hardBan once it is confirmed clearly stable GPT-speak — we do not pre-emptively ban
//     phrases that might legitimately appear.
//
// Also here: immediate_reversal_density. The reversal pattern (say a real feeling, then
// negate/withdraw it in the same reply or an adjacent unit) is PART of 糖糖 — we do NOT delete
// it. The metric measures how often it fires as a DEFAULT so it can be compared to the corpus
// baseline; the goal is "not significantly higher than baseline", not zero.
//
// Zero runtime dependencies. Pure, deterministic. All matching is substring on normalised
// text — no LLM, no clock, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { toUnits } from "./rhythm.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GPTISH_POLICY_PATH = join(HERE, "..", "policy", "gptish-policy.json");

export const SUPPORTED_GPTISH_POLICY_FORMAT_VERSION = 1;

let _policyCache = null;
export function loadGptishPolicy(path = GPTISH_POLICY_PATH) {
  if (path === GPTISH_POLICY_PATH && _policyCache) return _policyCache;
  const obj = JSON.parse(readFileSync(path, "utf8"));
  if (obj.policyFormatVersion !== SUPPORTED_GPTISH_POLICY_FORMAT_VERSION) {
    throw new Error(`ERR_GPTISH_POLICY_UNSUPPORTED_VERSION: got ${JSON.stringify(obj.policyFormatVersion)}`);
  }
  if (!Array.isArray(obj.hardBan) || !Array.isArray(obj.candidate)) {
    throw new Error("ERR_GPTISH_POLICY_MALFORMED: hardBan and candidate must be arrays");
  }
  if (path === GPTISH_POLICY_PATH) _policyCache = obj;
  return obj;
}

function candidateText(candidate) {
  return toUnits(candidate).join("\n");
}

// Every hard-ban phrase that appears, with its count. Non-empty result = acceptance failure.
export function hardBanHits(candidate, policy = loadGptishPolicy()) {
  const text = candidateText(candidate);
  const hits = [];
  for (const phrase of policy.hardBan) {
    const n = countOccurrences(text, phrase);
    if (n > 0) hits.push({ phrase, count: n });
  }
  return hits;
}

// Total hard-ban hit count — the acceptance number ("接住" hits must be 0).
export function hardBanHitCount(candidate, policy = loadGptishPolicy()) {
  return hardBanHits(candidate, policy).reduce((n, h) => n + h.count, 0);
}

// Candidate (suspected) phrase hits — diagnostic only, for human review + corpus comparison.
export function candidateHits(candidate, policy = loadGptishPolicy()) {
  const text = candidateText(candidate);
  const hits = [];
  for (const phrase of policy.candidate) {
    const n = countOccurrences(text, phrase);
    if (n > 0) hits.push({ phrase, count: n });
  }
  return hits;
}

// Combined per-candidate diagnostic.
export function gptishMetrics(candidate, policy = loadGptishPolicy()) {
  const hard = hardBanHits(candidate, policy);
  const cand = candidateHits(candidate, policy);
  return {
    hardBanHits: hard,
    hardBanHitCount: hard.reduce((n, h) => n + h.count, 0),
    candidateHits: cand,
    candidateHitCount: cand.reduce((n, h) => n + h.count, 0),
  };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

// ---- immediate reversal ---------------------------------------------------------------
//
// A reversal = a positive/affectionate/need expression followed, in the SAME unit or the
// adjacent unit, by a negation/withdrawal of that same expression. We detect it structurally
// (deterministic markers), not semantically — this is a diagnostic, deliberately simple and
// inspectable, and it is compared to the corpus baseline rather than judged against zero.

const POSITIVE_MARKERS = ["想你", "喜欢", "爱你", "想见", "在乎", "开心", "好想", "抱", "亲"];
const REVERSAL_MARKERS = [
  "才怪", "才没有", "才不是", "开玩笑", "算了", "当我没说", "没什么", "不是啦",
  "骗你的", "无所谓", "随便", "别误会", "谁稀罕", "并没有", "不想了",
];

// Returns { reversals, opportunities, density } for one candidate.
// opportunities = units that contain a positive marker (where a reversal COULD fire).
// reversals = positive-bearing unit that itself, or its immediate successor, negates it.
export function immediateReversal(candidate) {
  const units = toUnits(candidate);
  let opportunities = 0;
  let reversals = 0;
  for (let i = 0; i < units.length; i += 1) {
    const u = units[i];
    const hasPositive = POSITIVE_MARKERS.some((m) => u.includes(m));
    if (!hasPositive) continue;
    opportunities += 1;
    const sameUnitReversal = REVERSAL_MARKERS.some((m) => u.includes(m));
    const next = units[i + 1] || "";
    const nextUnitReversal = REVERSAL_MARKERS.some((m) => next.includes(m));
    if (sameUnitReversal || nextUnitReversal) reversals += 1;
  }
  return {
    reversals,
    opportunities,
    density: opportunities ? reversals / opportunities : 0,
  };
}

// Aggregate reversal density over many candidates → a baseline mean the arms compare to.
export function aggregateReversal(candidates) {
  const rows = candidates.map(immediateReversal);
  const totalRev = rows.reduce((n, r) => n + r.reversals, 0);
  const totalOpp = rows.reduce((n, r) => n + r.opportunities, 0);
  return {
    count: rows.length,
    reversals: totalRev,
    opportunities: totalOpp,
    density: totalOpp ? totalRev / totalOpp : 0,
  };
}

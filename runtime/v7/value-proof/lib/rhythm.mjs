// Message-rhythm + punctuation-semantics diagnostics.
//
// PHASE 4-5 scope decision: the directive allows a `messageUnitBudget` FIELD only if a
// validator AND a renderer consume it in the SAME PR. This round builds the MEASUREMENT
// harness, not a live dialogue renderer — so per "no field unless immediately consumed" we do
// NOT add that field yet. Instead we measure rhythm + punctuation on candidate text so the
// blind eval and the auto-diagnostics can compare arms and compare to the corpus. When a
// renderer that emits bounded multi-message replies lands, the budget field + its validator +
// this diagnostic ship together.
//
// A CANDIDATE is a reply expressed as an ORDERED list of message units (strings). A single
// long paragraph is one unit; a natural chat rhythm is several short units. We also accept a
// bare string and split it on newlines into units, so callers can pass either shape.
//
// Punctuation is scored for INTENTIONALITY, not merely counted: "。" is functional
// (withdrawal / finality / controlled anger / mock-formality / refusal / public statement),
// not a default; quotes are for quoting / mocking / titles / absurd system names; "……" is for
// genuine speechlessness / hesitation / cognitive break — not an ordinary pause. The metrics
// here expose the densities; EVAL_RUBRIC.md defines "acceptable = not systematically higher
// than the corpus distribution" (no arbitrary magic number).
//
// Zero runtime dependencies. Pure, deterministic.

// Normalise a candidate into an array of non-empty message-unit strings.
export function toUnits(candidate) {
  if (Array.isArray(candidate)) return candidate.map(String);
  if (candidate && Array.isArray(candidate.messages)) return candidate.messages.map(String);
  if (typeof candidate === "string") return candidate.split("\n").map((s) => s.trim()).filter(Boolean);
  if (candidate && typeof candidate.text === "string") {
    return candidate.text.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const FULL_STOP = "。";
const ELLIPSIS_RE = /(\.{3,}|…+|。{3,})/g; // "...", "…", "……"
const CJK_QUOTE_RE = /[「」『』“”]/g;
// Sentence terminators used to normalise "per sentence" densities.
const SENTENCE_TERMINATOR_RE = /[。！？!?]/g;

function count(re, s) {
  const m = s.match(re);
  return m ? m.length : 0;
}

// Count sentence-final "。": a "。" that is not part of an ellipsis run. We strip ellipsis
// runs first so "……" does not inflate the full-stop count.
function fullStops(s) {
  const withoutEllipsis = s.replace(/。{3,}/g, "");
  return (withoutEllipsis.match(/。/g) || []).length;
}

// Per-candidate rhythm + punctuation metrics.
export function rhythmMetrics(candidate) {
  const units = toUnits(candidate);
  const joined = units.join("\n");
  const totalChars = units.reduce((n, u) => n + u.length, 0);

  const sentenceTerminators = count(SENTENCE_TERMINATOR_RE, joined) || 0;
  const fs = fullStops(joined);
  const ellipsis = count(ELLIPSIS_RE, joined);
  const quotes = count(CJK_QUOTE_RE, joined);

  const lengths = units.map((u) => u.length);
  const fragments = units.filter((u) => isFragment(u)).length;
  const singleChar = units.filter((u) => u.replace(/[。！？!?…\.]/g, "").length <= 1).length;

  return {
    messageUnitCount: units.length,
    // Densities are normalised so arms/corpus with different lengths compare fairly. Guarded
    // against divide-by-zero (empty candidate → 0 density).
    fullStopDensity: sentenceTerminators ? fs / sentenceTerminators : 0,
    ellipsisDensity: units.length ? ellipsis / units.length : 0,
    quoteDensity: totalChars ? quotes / totalChars : 0,
    messageFragmentRate: units.length ? fragments / units.length : 0,
    singleCharacterMessageRate: units.length ? singleChar / units.length : 0,
    messageLengthVariance: variance(lengths),
    meanUnitLength: lengths.length ? totalChars / lengths.length : 0,
  };
}

// A "fragment" = a natural short chat unit that is NOT a full grammatical sentence: it does
// not end in a sentence terminator, OR it is short. This rewards natural fragments (good) and
// lets us detect the "every message is a complete polished sentence" smell.
function isFragment(u) {
  const trimmed = u.trim();
  if (trimmed.length === 0) return false;
  const endsSentence = /[。！？!?]$/.test(trimmed);
  return !endsSentence || trimmed.length <= 6;
}

function variance(nums) {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
}

// Aggregate a distribution over many candidates (e.g. the corpus, or one arm's outputs), so
// EVAL_RUBRIC's "not systematically higher than the corpus" comparison has a baseline. Returns
// mean + max per metric. Deterministic.
export function aggregateRhythm(candidates) {
  const rows = candidates.map(rhythmMetrics);
  const keys = [
    "messageUnitCount", "fullStopDensity", "ellipsisDensity", "quoteDensity",
    "messageFragmentRate", "singleCharacterMessageRate", "messageLengthVariance", "meanUnitLength",
  ];
  const out = { count: rows.length, mean: {}, max: {} };
  for (const k of keys) {
    const vals = rows.map((r) => r[k]);
    out.mean[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    out.max[k] = vals.length ? Math.max(...vals) : 0;
  }
  return out;
}

// Compare an arm's aggregate to a baseline (the corpus). "systematicallyHigher" flags a metric
// whose arm mean exceeds the baseline mean by more than a relative tolerance. This is the
// operationalisation of "not systematically higher than the corpus" — the tolerance is a
// comparison knob, NOT an absolute acceptance threshold on the metric itself.
export function comparedToBaseline(armAgg, baselineAgg, tolerance = 0.15) {
  const flags = {};
  for (const k of ["fullStopDensity", "ellipsisDensity", "quoteDensity"]) {
    const base = baselineAgg.mean[k] || 0;
    const arm = armAgg.mean[k] || 0;
    flags[k] = arm > base * (1 + tolerance);
  }
  return { systematicallyHigher: flags, tolerance };
}

// Phase-1 cleaning & preservation audit for the single-sided corpus (directive §9 phase 1).
//
// Produces a TEXT-FREE audit: hashes, line identity, duplicates, contamination flags,
// speaker/surface candidates, punctuation-rhythm aggregates. It never rewrites the corpus and
// never emits verbatim text — only counts, hashes, and boolean/enum signals.
//
// Contamination detection is heuristic and conservative: it flags *candidate* AI/assistant
// artifacts and non-in-character meta lines for human review; it does NOT delete anything.

import { redactedBatch } from "./raw-corpus.mjs";

// Regexes over text that produce only booleans (no capture is logged).
const AI_MARKERS = [
  /as an ai/i,
  /language model/i,
  /\bassistant\b/i,
  /作为(一个)?\s*ai/i,
  /我是.{0,4}(语言模型|ai助手|人工智能)/i,
  /\bgpt\b/i,
  /\bclaude\b/i,
];

// A "persona surface" clue is a bracket/marker style that may indicate Ame vs KAngel register.
// We only record which surface glyphs appear, never the content.
function surfaceClues(text) {
  return {
    angleQuote: /[「」]/.test(text),
    cornerQuote: /[『』]/.test(text),
    straightQuote: /["']/.test(text),
    parenAside: /[（(].+[)）]/.test(text),
    tilde: /[~～]/.test(text),
    star: /\*.+\*/.test(text),
  };
}

function contaminationFlags(text) {
  const ai = AI_MARKERS.some((re) => re.test(text));
  // meta line: looks like narration/stage direction rather than an utterance is left to humans;
  // we only flag obvious AI markers here to avoid over-deleting in-character content.
  return { aiMarker: ai };
}

// Aggregate punctuation rhythm across records (text-free).
function rhythmAggregate(records) {
  const n = records.length || 1;
  const sum = { len: 0, excl: 0, ques: 0, ellipsis: 0, comma: 0, period: 0, tilde: 0 };
  for (const r of records) {
    sum.len += r.punct.len;
    sum.excl += r.punct.excl;
    sum.ques += r.punct.ques;
    sum.ellipsis += r.punct.ellipsis;
    sum.comma += r.punct.comma;
    sum.period += r.punct.period;
    sum.tilde += r.punct.hasTilde ? 1 : 0;
  }
  return {
    meanLen: round(sum.len / n),
    exclRate: round(sum.excl / n),
    quesRate: round(sum.ques / n),
    ellipsisRate: round(sum.ellipsis / n),
    commaRate: round(sum.comma / n),
    periodRate: round(sum.period / n),
    tildeShare: round(sum.tilde / n),
  };
}

function round(x) { return Math.round(x * 1000) / 1000; }

// Main audit. `loaded` is the result of loadRawCorpus(). Returns a text-free report object.
export function auditCorpus(loaded) {
  if (!loaded || !loaded.present) {
    return { status: "PROVENANCE_BLOCKED", present: false };
  }
  const records = loaded.records;
  const total = records.length;

  // Duplicate detection by content hash (dup = same speaker+text).
  const byHash = new Map();
  for (const r of records) {
    if (!byHash.has(r.hash)) byHash.set(r.hash, []);
    byHash.get(r.hash).push(r.order);
  }
  const duplicateGroups = [...byHash.entries()]
    .filter(([, orders]) => orders.length > 1)
    .map(([hash, orders]) => ({ hash, count: orders.length, orders: orders.slice().sort((a, b) => a - b) }))
    .sort((a, b) => (b.count - a.count) || a.hash.localeCompare(b.hash));
  const uniqueCount = byHash.size;

  // Speaker distribution.
  const speakerCounts = {};
  for (const r of records) speakerCounts[r.speaker] = (speakerCounts[r.speaker] || 0) + 1;

  // Contamination candidates (text-free: only order+hash of flagged lines).
  const contamination = [];
  for (const r of records) {
    const f = contaminationFlags(r.text);
    if (f.aiMarker) contamination.push({ order: r.order, hash: r.hash, aiMarker: true });
  }

  // Surface-clue aggregate.
  const surfaceAgg = { angleQuote: 0, cornerQuote: 0, straightQuote: 0, parenAside: 0, tilde: 0, star: 0 };
  for (const r of records) {
    const c = surfaceClues(r.text);
    for (const k of Object.keys(surfaceAgg)) if (c[k]) surfaceAgg[k] += 1;
  }

  // Order integrity: are declared orders 1..N contiguous?
  const orders = records.map((r) => r.order).sort((a, b) => a - b);
  const contiguous = orders.length > 0
    && orders[0] === 1
    && orders[orders.length - 1] === orders.length
    && orders.every((v, i) => v === i + 1);

  return {
    status: "CLEAN_AUDIT_DONE",
    present: true,
    fileSha256: loaded.fileSha256,
    total,
    uniqueCount,
    duplicateCount: total - uniqueCount,
    duplicateGroups,
    unparsedLineCount: (loaded.unparsedLineNumbers || []).length,
    unparsedLineNumbers: loaded.unparsedLineNumbers || [],
    speakerCounts,
    singleSided: Object.keys(speakerCounts).length === 1,
    contaminationCandidateCount: contamination.length,
    contaminationCandidates: contamination,
    surfaceClueCounts: surfaceAgg,
    orderContiguous: contiguous,
    rhythm: rhythmAggregate(records),
    // Text-free per-record projection is available but NOT embedded here to keep the audit
    // small; callers that need it use redactedBatch(loaded.records).
  };
}

export { redactedBatch };

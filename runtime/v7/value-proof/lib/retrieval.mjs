// Deterministic corpus retrieval for the value-proof ablation.
//
// This is the piece that separates arm B (prompt+retrieval) and arm D (engine+retrieval)
// from arm A (prompt only) and arm C (engine only). Given a scenario query and a loaded
// corpus, it selects the evidence a generator is ALLOWED to use, bounded by provenance:
//
//   - suspected_ai sources are quarantined (never retrieved) — reuses source-policy.
//   - each candidate's declared usage (behavior / wording / mechanics) must be permitted by
//     its source layer × evidence level (reuses canDriveBehavior/Wording/Mechanics).
//   - C3 (community, wording-only) is TOGGLEABLE via includeC3, so a contamination ablation
//     can measure C3's influence and prove C3 never overrides C1.
//
// It is fully deterministic: scoring is a pure function of the query + record, ties broken by
// a stable key, no clock / no network / no LLM. The output is a set of retrieval-evidence
// references (ids + message hashes + usage) — NEVER verbatim text — so it is safe to log and
// to include in a replay artifact.
//
// Zero runtime dependencies.

import { createHash } from "node:crypto";

import { loadPolicy } from "../../corpus/lib/source-policy.mjs";
import {
  canDriveBehavior,
  canDriveWording,
  canDriveMechanics,
  isQuarantined,
  layerLabel,
} from "../../corpus/lib/source-policy.mjs";

export const RETRIEVAL_EXCLUSION_CODES = Object.freeze({
  QUARANTINED: "RET_EXCL_QUARANTINED",
  USAGE_NOT_PERMITTED: "RET_EXCL_USAGE_NOT_PERMITTED",
  C3_DISABLED: "RET_EXCL_C3_DISABLED",
  UNKNOWN_SOURCE: "RET_EXCL_UNKNOWN_SOURCE",
});

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// Index sources by id for capability lookup.
function indexSources(registry) {
  const byId = {};
  for (const s of registry) byId[s.id] = s;
  return byId;
}

// Which usages is a source permitted to drive, from provenance alone. Reuses the SSOT.
function permittedUsages(policy, source) {
  const usages = [];
  if (canDriveBehavior(policy, source.sourceLayer, source.evidenceLevel)) usages.push("behavior");
  if (canDriveWording(policy, source.sourceLayer, source.evidenceLevel)) usages.push("wording");
  if (canDriveMechanics(policy, source.sourceLayer)) usages.push("mechanics");
  return usages;
}

// Deterministic lexical overlap score between the query terms and an event's structural
// annotation (NOT its verbatim text — we score on eventTrigger / functionalNeed / behavior
// primitives / expected reply class, which are analysis fields). Pure integer count so ties
// are exact and stable.
function scoreEvent(query, ev) {
  const terms = new Set(
    String(query.text || "")
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter(Boolean),
  );
  const hay = [
    ev.eventTrigger,
    ev.functionalNeed,
    ev.expectedReplyClass,
    ...(ev.behaviorPrimitives || []),
    ...(ev.stateEffect || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 1;
  // Channel and mode matches are strong structural signals.
  if (query.channel && ev.channel === query.channel) score += 2;
  if (query.mode && ev.mode === query.mode) score += 1;
  return score;
}

// Retrieve evidence for a scenario query. Returns
// { references, excluded, sourceDistribution, c3Influence }.
//   references: [{ eventId, usage, messageHashes }]  (retrieval-evidence-reference shape)
//   excluded:   [{ eventId, code, detail }]          (why a candidate was dropped)
export function retrieve(query, corpus, opts = {}) {
  const policy = opts.policy || loadPolicy();
  const includeC3 = opts.includeC3 !== false; // default on; ablation sets false
  const topK = Number.isInteger(opts.topK) ? opts.topK : 5;
  const wantUsage = opts.usage || null; // optional filter: only this usage
  const sources = indexSources(opts.registry || corpus.registry || []);

  const scored = [];
  const excluded = [];

  for (const ev of corpus.events || []) {
    const source = sources[ev.sourceId];
    if (!source) {
      excluded.push({ eventId: ev.id, code: RETRIEVAL_EXCLUSION_CODES.UNKNOWN_SOURCE, detail: ev.sourceId });
      continue;
    }
    if (isQuarantined(policy, source.trustLevel)) {
      excluded.push({ eventId: ev.id, code: RETRIEVAL_EXCLUSION_CODES.QUARANTINED, detail: source.id });
      continue;
    }
    const label = layerLabel(policy, source.sourceLayer);
    if (!includeC3 && label === "community") {
      excluded.push({ eventId: ev.id, code: RETRIEVAL_EXCLUSION_CODES.C3_DISABLED, detail: source.id });
      continue;
    }
    let usages = permittedUsages(policy, source);
    if (wantUsage) usages = usages.filter((u) => u === wantUsage);
    if (usages.length === 0) {
      excluded.push({ eventId: ev.id, code: RETRIEVAL_EXCLUSION_CODES.USAGE_NOT_PERMITTED, detail: source.id });
      continue;
    }
    const score = scoreEvent(query, ev);
    scored.push({ ev, source, label, usages, score });
  }

  // Deterministic ordering: score desc, then eventId asc. No randomness.
  scored.sort((a, b) => (b.score - a.score) || (a.ev.id < b.ev.id ? -1 : a.ev.id > b.ev.id ? 1 : 0));
  const top = scored.slice(0, topK);

  const references = top.map(({ ev, usages }) => ({
    eventId: ev.id,
    usage: usages[0], // strongest permitted usage; usages[] already provenance-bounded
    messageHashes: (ev.messages || []).map((m) => sha256(m.text || "")),
  }));

  // Source-layer distribution + C3 influence rate over the retrieved set (PHASE 11 metrics).
  const dist = {};
  let c3 = 0;
  for (const { source, label } of top) {
    dist[source.sourceLayer] = (dist[source.sourceLayer] || 0) + 1;
    if (label === "community") c3 += 1;
  }
  const c3Influence = top.length ? c3 / top.length : 0;

  return { references, excluded, sourceDistribution: dist, c3Influence };
}

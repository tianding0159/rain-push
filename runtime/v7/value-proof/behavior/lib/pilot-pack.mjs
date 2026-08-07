// Pilot review-pack builder (directive §9 stage 2, §16 items 6-7).
//
// Two outputs, strictly separated by privacy:
//   1. PRIVATE pack — includes verbatim text so a human can actually annotate. Written ONLY to
//      the gitignored private/ dir. Never committed, never logged.
//   2. PUBLIC skeleton — hash-keyed annotation stubs (no text) that a reviewer fills in and that
//      are safe to commit as fixtures/tests. One stub per (record × round).
//
// Selection of the 50 pilot records is DETERMINISTIC: a seeded shuffle over record hashes, so
// the same corpus always yields the same pilot set (reproducible, auditable). No Math.random.

import { redactedRecord } from "./raw-corpus.mjs";

export const PILOT_SIZE = 50;
export const PILOT_SEED = 0x5eed1051; // fixed seed → reproducible pilot selection

// Deterministic PRNG (mulberry32) — same as the value-proof blind-pack, kept local to avoid
// cross-layer coupling.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded Fisher-Yates over a COPY, ordered first by hash for a stable starting permutation.
function seededSample(records, size, seed) {
  const arr = records.slice().sort((a, b) => a.hash.localeCompare(b.hash));
  const rnd = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr.slice(0, Math.min(size, arr.length));
}

// Select the pilot records deterministically.
export function selectPilot(records, { size = PILOT_SIZE, seed = PILOT_SEED } = {}) {
  return seededSample(records, size, seed);
}

// PRIVATE pack: includes text. Returns an object destined for private/ ONLY.
export function buildPrivatePack(records, opts = {}) {
  const pilot = selectPilot(records, opts);
  return {
    packFormatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    seed: opts.seed ?? PILOT_SEED,
    size: pilot.length,
    // text included so a human can annotate; this object must never leave private/.
    items: pilot.map((r) => ({ order: r.order, hash: r.hash, speaker: r.speaker, text: r.text, punct: r.punct })),
  };
}

// PUBLIC skeleton: NO text. One empty annotation stub per record per round, plus the redacted
// record so a reviewer sees hash/order/punct context. Safe to commit.
export function buildPublicSkeleton(records, { rounds = 2, ...opts } = {}) {
  const pilot = selectPilot(records, opts);
  const stubs = [];
  for (let round = 1; round <= rounds; round++) {
    for (const r of pilot) {
      stubs.push({
        recordFormatVersion: 1,
        recordHash: r.hash,
        order: r.order,
        annotator: "",
        round,
        modelSuggested: false,
        l1: { speechActs: [], behaviorAtoms: [] },
        l2: { functions: [] },
        l3: { candidates: [] },
        affect: {},
        expectedReply: {},
        l4Refs: { supports: [], counters: [] },
        contextDependentJudgments: [],
      });
    }
  }
  return {
    packFormatVersion: 1,
    visibility: "PUBLIC_NO_TEXT",
    seed: opts.seed ?? PILOT_SEED,
    size: pilot.length,
    rounds,
    records: pilot.map(redactedRecord), // hash/order/punct only
    annotationStubs: stubs,
  };
}

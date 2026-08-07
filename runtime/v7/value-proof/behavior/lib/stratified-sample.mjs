// Stratified deterministic pilot sampler (directive §2 + §Two/§Three).
//
// Goal: pick 50 records that SPAN the coverage buckets (heuristics.mjs) without any human or model
// cherry-picking "the most 糖糖-like" or "easiest to analyze" lines. Selection is a pure function
// of (corpus, seed): same corpus hash + same seed ⇒ byte-identical selection.
//
// Algorithm (deterministic):
//   1. Assign every record its heuristic buckets.
//   2. For each COVERAGE bucket (rare-first order), take its members, order them by a seeded hash
//      permutation, and pull the first not-yet-selected one. This guarantees ≥1 per non-empty
//      bucket (coverage) while the seed — not judgement — decides WHICH member.
//   3. If fewer than TARGET after one coverage pass, do more round-robin passes over the buckets.
//   4. If still short (tiny corpus), top up from a global seeded permutation of all records.
//   5. Assign randomized presentation IDs via a SEPARATE seeded permutation so display order leaks
//      neither selection order nor bucket.
//
// Nothing here inspects "quality" or "representativeness of character" — only bucket membership
// and a seeded coin. That is the anti-cherry-pick guarantee.

import { createHash } from "node:crypto";
import { bucketsFor, COVERAGE_BUCKETS } from "./heuristics.mjs";

export const TARGET = 50;
export const SELECTION_SEED = 0x51a9e2; // fixed → reproducible selection
export const PRESENTATION_SEED = 0x9c0ffee; // separate seed for display-id scramble

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic permutation of an array of records, keyed by (seed, recordHash) so it is stable
// regardless of input order.
function seededPermute(records, seed) {
  const withKey = records.map((r) => ({
    r,
    k: createHash("sha256").update(seed + ":" + r.hash).digest("hex"),
  }));
  withKey.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return withKey.map((x) => x.r);
}

// Fisher-Yates over a copy using a seeded PRNG (for presentation-id scramble).
function seededShuffle(arr, seed) {
  const a = arr.slice();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Build bucket → [records] index (each record annotated with its buckets).
function indexByBucket(records) {
  const enriched = records.map((r) => ({ ...r, buckets: bucketsFor(r.text) }));
  const idx = new Map(COVERAGE_BUCKETS.map((b) => [b, []]));
  for (const r of enriched) {
    for (const b of r.buckets) if (idx.has(b)) idx.get(b).push(r);
  }
  return { enriched, idx };
}

export function stratifiedSelect(records, { target = TARGET, seed = SELECTION_SEED } = {}) {
  const { enriched, idx } = indexByBucket(records);

  // Pre-permute each bucket's members deterministically (seed salted per-bucket so buckets don't
  // all pick the same "first" record).
  const permutedByBucket = new Map();
  for (const b of COVERAGE_BUCKETS) {
    const seedForBucket = (seed ^ hashInt(b)) >>> 0;
    permutedByBucket.set(b, seededPermute(idx.get(b) || [], seedForBucket));
  }

  const selected = new Map(); // hash → record
  const selectionOrder = []; // for audit: which bucket triggered each pick
  const cursor = new Map(COVERAGE_BUCKETS.map((b) => [b, 0]));

  // Round-robin coverage passes.
  let progress = true;
  while (selected.size < target && progress) {
    progress = false;
    for (const b of COVERAGE_BUCKETS) {
      if (selected.size >= target) break;
      const pool = permutedByBucket.get(b);
      let i = cursor.get(b);
      while (i < pool.length && selected.has(pool[i].hash)) i++;
      if (i < pool.length) {
        const rec = pool[i];
        selected.set(rec.hash, rec);
        selectionOrder.push({ hash: rec.hash, triggeredBy: b });
        cursor.set(b, i + 1);
        progress = true;
      } else {
        cursor.set(b, i);
      }
    }
  }

  // Top-up from a global seeded permutation if still short (only happens on tiny corpora).
  if (selected.size < target) {
    const global = seededPermute(enriched, seed);
    for (const rec of global) {
      if (selected.size >= target) break;
      if (!selected.has(rec.hash)) {
        selected.set(rec.hash, rec);
        selectionOrder.push({ hash: rec.hash, triggeredBy: "global_topup" });
      }
    }
  }

  const chosen = [...selected.values()];

  // Assign randomized presentation IDs via a SEPARATE seed so display order reveals nothing about
  // selection order or bucket.
  const scrambled = seededShuffle(chosen, PRESENTATION_SEED);
  const presentation = scrambled.map((rec, i) => ({
    presentationId: "PA-" + String(i + 1).padStart(3, "0"),
    hash: rec.hash,
  }));
  const presIdByHash = new Map(presentation.map((p) => [p.hash, p.presentationId]));

  return {
    seed,
    presentationSeed: PRESENTATION_SEED,
    target,
    selectedCount: chosen.length,
    // full records (WITH text + buckets) — private only
    records: chosen.map((r) => ({ ...r, presentationId: presIdByHash.get(r.hash) })),
    selectionOrder,
    presentation, // presentationId → hash
    coverage: bucketCoverage(chosen),
  };
}

// Count how many selected records fall in each coverage bucket (a record can count in several).
export function bucketCoverage(chosen) {
  const counts = Object.fromEntries(COVERAGE_BUCKETS.map((b) => [b, 0]));
  for (const r of chosen) {
    const bs = r.buckets || bucketsFor(r.text);
    for (const b of bs) if (b in counts) counts[b] += 1;
  }
  return counts;
}

function hashInt(s) {
  const h = createHash("sha256").update(String(s)).digest();
  return h.readUInt32BE(0);
}

// P1-1C 200-record selection engine (directive §2 + §3).
//
// Requirements this module enforces AS CODE (not by convention):
//   1. The original 50 (PA-001..PA-050) are PINNED by recordHash and carried through unchanged —
//      never re-sampled, never re-idded. They come from the frozen selection-key.
//   2. Exactly 150 NEW unique records are added deterministically (fixed seed) from the corpus
//      MINUS the original 50, using the extended coverage buckets (heuristics-200) so the added
//      records span practical/mundane/low-info/energy classes the 50-stage under-covered.
//   3. Total = 200 unique records (no hash collides with the original 50).
//   4. A holdout of 40 is carved deterministically from a SEPARATE seed, and — critically — the
//      original 50 are EXCLUDED from the holdout (holdout ⊆ the 150 new records). Discovery/stability
//      set = 200 − 40 = 160, and always ⊇ the original 50.
//
// Determinism: given a fixed corpus hash + fixed seeds, selection + holdout + presentation ids are
// byte-stable. Nothing inspects "quality"/"character-likeness"; only bucket membership + seeded hash.
//
// Presentation ids: originals keep PA-001..PA-050. New records get PB-001..PB-150 via a seeded
// scramble that reveals neither source order nor bucket.

import { createHash } from "node:crypto";
import { bucketsFor200, EXTENDED_COVERAGE_BUCKETS } from "./heuristics-200.mjs";

export const TARGET_TOTAL = 200;
export const ORIGINAL_COUNT = 50;
export const NEW_COUNT = 150;
export const HOLDOUT_COUNT = 40;
export const DISCOVERY_COUNT = 160;

export const SELECTION_SEED_200 = 0x2c07a11; // "200 all" — new-record selection
export const PRESENTATION_SEED_200 = 0xb1a5ed; // new-record presentation-id scramble
export const HOLDOUT_SEED = 0x40ade7; // "40 held" — holdout carve (separate from selection)

function seededKey(seed, s) {
  return createHash("sha256").update(seed + ":" + s).digest("hex");
}

// Deterministic permutation of records keyed by (seed, hash) — stable regardless of input order.
function seededPermute(records, seed) {
  return records
    .map((r) => ({ r, k: seededKey(String(seed), r.hash) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.r);
}

function hashInt(s) {
  return createHash("sha256").update(String(s)).digest().readUInt32BE(0);
}

// Round-robin coverage selection over extended buckets, drawing `target` NOT-already-taken records.
// `taken` is a Set of hashes to exclude (the pinned originals). Pure function of (records, seed).
function coverageSelect(records, { target, seed, taken }) {
  const enriched = records.map((r) => ({ ...r, buckets: bucketsFor200(r.text) }));
  const idx = new Map(EXTENDED_COVERAGE_BUCKETS.map((b) => [b, []]));
  for (const r of enriched) for (const b of r.buckets) if (idx.has(b)) idx.get(b).push(r);

  const permutedByBucket = new Map();
  for (const b of EXTENDED_COVERAGE_BUCKETS) {
    const seedForBucket = (seed ^ hashInt(b)) >>> 0;
    permutedByBucket.set(b, seededPermute(idx.get(b) || [], seedForBucket));
  }

  const selected = new Map();
  const order = [];
  const cursor = new Map(EXTENDED_COVERAGE_BUCKETS.map((b) => [b, 0]));
  const isTaken = (h) => taken.has(h) || selected.has(h);

  let progress = true;
  while (selected.size < target && progress) {
    progress = false;
    for (const b of EXTENDED_COVERAGE_BUCKETS) {
      if (selected.size >= target) break;
      const pool = permutedByBucket.get(b);
      let i = cursor.get(b);
      while (i < pool.length && isTaken(pool[i].hash)) i++;
      if (i < pool.length) {
        const rec = pool[i];
        selected.set(rec.hash, rec);
        order.push({ hash: rec.hash, triggeredBy: b });
        cursor.set(b, i + 1);
        progress = true;
      } else {
        cursor.set(b, i);
      }
    }
  }
  // Global top-up if buckets exhausted before target (defensive; corpus is large enough here).
  if (selected.size < target) {
    for (const rec of seededPermute(enriched, seed)) {
      if (selected.size >= target) break;
      if (!isTaken(rec.hash)) {
        selected.set(rec.hash, rec);
        order.push({ hash: rec.hash, triggeredBy: "global_topup" });
      }
    }
  }
  return { records: [...selected.values()], order };
}

// Carve a deterministic holdout of `holdoutCount` from ELIGIBLE hashes only (the 150 new records;
// originals are never eligible). Returns { holdoutHashes:Set, discoveryHashes:Set }.
export function carveHoldout(newRecords, { holdoutCount = HOLDOUT_COUNT, seed = HOLDOUT_SEED } = {}) {
  const permuted = seededPermute(newRecords, seed);
  const holdout = new Set(permuted.slice(0, holdoutCount).map((r) => r.hash));
  const discovery = new Set(newRecords.filter((r) => !holdout.has(r.hash)).map((r) => r.hash));
  return { holdoutHashes: holdout, discoveryHashes: discovery };
}

// Main entry. `corpusRecords` = parsed raw records (with .text/.hash/.order). `originalKey` = the
// frozen selection-key `key[]` (presentationId + recordHash) for the pinned 50.
export function select200(corpusRecords, originalKey, opts = {}) {
  const target = opts.target ?? TARGET_TOTAL;
  const originalCount = opts.originalCount ?? ORIGINAL_COUNT;
  const holdoutCount = opts.holdoutCount ?? HOLDOUT_COUNT;
  const selSeed = opts.seed ?? SELECTION_SEED_200;
  const presSeed = opts.presentationSeed ?? PRESENTATION_SEED_200;
  const holdSeed = opts.holdoutSeed ?? HOLDOUT_SEED;

  const byHash = new Map(corpusRecords.map((r) => [r.hash, r]));

  // ---- 1. pin the originals by hash (must all resolve in the corpus) ----
  const originals = [];
  const missing = [];
  for (const k of originalKey) {
    const rec = byHash.get(k.recordHash);
    if (!rec) { missing.push(k.presentationId); continue; }
    originals.push({ ...rec, presentationId: k.presentationId, source: "original" });
  }
  if (missing.length) {
    return { ok: false, error: "ORIGINAL_RECORDS_NOT_IN_CORPUS", missing };
  }
  if (originals.length !== originalCount) {
    return { ok: false, error: "ORIGINAL_COUNT_MISMATCH", got: originals.length, want: originalCount };
  }
  const takenHashes = new Set(originals.map((r) => r.hash));

  // ---- 2. select NEW records from corpus minus originals ----
  const newTarget = target - originalCount;
  const pool = corpusRecords.filter((r) => !takenHashes.has(r.hash));
  const { records: newRaw, order: newOrder } = coverageSelect(pool, { target: newTarget, seed: selSeed, taken: new Set() });
  if (newRaw.length !== newTarget) {
    return { ok: false, error: "NEW_SELECTION_SHORT", got: newRaw.length, want: newTarget };
  }

  // ---- 3. assign PB ids via a separate seeded scramble ----
  const scrambled = seededPermute(newRaw, presSeed);
  const newRecords = scrambled.map((r, i) => ({
    ...r,
    presentationId: "PB-" + String(i + 1).padStart(3, "0"),
    source: "new",
    buckets: bucketsFor200(r.text),
  }));

  // ---- 4. carve holdout (only from new records; originals excluded by construction) ----
  const { holdoutHashes, discoveryHashes } = carveHoldout(newRecords, { holdoutCount, seed: holdSeed });

  const all = [...originals.map((r) => ({ ...r, buckets: bucketsFor200(r.text) })), ...newRecords];
  const setFor = (r) => (holdoutHashes.has(r.hash) ? "holdout" : "discovery");
  const withSplit = all.map((r) => ({ ...r, split: setFor(r) }));

  // sanity invariants (fail loud rather than emit a subtly-wrong selection)
  const uniqueHashes = new Set(all.map((r) => r.hash));
  if (uniqueHashes.size !== target) return { ok: false, error: "DUPLICATE_HASHES", unique: uniqueHashes.size };
  const holdoutOnOriginal = originals.some((r) => holdoutHashes.has(r.hash));
  if (holdoutOnOriginal) return { ok: false, error: "HOLDOUT_CONTAMINATED_WITH_ORIGINAL" };
  const discoveryCount = withSplit.filter((r) => r.split === "discovery").length;

  return {
    ok: true,
    target,
    originalCount: originals.length,
    newCount: newRecords.length,
    holdoutCount: holdoutHashes.size,
    discoveryCount,
    selectionSeed: selSeed,
    presentationSeed: presSeed,
    holdoutSeed: holdSeed,
    records: withSplit, // WITH text — private only
    originals,
    newRecords,
    newSelectionOrder: newOrder,
    holdoutHashes: [...holdoutHashes].sort(),
    discoveryHashes: [...discoveryHashes].sort(),
    coverage: coverageOf(withSplit),
    coverageNew: coverageOf(newRecords),
  };
}

export function coverageOf(records) {
  const counts = Object.fromEntries(EXTENDED_COVERAGE_BUCKETS.map((b) => [b, 0]));
  for (const r of records) {
    const bs = r.buckets || bucketsFor200(r.text);
    for (const b of bs) if (b in counts) counts[b] += 1;
  }
  return counts;
}

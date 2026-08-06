// Deterministic blind-evaluation packing.
//
// A blind pack presents, per scenario, the four arm candidates in a SHUFFLED order under
// anonymous slot ids (cand_1..cand_4), so a human evaluator scores them without knowing which
// arm produced which. The mapping slot→arm is kept in a SEPARATE key file the evaluator never
// sees until after scoring. This prevents label leakage (PHASE 8 / PHASE 11).
//
// The shuffle is deterministic and seeded (no Math.random), so a pack is byte-reproducible and
// a replay yields the identical arrangement. The seed derives from the scenarioId + a pack
// salt, so different scenarios shuffle differently but any given pack is stable.
//
// The evaluator-facing pack carries ONLY the candidate messages (text-free of provenance) and
// the scenario's P-side turns — never arm labels, never expectation, never retrieval refs,
// never author notes. The key file carries the slot→arm mapping + retrieval refs for the
// post-hoc audit.
//
// Zero runtime dependencies. Pure, deterministic.

import { createHash } from "node:crypto";

// A tiny deterministic PRNG (mulberry32) seeded from a 32-bit integer. Deterministic across
// platforms; used only for shuffling, never for anything security-sensitive.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(str) {
  const hex = createHash("sha256").update(str, "utf8").digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

// Deterministic Fisher-Yates using a seeded PRNG.
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a blind pack for one scenario from its runArms() result.
// Returns { pack, key }:
//   pack: { scenarioId, pTurns, candidates: [{ slot, messages }] }   — evaluator sees this
//   key:  { scenarioId, mapping: { slot: arm }, refs: { slot: refs } } — hidden until scoring
export function packScenario(scenarioRun, scenario, opts = {}) {
  const salt = opts.salt || "value-proof-blind-v1";
  const rng = mulberry32(seedFrom(`${scenarioRun.scenarioId}:${salt}`));
  const shuffled = shuffle(scenarioRun.candidates, rng);

  const candidates = [];
  const mapping = {};
  const refs = {};
  shuffled.forEach((entry, i) => {
    const slot = `cand_${i + 1}`;
    candidates.push({ slot, messages: entry.candidate.messages });
    mapping[slot] = entry.input.arm;
    refs[slot] = (entry.input.retrieval || []).map((r) => ({ turnOrder: r.turnOrder, references: r.references }));
  });

  const pTurns = scenario
    ? scenario.turns.map((t) => ({ order: t.order, pInput: t.pInput }))
    : [];

  return {
    pack: { scenarioId: scenarioRun.scenarioId, pTurns, candidates },
    key: { scenarioId: scenarioRun.scenarioId, mapping, refs },
  };
}

// Assert an evaluator-facing pack leaks no arm label. Returns true or throws.
export function assertNoLabelLeak(pack) {
  const s = JSON.stringify(pack);
  // Slots must be cand_*; the raw arm letters must not appear as an "arm" field anywhere.
  if (/"arm"\s*:/.test(s)) throw new Error("blind pack leak: an 'arm' field is present");
  if (/"kind"\s*:/.test(s)) throw new Error("blind pack leak: a 'kind' field is present");
  if (/"expectation"\s*:/.test(s)) throw new Error("blind pack leak: an 'expectation' field is present");
  for (const c of pack.candidates) {
    if (!/^cand_\d+$/.test(c.slot)) throw new Error(`blind pack leak: non-anonymous slot ${c.slot}`);
  }
  return true;
}

// Build packs + a combined key file for a whole suite of scenario runs.
export function packSuite(scenarioRuns, scenariosById, opts = {}) {
  const packs = [];
  const keys = [];
  for (const run of scenarioRuns) {
    const { pack, key } = packScenario(run, scenariosById[run.scenarioId], opts);
    assertNoLabelLeak(pack);
    packs.push(pack);
    keys.push(key);
  }
  return { packs, keys };
}

// After scoring, join evaluator scores (by slot) back to arms using the key. scores is
// [{ scenarioId, slot, score }] → returns [{ scenarioId, arm, score }].
export function resolveScores(scores, keys) {
  const keyById = {};
  for (const k of keys) keyById[k.scenarioId] = k.mapping;
  return scores.map((s) => ({
    scenarioId: s.scenarioId,
    arm: keyById[s.scenarioId] ? keyById[s.scenarioId][s.slot] : undefined,
    score: s.score,
  }));
}

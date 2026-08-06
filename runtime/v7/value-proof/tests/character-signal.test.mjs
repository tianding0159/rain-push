import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadSignalPolicy, affectRoleIds, annotationStatusIds } from "../lib/signal-policy.mjs";
import {
  parseSignal,
  parseSignalBatch,
  contradictoryAffectPresence,
  emotionCoactivationCount,
  analyzeWellFormedness,
  SIGNAL_WARNING_CODES,
} from "../lib/character-signal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const policy = loadSignalPolicy();

function signalsFixture() {
  return JSON.parse(readFileSync(join(HERE, "..", "fixtures", "synthetic", "signals.valid.json"), "utf8"));
}

test("signal-policy exposes the affect roles and statuses", () => {
  assert.deepEqual(affectRoleIds(policy), ["leak", "masked", "opposing", "primary"]);
  assert.deepEqual(annotationStatusIds(policy), ["calibrated", "provisional"]);
});

test("synthetic valid signals parse, are contradictory, and are well-formed", () => {
  for (const rec of signalsFixture()) {
    const r = parseSignal(rec, { policy });
    assert.ok(r.valid, `expected valid: ${JSON.stringify(r.errors)}`);
    assert.equal(r.contradictory, true, "primary + opposing must co-occur");
    assert.ok(r.coactivation >= 2);
    assert.deepEqual(r.warnings, [], `unexpected warnings: ${JSON.stringify(r.warnings)}`);
  }
});

test("schema rejects an unknown affect role and an unknown status", () => {
  const base = signalsFixture()[0];
  const badRole = { ...base, affectBlend: [{ name: "x", weight: 0.5, role: "sarcasm" }] };
  assert.equal(parseSignal(badRole, { policy }).valid, false);
  const badStatus = { ...base, needBlend: [{ name: "x", weight: 0.5, status: "guessed" }] };
  assert.equal(parseSignal(badStatus, { policy }).valid, false);
});

test("schema rejects a need appearing with an affect role (need/affect separation)", () => {
  // A need item must not carry a role; additionalProperties:false enforces the separation.
  const base = signalsFixture()[0];
  const leaky = { ...base, needBlend: [{ name: "n", weight: 0.3, status: "provisional", role: "primary" }] };
  assert.equal(parseSignal(leaky, { policy }).valid, false);
});

test("schema rejects a negative weight but accepts a float in [0,1]", () => {
  const base = signalsFixture()[0];
  const neg = { ...base, affectBlend: [{ name: "x", weight: -0.1, role: "primary" }] };
  assert.equal(parseSignal(neg, { policy }).valid, false);
  const ok = { ...base, affectBlend: [{ name: "x", weight: 0.001, role: "primary" }, { name: "y", weight: 0.2, role: "opposing" }] };
  assert.equal(parseSignal(ok, { policy }).valid, true);
});

test("well-formedness warns on missing opposing (no contradiction annotated) — soft, not a rejection", () => {
  const rec = {
    recordFormatVersion: 1,
    eventId: "evt_syn_flat",
    targetMessageOrder: 1,
    needBlend: [{ name: "n", weight: 0.3, status: "provisional" }],
    affectBlend: [{ name: "cheer", weight: 0.5, role: "primary" }],
  };
  const r = parseSignal(rec, { policy });
  assert.ok(r.valid, "still schema-valid");
  assert.equal(r.contradictory, false);
  assert.ok(r.warnings.some((w) => w.code === SIGNAL_WARNING_CODES.NO_OPPOSING));
});

test("well-formedness warns on too many needs / multiple primary / masked+leak overflow / weight>1", () => {
  const rec = {
    recordFormatVersion: 1,
    eventId: "evt_syn_over",
    targetMessageOrder: 1,
    needBlend: [
      { name: "a", weight: 0.2, status: "provisional" },
      { name: "b", weight: 0.2, status: "provisional" },
      { name: "c", weight: 0.2, status: "provisional" },
      { name: "d", weight: 0.2, status: "provisional" }
    ],
    affectBlend: [
      { name: "p1", weight: 1.5, role: "primary" },
      { name: "p2", weight: 0.2, role: "primary" },
      { name: "o", weight: 0.2, role: "opposing" },
      { name: "m1", weight: 0.1, role: "masked" },
      { name: "m2", weight: 0.1, role: "masked" },
      { name: "l1", weight: 0.1, role: "leak" }
    ],
  };
  const w = analyzeWellFormedness(rec, policy).map((x) => x.code);
  assert.ok(w.includes(SIGNAL_WARNING_CODES.NEED_BLEND_TOO_MANY));
  assert.ok(w.includes(SIGNAL_WARNING_CODES.MULTIPLE_PRIMARY));
  assert.ok(w.includes(SIGNAL_WARNING_CODES.MASKED_LEAK_TOO_MANY));
  assert.ok(w.includes(SIGNAL_WARNING_CODES.WEIGHT_ABOVE_ONE));
});

test("batch parse enforces unique (eventId, targetMessageOrder)", () => {
  const recs = signalsFixture();
  const dup = { ...recs[0] };
  const res = parseSignalBatch([recs[0], dup, recs[1]], { policy });
  assert.equal(res.valid, false);
  assert.ok(res.problems.some((p) => p.code === "SIG_DUP_TARGET"));
});

test("contradictory + coactivation helpers are pure and deterministic", () => {
  const rec = signalsFixture()[0];
  assert.equal(contradictoryAffectPresence(rec), true);
  assert.equal(emotionCoactivationCount(rec), 4);
  // idempotent
  assert.equal(contradictoryAffectPresence(rec), true);
});

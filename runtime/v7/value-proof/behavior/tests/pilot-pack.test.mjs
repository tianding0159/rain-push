import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { selectPilot, buildPrivatePack, buildPublicSkeleton, PILOT_SIZE, PILOT_SEED } from "../lib/pilot-pack.mjs";

// Build a synthetic record set (no corpus dependency) shaped like raw-corpus records.
function synthRecords(n) {
  const recs = [];
  for (let i = 0; i < n; i++) {
    const text = "utterance-" + i;
    recs.push({
      order: i + 1,
      speaker: "糖糖",
      text,
      hash: createHash("sha256").update("糖糖\u241f" + text).digest("hex"),
      punct: { len: text.length, excl: 0, ques: 0, ellipsis: 0, comma: 0, period: 0, hasTilde: false },
    });
  }
  return recs;
}

test("selectPilot is deterministic for a fixed seed", () => {
  const recs = synthRecords(200);
  const a = selectPilot(recs, { seed: PILOT_SEED }).map((r) => r.hash);
  const b = selectPilot(recs, { seed: PILOT_SEED }).map((r) => r.hash);
  assert.deepEqual(a, b);
});

test("different seeds generally select a different pilot set", () => {
  const recs = synthRecords(200);
  const a = selectPilot(recs, { seed: 1 }).map((r) => r.hash).join(",");
  const b = selectPilot(recs, { seed: 2 }).map((r) => r.hash).join(",");
  assert.notEqual(a, b);
});

test("selectPilot returns exactly PILOT_SIZE when the corpus is larger", () => {
  const recs = synthRecords(200);
  assert.equal(selectPilot(recs).length, PILOT_SIZE);
});

test("selectPilot returns all records when the corpus is smaller than PILOT_SIZE", () => {
  const recs = synthRecords(10);
  assert.equal(selectPilot(recs).length, 10);
});

test("buildPrivatePack INCLUDES text and is marked DO_NOT_COMMIT", () => {
  const pack = buildPrivatePack(synthRecords(60));
  assert.equal(pack.visibility, "PRIVATE_DO_NOT_COMMIT");
  assert.equal(pack.size, PILOT_SIZE);
  assert.ok(pack.items.every((it) => typeof it.text === "string" && it.text.length > 0));
});

test("buildPublicSkeleton carries NO text and is safe to commit", () => {
  const skel = buildPublicSkeleton(synthRecords(60), { rounds: 2 });
  assert.equal(skel.visibility, "PUBLIC_NO_TEXT");
  const blob = JSON.stringify(skel);
  assert.ok(!blob.includes("utterance-"), "skeleton must not leak any text");
  // one stub per record per round
  assert.equal(skel.annotationStubs.length, PILOT_SIZE * 2);
  // redacted records expose only hash/order/punct/speaker
  for (const r of skel.records) assert.ok(!("text" in r));
});

test("skeleton stubs reference the same record hashes as the private pack (same selection)", () => {
  const recs = synthRecords(60);
  const priv = buildPrivatePack(recs);
  const skel = buildPublicSkeleton(recs, { rounds: 1 });
  const privHashes = priv.items.map((i) => i.hash).sort();
  const skelHashes = skel.records.map((r) => r.hash).sort();
  assert.deepEqual(privHashes, skelHashes);
});

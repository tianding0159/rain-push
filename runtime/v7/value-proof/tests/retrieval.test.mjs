import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { retrieve, RETRIEVAL_EXCLUSION_CODES } from "../lib/retrieval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
function corpus() {
  const raw = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "synthetic", "retrieval-corpus.json"), "utf8"));
  return { registry: raw.registry.sources, events: raw.events };
}

const QUERY = { text: "obtain a concrete evaluation feedback specificity", channel: "jine", mode: "living" };

test("suspected_ai source is quarantined — never retrieved, always excluded", () => {
  const c = corpus();
  const { references, excluded } = retrieve(QUERY, c);
  assert.ok(!references.some((r) => r.eventId === "evt_ret_tainted"), "tainted event must not be retrieved");
  assert.ok(excluded.some((e) => e.eventId === "evt_ret_tainted" && e.code === RETRIEVAL_EXCLUSION_CODES.QUARANTINED));
});

test("references carry message hashes + a provenance-permitted usage, never verbatim text", () => {
  const c = corpus();
  const { references } = retrieve(QUERY, c);
  const serialized = JSON.stringify(references);
  for (const ev of c.events) {
    for (const m of ev.messages) assert.ok(!serialized.includes(m.text), `verbatim leaked: ${m.text}`);
  }
  const canon = references.find((r) => r.eventId === "evt_ret_canon");
  assert.ok(canon, "C1 event should be retrieved for a matching query");
  assert.ok(["behavior", "wording", "mechanics"].includes(canon.usage));
  assert.ok(canon.messageHashes.every((h) => /^[0-9a-f]{64}$/.test(h)));
});

test("C1 (behavior) outranks C3 (wording-only) for the same query — C3 cannot override C1", () => {
  const c = corpus();
  const { references } = retrieve(QUERY, c, { topK: 5 });
  const canonIdx = references.findIndex((r) => r.eventId === "evt_ret_canon");
  const commIdx = references.findIndex((r) => r.eventId === "evt_ret_community");
  assert.ok(canonIdx !== -1);
  // The C1 event scores higher (behavior primitives + functionalNeed overlap), so it ranks
  // ahead of the C3 wording sample.
  if (commIdx !== -1) assert.ok(canonIdx < commIdx, "C1 must rank ahead of C3");
});

test("C3 toggle: includeC3:false removes community sources and drops c3Influence to 0", () => {
  const c = corpus();
  const withC3 = retrieve(QUERY, c, { includeC3: true });
  const withoutC3 = retrieve(QUERY, c, { includeC3: false });
  assert.ok(withC3.references.some((r) => r.eventId === "evt_ret_community") || withC3.c3Influence >= 0);
  assert.ok(!withoutC3.references.some((r) => r.eventId === "evt_ret_community"));
  assert.equal(withoutC3.c3Influence, 0);
  assert.ok(withoutC3.excluded.some((e) => e.code === RETRIEVAL_EXCLUSION_CODES.C3_DISABLED));
});

test("usage filter respects provenance: a wording query never returns C2 (mechanics-only)", () => {
  const c = corpus();
  const { references } = retrieve(QUERY, c, { usage: "wording" });
  assert.ok(!references.some((r) => r.eventId === "evt_ret_guide"), "C2 has no wording capability");
});

test("retrieval is deterministic — identical references across runs", () => {
  const c = corpus();
  const a = retrieve(QUERY, c);
  const b = retrieve(QUERY, c);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("source distribution counts retrieved layers", () => {
  const c = corpus();
  const { sourceDistribution } = retrieve(QUERY, c);
  assert.ok((sourceDistribution.C1 || 0) >= 1);
  assert.equal(sourceDistribution.C1_TAINTED, undefined);
});

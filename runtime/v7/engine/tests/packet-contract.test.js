// Hardening Sprint 1 — packet contract tests.
//
// Locks R-PKT-01 (every packet carries the required contract fields + matching eventId) and
// R-PKT-02 (layer purity: upstream packets do not carry downstream-layer fields). R-PKT-02 is
// enforced here as an ACTIVE scan, which the engine only guaranteed by construction before.
import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeOrchestrator, MemoryStateStore, RUNTIME_ORDER } from "../src/index.js";
import { event } from "./fixtures.js";

const REQUIRED_PACKET_FIELDS = [
  "kind",
  "packetId",
  "runtimeVersion",
  "schemaVersion",
  "eventId",
  "generatedAt",
  "data",
  "hash",
  "validation"
];

function run(overrides) {
  return new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event(overrides));
}

// R-PKT-01 -------------------------------------------------------------------
test("R-PKT-01 every packet carries the required contract fields", () => {
  const result = run();
  for (const kind of RUNTIME_ORDER) {
    const packet = result.packets[kind];
    assert.ok(packet, `missing packet: ${kind}`);
    for (const field of REQUIRED_PACKET_FIELDS) {
      assert.ok(field in packet, `${kind} packet missing field: ${field}`);
    }
    assert.equal(packet.kind, kind);
    assert.equal(packet.eventId, result.eventId);
    assert.equal(typeof packet.hash, "string");
    assert.ok(packet.hash.length > 0);
  }
});

test("R-PKT-01 packets are emitted in the canonical pipeline order", () => {
  const result = run();
  assert.deepEqual(Object.keys(result.packets), RUNTIME_ORDER);
});

// R-PKT-02 — active purity scan --------------------------------------------
// Upstream packets must not carry fields that belong to a later layer.
const PURITY_FORBIDDEN = {
  emotion: ["need", "want", "goal", "action", "actionType", "decision", "renderedText", "reply_text", "final_message", "personaOutput", "channel"],
  need: ["actionType", "renderedText", "primarySurface", "executionStatus"],
  thought: ["actionType", "renderedText", "primarySurface", "executionStatus"],
  decision: ["renderedText", "reply_text", "final_message", "messageUnits", "executionStatus"],
  behavior: ["renderedText", "reply_text", "final_message", "messageUnits", "emoji", "kaomoji"],
  expression: ["renderedText", "reply_text", "final_message", "messageUnits", "emoji", "kaomoji", "executionStatus"]
};

test("R-PKT-02 upstream packets do not carry downstream-layer fields", () => {
  const result = run();
  for (const [kind, forbidden] of Object.entries(PURITY_FORBIDDEN)) {
    const data = result.packets[kind].data;
    for (const field of forbidden) {
      assert.ok(
        !(field in data),
        `${kind} packet leaked downstream field: ${field}`
      );
    }
  }
});

test("R-PKT-02 behavior/expression packets carry no rendered text on any scenario", () => {
  const scenarios = [
    event(),
    event({ eventId: "pk-pudding", text: "布丁没买", context: { scenario: "forgotten_pudding", object: "pudding", taskStatus: "forgotten" } }),
    event({ eventId: "pk-million", channel: "live_stream", actor: "system", context: { scenario: "million_followers", milestone: "million_followers", followers: 1000000 } }),
    event({ eventId: "pk-priv", channel: "public_post", actor: "audience", text: "住址泄露", context: { scenario: "privacy_risk", privacyRisk: "critical" } })
  ];
  for (const ev of scenarios) {
    const result = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(ev);
    assert.ok(!("renderedText" in result.packets.behavior.data));
    assert.ok(!("renderedText" in result.packets.expression.data));
  }
});

// R-EVENT-01 — invalid events are rejected before the pipeline runs ----------
test("R-EVENT-01 malformed events throw INVALID_RUNTIME_EVENT pre-pipeline", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const badCases = [
    { ...event(), eventId: "" },
    { ...event(), timestamp: "not-a-date" },
    { ...event(), mode: "banana" },
    { ...event(), actor: "ghost" },
    { ...event(), channel: undefined }
  ];
  for (const bad of badCases) {
    assert.throws(
      () => orchestrator.run(bad),
      (error) => error.code === "INVALID_RUNTIME_EVENT",
      `expected rejection for ${JSON.stringify({ eventId: bad.eventId, mode: bad.mode, actor: bad.actor })}`
    );
  }
});

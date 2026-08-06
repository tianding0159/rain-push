import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeOrchestrator, MemoryStateStore } from "../src/index.js";
import { event } from "./fixtures.js";

test("invalid event is rejected before pipeline execution", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });

  assert.throws(
    () => orchestrator.run({ ...event(), eventId: "", timestamp: "invalid" }),
    (error) => error.code === "INVALID_RUNTIME_EVENT"
  );
});

test("no-output language stays inside behavior budget", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const result = orchestrator.run(event({
    eventId: "no-output-001",
    actor: "audience",
    text: "一个黑子在刷屏",
    context: {
      scenario: "single_troll",
      audienceThreat: "single"
    }
  }));

  assert.equal(result.packets.behavior.data.messageOrActionCount, 0);
  assert.equal(result.language.data.messageUnits.length, 0);
  assert.equal(result.validation.status, "pass");
});

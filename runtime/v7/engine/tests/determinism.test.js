import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeOrchestrator, MemoryStateStore } from "../src/index.js";
import { event } from "./fixtures.js";

test("same event and fresh state produce identical pipeline hash and text", () => {
  const first = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event());
  const second = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event());

  assert.equal(first.pipelineHash, second.pipelineHash);
  assert.equal(first.language.hash, second.language.hash);
  assert.equal(first.language.data.renderedText, second.language.data.renderedText);
});

test("different seed changes packet identities without changing semantic output", () => {
  const first = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event({ seed: "a" }));
  const second = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event({ seed: "b" }));

  assert.notEqual(first.pipelineHash, second.pipelineHash);
  assert.equal(first.language.data.renderedText, second.language.data.renderedText);
});

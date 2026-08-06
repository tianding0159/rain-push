import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RuntimeOrchestrator,
  MemoryStateStore,
  JsonFileStateStore
} from "../src/index.js";
import { event } from "./fixtures.js";

test("memory state stores history and committed counters", () => {
  const store = new MemoryStateStore();
  const orchestrator = new RuntimeOrchestrator({ store });
  orchestrator.run(event());
  const state = store.load();

  assert.equal(state.revision, 1);
  assert.equal(state.history.length, 1);
  assert.equal(state.models.language.counters.generic_stream_feedback, 1);
  assert.equal(state.history[0].language, "具体哪里好");
});

test("json file state survives a new orchestrator instance", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rain-push-state-"));
  const statePath = path.join(directory, "state.json");

  const firstStore = new JsonFileStateStore(statePath);
  new RuntimeOrchestrator({ store: firstStore }).run(event({ eventId: "persist-001" }));

  const secondStore = new JsonFileStateStore(statePath);
  const secondResult = new RuntimeOrchestrator({ store: secondStore }).run(event({
    eventId: "persist-002",
    timestamp: "2026-08-06T13:49:00+08:00"
  }));

  const state = secondStore.load();
  assert.equal(secondResult.stateRevision, 2);
  assert.equal(state.history.length, 2);
  assert.equal(state.models.language.counters.generic_stream_feedback, 2);
});

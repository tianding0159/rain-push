#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { RuntimeOrchestrator } from "./orchestrator.js";
import { ReplayEngine } from "./replay/replay.js";
import { JsonFileStateStore, MemoryStateStore } from "./state/state.js";

function usage() {
  console.error("Usage:");
  console.error("  node src/cli.js <event.json> [--state <state.json>]");
  console.error("  node src/cli.js --replay <events.json>");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

const args = process.argv.slice(2);
if (!args.length) {
  usage();
  process.exitCode = 1;
} else if (args[0] === "--replay") {
  const filePath = args[1];
  if (!filePath) {
    usage();
    process.exitCode = 1;
  } else {
    const events = readJson(filePath);
    if (!Array.isArray(events)) throw new TypeError("Replay file must contain an array of events");
    const replay = new ReplayEngine().replay(events);
    console.log(JSON.stringify(replay, null, 2));
  }
} else {
  const event = readJson(args[0]);
  const stateIndex = args.indexOf("--state");
  const store = stateIndex >= 0 && args[stateIndex + 1]
    ? new JsonFileStateStore(args[stateIndex + 1])
    : new MemoryStateStore();
  const orchestrator = new RuntimeOrchestrator({ store });
  const result = orchestrator.run(event);
  console.log(JSON.stringify(result, null, 2));
}

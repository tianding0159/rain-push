import test from "node:test";
import assert from "node:assert/strict";
import { ReplayEngine } from "../src/index.js";
import { event } from "./fixtures.js";

test("replay is deterministic across fresh runs", () => {
  const events = [
    event({ eventId: "replay-1" }),
    event({
      eventId: "replay-2",
      timestamp: "2026-08-06T14:00:00+08:00",
      text: "布丁没买",
      context: {
        scenario: "forgotten_pudding",
        object: "pudding",
        taskStatus: "forgotten"
      }
    })
  ];

  const engine = new ReplayEngine();
  const first = engine.replay(events);
  const expectedHashes = first.results.map((result) => result.pipelineHash);
  const verification = engine.verify(events, expectedHashes);

  assert.equal(verification.status, "match");
  assert.equal(verification.mismatches.length, 0);
});

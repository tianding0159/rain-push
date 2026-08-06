import { RuntimeOrchestrator } from "../orchestrator.js";
import { MemoryStateStore, createInitialState } from "../state/state.js";
import { hashValue } from "../util.js";

export class ReplayEngine {
  constructor(options = {}) {
    this.orchestratorFactory = options.orchestratorFactory ?? (() =>
      new RuntimeOrchestrator({
        store: new MemoryStateStore(createInitialState()),
        strict: true,
        commitUpdates: true
      })
    );
  }

  replay(events) {
    const orchestrator = this.orchestratorFactory();
    const results = events.map((event) => orchestrator.run(event));
    return {
      eventCount: events.length,
      results,
      replayHash: hashValue(results.map((result) => result.pipelineHash), 40)
    };
  }

  verify(events, expectedHashes) {
    const replay = this.replay(events);
    const actual = replay.results.map((result) => result.pipelineHash);
    const mismatches = actual
      .map((hash, index) => ({
        index,
        expected: expectedHashes[index],
        actual: hash
      }))
      .filter((entry) => entry.expected !== entry.actual);

    return {
      status: mismatches.length ? "mismatch" : "match",
      mismatches,
      actual,
      replayHash: replay.replayHash
    };
  }
}

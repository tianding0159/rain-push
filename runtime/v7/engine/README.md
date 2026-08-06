# rain-push v7 Executable Runtime

Phase 12 turns the Phase 1–11 specifications into a runnable deterministic JavaScript reference engine.

## What is executable

```text
Knowledge
→ Continuity
→ Relationship
→ Meaning
→ Emotion
→ Need
→ Thought
→ Decision
→ Behavior
→ Expression
→ Language
```

Every stage produces:

- a versioned Packet
- deterministic Packet ID and SHA-256-derived hash
- confidence
- trace data
- validation status
- update proposals

The Orchestrator then:

1. validates the event
2. detects typed signals
3. executes all eleven runtimes in order
4. validates cross-packet boundaries
5. commits allowed update queues
6. persists state
7. emits a deterministic pipeline hash
8. returns final language without claiming execution

## Requirements

- Node.js 20 or newer
- no npm dependencies
- no network access required

## Quick start

```bash
cd runtime/v7/engine
npm test
npm run demo
```

The demo input is:

```text
examples/sample-event.json
```

The final rendered output is available at:

```text
result.language.data.renderedText
```

## CLI

Run one stateless event:

```bash
node src/cli.js examples/sample-event.json
```

Run with persistent JSON state:

```bash
node src/cli.js examples/sample-event.json \
  --state examples/demo-state.json
```

Replay a sequence:

```bash
node src/cli.js --replay examples/replay-events.json
```

## JavaScript API

```js
import {
  RuntimeOrchestrator,
  MemoryStateStore
} from "./src/index.js";

const orchestrator = new RuntimeOrchestrator({
  store: new MemoryStateStore()
});

const result = orchestrator.run({
  eventId: "feedback-001",
  timestamp: "2026-08-06T13:48:00+08:00",
  mode: "living",
  channel: "jine_private",
  actor: "partner",
  text: "很强",
  context: {
    scenario: "generic_stream_feedback"
  },
  seed: "example"
});

console.log(result.language.data.renderedText);
// 具体哪里好
```

## Event contract

```json
{
  "eventId": "string",
  "timestamp": "ISO-8601 datetime",
  "mode": "canon | living",
  "channel": "jine_private | live_stream | public_post | face_to_face | physical_world | internal_wait | no_channel",
  "actor": "partner | character | audience | system",
  "text": "optional text",
  "signals": ["optional explicit signal"],
  "context": {
    "scenario": "optional typed scenario",
    "priorNotice": false,
    "promiseStatus": "none | overdue",
    "promiseDueAt": "optional ISO datetime",
    "privacyRisk": "none | low | medium | high | critical",
    "audienceThreat": "none | single | low | medium | high | critical",
    "fatigue": 0,
    "milestone": "optional milestone",
    "object": "optional object",
    "taskStatus": "optional task status"
  },
  "seed": "deterministic seed"
}
```

Explicit signals and typed context are preferred for production integrations. Text heuristics are a fallback.

## Built-in executable scenario families

The reference engine currently has first-class behavior for:

- generic stream feedback
- specific feedback
- prior-notice waiting
- overdue promises and exact-time clarification
- ordinary pudding and household omissions
- post-stream fatigue and live-to-private transition
- audience milestones
- low-value trolls
- privacy and doxxing risk
- autonomy and control overreach
- contextual dark humor
- contextual sexual jokes
- contextual drug references
- hunger and illness boundaries

The runtime is deliberately rule-based and inspectable. It is an executable reference implementation of the architecture, not a general-purpose language model.

## State

Two stores are included:

```js
MemoryStateStore
JsonFileStateStore
```

State contains:

- revision
- per-runtime counters and patterns
- bounded event history
- pending rejected updates
- last Packet hashes

## Update queues

Each runtime may propose changes only inside its own model namespace.

Allowed operations:

- `increment`
- `set`
- `append_unique`

Cross-runtime writes, excessive deltas, missing evidence, and Canon-only writes in Living Mode are rejected.

## Execution boundary

Language output is always marked:

```text
executionStatus: not_executed
```

The engine never pretends that a message was sent, a post was published, or moderation occurred.

External actions pass through `ExecutionBoundary`, which supports:

- allowlisting
- dry-run mode
- confirmation requirements
- injected execution handlers
- explicit blocked / not_executed / executed / failed states

Dry-run is the default.

## Determinism

Given the same:

- event
- initial state
- runtime version
- seed

the engine produces the same:

- Packet IDs
- Packet hashes
- rendered language
- segmentation
- update proposals
- pipeline hash

## Tests

```bash
npm test
```

Current executable suite:

- 16 baseline integration tests
- 100 scenario conformance tests
- 50 property conformance tests
- 166 baseline total
- 57 Hardening Sprint 1 contract tests (parity-contract 26, packet-contract 5,
  spec-coverage 10, schema-field-map 7, runtime-contract-map 9)
- 223 total
- 223 passing

See `TEST_REPORT.md`.

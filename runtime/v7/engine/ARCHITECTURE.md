# Phase 12 Architecture

## 1. Runtime topology

```text
RuntimeEvent
   |
   v
Signal Detector
   |
   v
Runtime Orchestrator
   |
   +-- Knowledge Runtime
   +-- Continuity Runtime
   +-- Relationship Runtime
   +-- Meaning Runtime
   +-- Emotion Runtime
   +-- Need Runtime
   +-- Thought Runtime
   +-- Decision Runtime
   +-- Behavior Runtime
   +-- Expression Runtime
   +-- Language Runtime
   |
   v
Pipeline Validator
   |
   +-- Update Queue Commit Engine
   +-- State Store
   +-- Runtime Bus
   +-- Structured Logger
   |
   v
PipelineResult
```

## 2. Module map

```text
src/
├── cli.js
├── constants.js
├── index.js
├── orchestrator.js
├── packet.js
├── registry.js
├── runtime-bus.js
├── signals.js
├── update-queue.js
├── util.js
├── validators.js
├── types.d.ts
├── execution/
│   └── execution-boundary.js
├── logging/
│   └── logger.js
├── replay/
│   └── replay.js
├── state/
│   └── state.js
└── runtimes/
    ├── common.js
    ├── knowledge.js
    ├── continuity.js
    ├── relationship.js
    ├── meaning.js
    ├── emotion.js
    ├── need.js
    ├── thought.js
    ├── decision.js
    ├── behavior.js
    ├── expression.js
    └── language.js
```

## 3. Deterministic execution

The engine avoids current-time reads during Packet generation.

`generatedAt` comes from the input event.

Packet identities depend on:

- event ID
- runtime kind
- seed
- Packet data

Pipeline identity depends on the ordered Packet hashes.

## 4. Runtime context

Every runtime receives:

```js
{
  event,
  state,
  signals,
  packets
}
```

A runtime can read only already-completed upstream Packets.

The registry order is fixed.

## 5. Rule isolation

Each Phase runtime implements only its own responsibility.

Examples:

- Need Runtime does not choose an action.
- Decision Runtime does not choose wording.
- Behavior Runtime does not render language.
- Language Runtime does not claim execution.

Cross-packet validation catches major boundary violations.

## 6. State strategy

State is loaded before the pipeline and saved after validation.

Updates are staged in each Packet and committed together after all runtimes finish.

This prevents a halfway-completed event from mutating persistent state.

## 7. Error strategy

Invalid input throws before the pipeline.

Strict mode throws on cross-packet validation failure.

Non-strict mode may return a rejected result for debugging.

## 8. Extension points

### Add a scenario

1. add typed signal detection in `signals.js`
2. add meaning, emotion, need, thought, decision, behavior, expression, and language rules
3. add executable fixtures
4. add privacy and boundary assertions
5. run the complete suite

### Replace a runtime

Use the same Packet contract and register the replacement in `registry.js`.

### Add storage

Implement:

```js
load()
save(state)
reset()
```

### Add execution handlers

Inject handlers into `ExecutionBoundary`.

Handlers remain outside character generation.

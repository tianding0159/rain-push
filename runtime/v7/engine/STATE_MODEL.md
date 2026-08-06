# State Model

## Shape

```js
{
  engineVersion,
  revision,
  models: {
    knowledge,
    continuity,
    relationship,
    meaning,
    emotion,
    need,
    thought,
    decision,
    behavior,
    expression,
    language
  },
  history,
  pendingUpdates,
  lastPackets
}
```

Each runtime model currently contains:

```js
{
  counters: {},
  patterns: {},
  memory: []
}
```

## History

History is bounded to 500 entries.

Each entry stores:

- event ID
- timestamp
- mode
- channel
- detected signals
- scenario
- rendered language
- render status
- Packet hashes
- pending thought questions

## Update transaction

```text
run all runtimes
→ validate pipeline
→ collect update proposals
→ validate update ownership and caps
→ commit allowed updates
→ store rejected updates
→ increment revision
→ append history
→ save state
```

## Stores

### MemoryStateStore

For tests, ephemeral sessions, and embedded applications.

### JsonFileStateStore

For local development and deterministic state inspection.

Writes use a temporary file followed by rename.

## Production adapters

A production store can use:

- SQLite
- PostgreSQL
- Redis
- durable object storage
- event sourcing

The store should preserve atomic event commits and deterministic replay inputs.

# Packet Contracts

## Generic Packet

```js
{
  kind,
  packetId,
  runtimeVersion,
  schemaVersion,
  eventId,
  generatedAt,
  mode,
  confidence,
  data,
  updates,
  trace,
  validation,
  hash
}
```

## Required invariants

- `kind` matches the registry stage.
- `eventId` matches the input event.
- `generatedAt` equals the event timestamp.
- `hash` is deterministic.
- `data` is serializable.
- `updates` target only the owning runtime.
- `validation.status` is explicit.

## Pipeline order

```text
knowledge
continuity
relationship
meaning
emotion
need
thought
decision
behavior
expression
language
```

## Language execution invariant

```js
languagePacket.data.executionStatus === "not_executed"
```

## No-output invariant

When Behavior selects:

- wait
- no action
- silent observation

Language must emit:

```js
{
  renderStatus: "no_output",
  renderedText: null,
  messageUnits: []
}
```

## Message budget invariant

```text
language.messageUnits.length
<=
behavior.messageOrActionCount
```

## Public privacy invariant

Public language may not contain:

- exact private promise
- private location
- private real name
- intimate details
- unverified motive

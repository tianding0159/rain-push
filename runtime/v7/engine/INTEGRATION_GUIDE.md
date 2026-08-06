# Integration Guide

## 1. App loop

```js
const result = orchestrator.run(event);

if (result.language.data.renderStatus === "rendered") {
  showDraft(result.language.data.renderedText);
}
```

## 2. Stateful session

```js
const store = new JsonFileStateStore("./state.json");
const orchestrator = new RuntimeOrchestrator({ store });
```

## 3. Dry-run delivery preview

```js
const preview = await orchestrator.execute({
  requestId: result.eventId,
  action: "preview_message",
  target: "豆豆",
  content: result.language.data.renderedText,
  confirmed: true
});
```

Default result:

```js
{
  status: "not_executed",
  reason: "dry_run"
}
```

## 4. Production execution adapter

```js
const boundary = new ExecutionBoundary({
  dryRun: false,
  allowedActions: ["request_delivery"],
  handlers: {
    async request_delivery(request) {
      return messagingConnector.send(request.content);
    }
  }
});
```

Keep connector credentials and retries outside the runtime package.

## 5. Weather app integration

The event context can include weather information:

```json
{
  "context": {
    "weather": {
      "condition": "rain",
      "temperatureC": 21,
      "forecastWindow": "morning"
    },
    "topic": "weather"
  }
}
```

Add typed weather signals and language rules before treating weather data as character meaning.

Do not allow weather alone to create relationship or crisis escalation.

## 6. LLM hybrid mode

The deterministic runtime can be used as a policy and Packet generator before an LLM renderer.

Recommended pattern:

```text
deterministic Phase 1–10 Packets
→ constrained LLM candidate generation
→ Phase 11 validator
→ privacy redaction
→ execution boundary
```

The LLM must not override Behavior, disclosure, or message budgets.

## 7. Replay

Store original RuntimeEvents.

Use replay to detect:

- runtime changes
- output drift
- Packet-hash changes
- state migration problems
- nondeterminism

## 8. Version migration

Persist:

- engine version
- Packet runtime versions
- schema version
- event inputs
- seed

When a schema changes, migrate state before replay.

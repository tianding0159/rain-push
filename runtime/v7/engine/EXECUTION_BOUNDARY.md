# Execution Boundary

## Principle

Generation and execution are separate systems.

The runtime may produce:

- a final message
- a public-post draft
- a moderation request
- a scheduling request

It may not report these as executed until an external handler confirms execution.

## Default state

```js
new ExecutionBoundary({ dryRun: true })
```

Every allowed request returns:

```js
{
  status: "not_executed",
  reason: "dry_run"
}
```

## Action lifecycle

```text
generated request
→ allowlist check
→ dry-run check
→ confirmation check
→ handler availability
→ handler execution
→ explicit result
```

## Status set

```yaml
blocked:
not_executed:
executed:
failed:
```

## Safe integration rule

Never use `renderedText` as proof that a message was delivered.

Use an external connector result and store its execution receipt separately.

## Confirmation

Writes should require explicit confirmation unless the enclosing application has a separately reviewed policy.

## Logging

Do not log unredacted sensitive content inside execution receipts.

# Phase 11 to Phase 12 Migration Notes

## Before

Phase 1–11 consisted of:

- specifications
- schemas
- DSL rules
- examples
- scenario manifests
- validator matrices

## After

Phase 12 adds:

- executable JavaScript modules
- deterministic Orchestrator
- Packet registry
- cross-packet validation
- state stores
- update-queue commit engine
- structured runtime bus
- logging adapters
- replay engine
- execution boundary
- CLI
- executable tests

## Compatibility

The implementation preserves the conceptual Packet chain and version labels.

The implementation Packet fields use JavaScript camelCase inside `data`, while the specification documents may use YAML snake_case.

Production adapters may add a serialization mapper when exact schema-key parity is required.

## Reference implementation scope

The engine is intentionally inspectable and dependency-free.

It implements representative rule families and architectural invariants.

New domain breadth should be added through typed signals, runtime rules, and executable fixtures rather than silent fallback invention.

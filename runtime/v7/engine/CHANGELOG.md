# Changelog

## Hardening Sprint 1 — Spec–Engine Parity Audit

No engine behavior changed. This sprint audits Phase 1–11 spec-to-engine parity and locks the
high-risk invariants with executable contract tests.

Added:

- `parity/parity-matrix.json` (SSOT) + generated `parity/parity-matrix.md` — 26 requirements with
  implementation status, severity, validator, and test linkage
- `parity/schema-field-map.json` — per-packet spec-field vs emitted-field map
- `parity/runtime-contract-map.json` — per-runtime inputs/outputs/enforced contracts
- `parity/high-risk-gaps.md` — risk ranking + the one residual gap (R-DARK-01 drug restraint)
- `tests/parity-contract.test.js` — 26 high-risk invariant tests (negative tests forge violations)
- `tests/packet-contract.test.js` — 5 packet-shape + active purity-scan tests
- `tests/spec-coverage.test.js` — 10 parity-matrix integrity tests (incl. mutation-sensitive phase partition)
- `tests/schema-field-map.test.js` — 7 tests: field map equals live engine field union
- `tests/runtime-contract-map.test.js` — 9 tests: contract-map order/entry/output/status parity
- `parity/actual-packet-fields.json` — ground-truth field union from real execution
- `parity/build-schema-field-map.mjs`, `parity/build-runtime-contract-map.mjs` — deterministic rebuilders

Validation:

- tests: 223 pass / 0 fail (166 baseline preserved + 57 new)
- mutation check: disabling the execution-boundary check fails exactly one test; restoring is green
- no source under `src/` changed (verified: clean git diff)

Correction:

- Pre-Sprint-1 docs implied full dark/adult/drug restraint. Verified: dark_humor and sexual_joke
  are restrained (meaning/emotion blocks). R-DARK-01 is reframed as a **bidirectional
  sensitive-input gate**: the over-escalation direction is enforced for dark & sexual, but the
  under-handling direction is missing (drug_reference has no first-class block). Substatus:
  bidirectional-gate-missing.
- Field maps corrected: earlier schema-field-map / runtime-contract-map listed spec field names
  as "emitted" fields for several packets. Both are now regenerated from real engine output
  (actual-packet-fields.json) and locked by tests.

## Phase 12 Changelog

## 7.0.0-phase12 Complete

Delivered:

- executable zero-dependency JavaScript runtime
- eleven-stage deterministic Orchestrator
- versioned and hashed Packets
- typed signal detector
- runtime registry and event bus
- cross-packet validator
- in-memory and JSON-file state stores
- evidence-gated update-queue commit engine
- JSONL and in-memory loggers
- deterministic replay engine
- dry-run execution boundary
- CLI and examples
- generated sample output
- 16 baseline integration tests
- 100 executable scenario tests
- 50 executable property tests
- 166 of 166 tests passing

Validation:

- JavaScript runtime tests: pass
- JSON parse errors: 0
- cumulative YAML parse errors: 0
- external execution default: not_executed

Implementation scope:

This is an executable, deterministic, inspectable reference engine for the typed scenario families included in Phase 12. It is not a general-purpose language model and does not silently invent unsupported domain behavior.

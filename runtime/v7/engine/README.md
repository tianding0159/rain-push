# runtime/v7/engine — reviewable surface

The full v7 character-runtime engine (orchestrator, 11 runtime modules, validators,
state stores, and its complete test suite) ships as the versioned deliverable
`rain-push-v7-claude-handoff.zip` at the repository root. It is self-contained and
zero-dependency: unzip it and run `npm test` inside `runtime/v7/engine/`.

This directory surfaces the **Hardening Sprint 1 — Spec–Engine Parity Audit** artifacts as
plain text so they can be reviewed line-by-line in the pull request (a zip blob cannot).
The identical files also live inside the zip; this is a review convenience copy, not a second
source of truth.

## Scope (read this first)

This audit is **not** an exhaustive line-by-line audit of every Phase 1–11 requirement. It
covers **26 high-risk requirements selected across the phases** — the invariants whose
violation would be safety-, privacy-, or correctness-critical (execution boundary, privacy
redaction, message budget, no-surface, update gating, determinism, escalation restraint,
naming). Lower-risk and purely descriptive spec fields are intentionally out of scope for
Sprint 1. The 26 requirements span the pipeline but do not enumerate every field of every
packet; the field-level picture lives in `schema-field-map.json`.

## Review these

- `parity/parity-matrix.md` — human-readable parity matrix (generated from the JSON SSOT)
- `parity/parity-matrix.json` — machine-readable SSOT: **26 high-risk cross-phase
  requirements** with implementation status, severity, validator, and test linkage
- `parity/high-risk-gaps.md` — risk ranking + the residual high-risk gap (R-DARK-01, a
  bidirectional sensitive-input gate with one direction still missing)
- `parity/actual-packet-fields.json` — ground truth: the field union the engine actually
  emits, captured from real execution over every fixture (regenerate via
  `tests/gen-actual-fields.mjs`; never hand-edit)
- `parity/schema-field-map.json` — per-packet map with four field categories:
  `actualFields` (ground truth) / `specFields` / `mappedFields` / `specOnlyFields`
  (+ `engineOnlyFields`); rebuilt via `parity/build-schema-field-map.mjs`
- `parity/runtime-contract-map.json` — per-runtime inputs, **real** output fields, and
  contracts tagged `enforced` / `constructed` / `tested_only` / `specification_only`;
  rebuilt via `parity/build-runtime-contract-map.mjs`
- `tests/parity-contract.test.js` — 26 high-risk invariant tests (negative tests forge a
  violation and assert the pipeline validator rejects it)
- `tests/packet-contract.test.js` — 5 packet-shape + active purity-scan tests
- `tests/spec-coverage.test.js` — parity-matrix integrity tests, including a
  mutation-sensitive phase-coverage partition (dedicated vs cross-only phases)
- `tests/schema-field-map.test.js` — asserts `schema-field-map` actualFields equal the live
  engine field union (runs the engine, not a static table)
- `tests/runtime-contract-map.test.js` — asserts pipeline order, entry files, output-field
  parity, and that each contract's status is backed (enforced→validator, tested_only→test)

## Running the tests

These test files import the engine via `../src/...`, which is present **inside the zip**, not
in this reviewable-surface directory. To actually run them:

```bash
unzip rain-push-v7-claude-handoff.zip -d /tmp/engine
cd /tmp/engine/runtime/v7/engine
npm test        # 223 pass / 0 fail (166 baseline + 57 Sprint 1)
```

Sprint 1 test breakdown (57): parity-contract 26, packet-contract 5, spec-coverage 10,
schema-field-map 7, runtime-contract-map 9.

Verified: a fresh unzip runs 223/223 with no network and no dependencies.

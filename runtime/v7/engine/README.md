# runtime/v7/engine — reviewable surface

The full v7 character-runtime engine (orchestrator, 11 runtime modules, validators,
state stores, and its complete test suite) ships as the versioned deliverable
`rain-push-v7-claude-handoff.zip` at the repository root. It is self-contained and
zero-dependency: unzip it and run `npm test` inside `runtime/v7/engine/`.

This directory surfaces the **Hardening Sprint 1 — Spec–Engine Parity Audit** artifacts as
plain text so they can be reviewed line-by-line in the pull request (a zip blob cannot).
The identical files also live inside the zip; this is a review convenience copy, not a second
source of truth.

## Review these

- `parity/parity-matrix.md` — human-readable parity matrix (generated from the JSON SSOT)
- `parity/parity-matrix.json` — machine-readable SSOT: 26 requirements with implementation
  status, severity, validator, and test linkage
- `parity/high-risk-gaps.md` — risk ranking + the one residual high-risk gap (R-DARK-01)
- `parity/schema-field-map.json` — per-packet spec-field vs emitted-field map
- `parity/runtime-contract-map.json` — per-runtime inputs/outputs/enforced contracts
- `tests/parity-contract.test.js` — 26 high-risk invariant tests (negative tests forge a
  violation and assert the pipeline validator rejects it)
- `tests/packet-contract.test.js` — 5 packet-shape + active purity-scan tests
- `tests/spec-coverage.test.js` — 7 parity-matrix integrity tests

## Running the tests

These test files import the engine via `../src/...`, which is present **inside the zip**, not
in this reviewable-surface directory. To actually run them:

```bash
unzip rain-push-v7-claude-handoff.zip -d /tmp/engine
cd /tmp/engine/runtime/v7/engine
npm test        # 204 pass / 0 fail (166 baseline + 38 Sprint 1)
```

Verified: a fresh unzip runs 204/204 with no network and no dependencies.

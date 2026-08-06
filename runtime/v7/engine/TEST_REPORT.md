# Phase 12 Executable Test Report

## Environment

```text
Node.js: v22.16.0
npm: 10.9.2
Runner: node:test
Network dependencies: none
```

## Command

```bash
npm test
```

## Result

```text
tests: 166
pass: 166
fail: 0
skipped: 0
```

## Coverage groups

### Baseline integration: 16

- full pipeline
- deterministic hashes
- dry-run execution
- blocked execution
- state persistence
- update ownership
- replay verification
- invalid-event rejection

### Executable scenarios: 100

- generic feedback: 15
- prior-notice waiting: 10
- overdue promise: 10
- pudding and household omission: 10
- post-stream fatigue: 10
- million-follower milestone: 10
- single troll: 10
- privacy risk: 10
- autonomy boundary: 5
- specific feedback: 5
- context boundaries: 5

### Executable properties: 50

Properties include:

- all eleven Packets
- event-ID consistency
- deterministic hashes
- Behavior and Expression preservation
- message budgets
- no-output semantics
- local relationship reasoning
- privacy redaction
- external-action non-execution
- Ame/KAngel surface continuity
- dark-humor restraint
- adult-content restraint
- drug-reference restraint
- update queue commits
- replay determinism

## Golden runtime results

```text
generic feedback
→ 具体哪里好

overdue return time
→ 所以你到底几点回来

pudding
→ 布丁没了

pudding callback
→ 布丁库存管理又不合格

post-stream fatigue
→ 我先躺会儿，数据晚点看

million followers
→ 大家看到了吗！今天真的冲上去了！

privacy risk
→ 涉及隐私的内容全部停传。

autonomy boundary
→ 别替我决定，我自己选。
```

## Limitations verified by design

The suite does not claim that this rule engine can render every unrestricted natural-language situation.

It verifies the built-in typed scenario families, runtime boundaries, deterministic state behavior, and extensibility contract.

---

## Hardening Sprint 1 — Spec–Engine Parity Audit

### Environment (this run)

```text
Node.js: v20.20.2
Runner: node:test
Network dependencies: none
```

### Result

```text
tests: 223
pass: 223
fail: 0
skipped: 0
```

- Baseline preserved: 166 → still 166 pass, 0 fail.
- Added: 57 contract tests (parity-contract 26, packet-contract 5, spec-coverage 10,
  schema-field-map 7, runtime-contract-map 9).

### What Sprint 1 added

No engine behavior was changed. Sprint 1 added a parity audit and executable contract tests
that lock the high-risk invariants, plus a machine-readable parity matrix under `parity/`.

- `tests/parity-contract.test.js` — high-risk invariants: execution boundary, public/private
  redaction, no-surface, message budget, update-queue gates (evidence / forbidden path /
  increment cap / canon-in-living), partner naming, determinism, anti-escalation,
  fact-vs-hypothesis, dark/sexual/drug restraint, Ame/KAngel substrate. Negative tests forge
  a violation and assert `validatePipeline` rejects it.
- `tests/packet-contract.test.js` — every packet carries the required contract fields + matching
  eventId; an **active** purity scan (new) that asserts upstream packets carry no downstream-layer
  fields (previously guaranteed only by construction).
- `tests/spec-coverage.test.js` — keeps the parity matrix honest: well-formedness, every critical
  invariant is tested, every claimed test file exists, all eleven phases represented.

### Mutation check (tests have teeth)

Temporarily disabling the execution-boundary check in `src/validators.js` caused exactly one
parity-contract test to fail; restoring it returned the suite to green. The negative tests fail
when their invariant is reverted.

### Correction to the pre-Sprint-1 property list

The property suite lists "adult-content restraint" and "drug-reference restraint". Probing the
engine shows this is only partly true:

- `dark_humor` and `sexual_joke` are actively restrained at the meaning + emotion layers
  (`blockedMeanings` / `emotion.blocked`) — implemented and tested.
- `drug_reference` has **no** explicit restraint block; it only falls through to
  `non_engagement` / `no_action` (harmless, but not first-class). This is the residual high-risk
  gap, tracked as R-DARK-01 (`partial`) in `parity/parity-matrix.json` and documented in
  `parity/high-risk-gaps.md`.

### Parity artifacts (see `parity/`)

- `parity-matrix.json` (SSOT) + `parity-matrix.md` (generated)
- `schema-field-map.json`
- `runtime-contract-map.json`
- `high-risk-gaps.md`

Parity stats: 26 requirements — implemented 14, partial 7, specification_only 5;
tested 21, untested 5 (all untested are deferred Sprint 2–6 items). Critical invariants under
test: 7/7. Remaining high/critical untested: none.

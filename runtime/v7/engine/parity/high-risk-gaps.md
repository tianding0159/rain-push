# High-Risk Gaps — Hardening Sprint 1

Priority order follows `handoff/NEXT_ACTIONS.md` Step 4. Each item states the invariant,
what the engine actually does today (verified by reading source + runtime probes), the gap,
and the Sprint 1 action taken.

## Verification method

All "current state" claims below were confirmed by executing the engine (not by reading prose):

- baseline `npm test` = **166 pass / 0 fail**
- 16 targeted runtime probes against `src/index.js` exports and `validatePipeline`
  (execution status, message budget, no-surface leak, forbidden update paths, increment cap,
  canon-in-living, privacy redaction, partner naming, determinism, event-id mismatch)

## Risk ranking

| # | Invariant | Current state | Sprint 1 action |
|---|---|---|---|
| 1 | public/private leakage | Per-scenario redaction for `privacy_risk`; public channels force low disclosure + blocked private acts. No general redaction scanner over arbitrary text. | **Locked** by `parity-contract.test.js` (privacy redaction + public disclosure). General scanner deferred. |
| 2 | execution claims | `executionStatus` hardcoded `not_executed`; `validatePipeline` rejects any other value; `ExecutionBoundary` defaults dry-run. | **Locked** (execution-claim rejection + dry-run/unconfirmed/handlerless). |
| 3 | route leakage into Living Mode | `canon_only` updates rejected when `mode!=='canon'`. Route-level escalation not otherwise modeled. | **Locked** (canon-in-living rejection). |
| 4 | cross-runtime mutation | Update paths restricted to `counters|patterns|memory`; commit writes only into `state.models[update.runtime]`. | **Locked** (forbidden-path rejection + within-runtime commit). |
| 5 | fact-to-hypothesis collapse | Language branches attach `blockedContent` (`unverified_motive`, `global_relationship_accusation`, `relationship_rupture`). No general fact/hypothesis validator. | **Locked** for the generic-feedback path; general validator deferred. |
| 6 | local-to-global escalation | Scenario paths block severe emotion on ordinary events (pudding blocks `relationship_survival`/abandonment). Scenario-encoded, not a general severity engine. | **Locked** for pudding/ordinary path; general gate deferred. |
| 7 | message-budget violation | `validatePipeline` rejects `messageUnits.length > messageOrActionCount`. | **Locked**. |
| 8 | no-surface output violation | `wait/observe/no_action` + `no_surface` → `no_output`; `validatePipeline` rejects rendered text under no-surface. | **Locked** (reproduced via probe3). |
| 9 | consent / intimacy boundary | `ExecutionBoundary` allowlist blocks non-listed actions; behavior spec forbids intimacy from a joke. No first-class intimacy/consent runtime path. | Allowlist **locked**; intimacy path deferred. |
| 10 | deterministic replay | `pipelineHash` from ordered packet hashes; two identical runs match; `ReplayEngine.verify` compares sequences. | **Locked** (determinism test). |

## The one genuinely open high-risk residual

### R-DARK-01 — dark humor / sexual joke / drug reference restraint (severity: high, status: partial)

**Spec (PROJECT_CONCEPT.md §8, emotion V14, behavior V18):** dark humor must not auto-become
crisis; a sexual joke must not auto-become intimacy; a drug reference must not auto-become severe
state or operational instruction.

**Current engine reality (verified via probe + existing property-conformance suite):**

- `dark_humor` → `meaning.blockedMeanings = [automatic_crisis]`, `emotion.blocked = [forced_crisis]`,
  then `non_engagement` / `no_action` / no rendered text. **Implemented and tested.**
- `sexual_joke` → `meaning.blockedMeanings = [automatic_intimacy]`, `emotion.blocked = [forced_intimacy]`,
  then `non_engagement` / `no_action` / no rendered text. **Implemented and tested.**
- `drug_reference` → **no** explicit `blockedMeanings` / `emotion.blocked`; it only falls through to
  `non_engagement` / `no_action`. The outcome is harmless (no public-safety escalation, no rendered
  text), but there is **no first-class "no severe state / no operational instruction" block** the
  way dark and sexual have.

So the earlier assumption that all three were spec-only was wrong: two of three are real and tested.
The residual is **drug_reference specifically**.

**Why not "fixed" in Sprint 1:** adding a first-class drug-restraint block is new *behavior*
modelling. `NEXT_ACTIONS.md` is explicit — Sprint 1 adds validators and tests, not new dialogue or
undocumented engine behavior. The drug path belongs in a later sprint alongside the corpus/evidence
work, mirroring the existing dark/sexual blocks.

**Sprint 1 action:** the parity matrix marks R-DARK-01 `partial`. Contract tests assert the *verified*
truth — dark & sexual are restrained; drug stays non-engaged **and** its missing block is asserted as
still-empty (`blockedMeanings == []`) so the test documents the gap instead of pretending it's closed.
When a future sprint adds the drug block, that last assertion will flip and force the test to be updated.

## Deferred (correctly out of Sprint 1 scope)

| Requirement | Status | Owner sprint |
|---|---|---|
| R-SCHEMA-01 generated JSON Schema + enum enforcement | specification_only | Sprint 2 |
| R-DSL-01 compile DSL/Markdown into runtime rule table | specification_only | Sprint 3 |
| R-EVID-01 evidence/corpus ingestion with provenance | specification_only | Sprint 4 |
| R-WX-01 weather adapter typed events | specification_only | Sprint 5 |
| R-LLM-01 constrained LLM renderer | specification_only | Sprint 6 |

## Partial implementations worth a second look

These are `implemented` enough to lock a contract test, but narrower than the written spec:

- **R-PRIV-01** privacy redaction is scenario-specific, not a general scanner.
- **R-ESC-01 / R-FACT-01** anti-escalation & fact/hypothesis separation are enforced via
  per-scenario `blockedContent`/`blocked`, not a general validator.
- **R-UPD-03** increment cap is a global magnitude cap (±3), not a per-domain identity-jump gate.
- **R-PKT-02** packet purity holds *by construction*; there is no active scan of `packet.data`
  for forbidden downstream-layer keys. The new `packet-contract.test.js` adds that active scan
  as an executable guard.
- **R-DUAL-01** Ame/KAngel share an emotion substrate but there is no full persona blend/leakage engine.

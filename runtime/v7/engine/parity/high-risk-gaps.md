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

### R-DARK-01 — sensitive-input bidirectional gate (severity: high, status: partial, substatus: bidirectional-gate-missing)

**Spec (PROJECT_CONCEPT.md §8, emotion V14, behavior V18):** sensitive input must pass a
**bidirectional** gate whose behavior depends on the input's **provenance**:

- **Negative direction (keyword-only):** a bare dark-humor / sexual-joke / drug reference must
  **not** auto-activate a severe state (crisis / intimacy / severe).
- **Positive direction (real events):** a `confirmed_current_event`, `confirmed_harm_evidence`,
  or a `canon_route` must be **able** to activate a genuinely severe state. The gate must not
  flatten a real emergency or a Canon-scripted severe event into the same non-engagement as a
  keyword joke.
- **Language/Safety layer:** operational-guidance phrasing must be stripped regardless of
  direction.

**Correction to the earlier write-up (important):** a previous version framed the gap as
"drug reference has no first-class restraint block → add a block". That is the **wrong fix** — a
blanket block would suppress `confirmed_current_event` and `canon_route` severe states along with
the keyword jokes, i.e. it would break the positive direction. The real gap is the **missing
positive direction**, not a missing block.

**Gate-by-gate reality (verified in `src/runtimes/meaning.js`):**

| Gate | State | Engine reality |
|------|-------|----------------|
| `keyword_only_negative_gate` | **partial** | all three get a negative-inference meaning (`X_not_automatically_severe/crisis/intimacy`); dark & sexual also add `blockedMeanings`, drug does not |
| `confirmed_current_event_positive_gate` | **missing** | no path lets a confirmed current event re-enable a real severe state |
| `confirmed_harm_positive_gate` | **missing** | no path activates severity from confirmed harm evidence |
| `canon_route_positive_gate` | **missing** | no path lets a Canon-scripted severe event through |
| `operational_guidance_language_gate` | **missing** | no Language/Safety-layer stripping of operational-guidance phrasing |
| `harmless_fallthrough` | **implemented** | with no positive path, everything falls through to `non_engagement` / no rendered text |

So keyword-only references require a **negative inference gate**, while confirmed current events
and Canon-gated events require **positive activation paths**. Only the negative direction is
partially present; all three positive paths and the operational-guidance gate are absent.

**Why not "fixed" in Sprint 1:** adding the positive activation paths is new *behavior* modelling
(new routing on event provenance). `NEXT_ACTIONS.md` is explicit — Sprint 1 adds validators and
tests, not new dialogue or undocumented engine behavior. The positive direction belongs in a later
sprint alongside the corpus/evidence and Canon-routing work.

**Sprint 1 action:** the parity matrix marks R-DARK-01 `partial` with substatus
`bidirectional-gate-missing` and a per-gate `gates` map. Contract tests assert the *verified* truth
— the negative direction is locked for dark & sexual, and **each** positive path is pinned as
still-missing (a `confirmed_current_event` / `confirmed_harm` / `canon_route` input currently does
**not** produce a severe activation). These are **temporary** pinning assertions: when a future
sprint adds a positive gate, the corresponding assertion flips and forces the test — and the `gates`
map — to be updated together. See the inline `TEMPORARY (R-DARK-01 bidirectional gate)` comment in
`tests/parity-contract.test.js`.

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

# Spec–Engine Parity Matrix

> Generated from `parity-matrix.json` (single source of truth). Do not hand-edit; regenerate.

**Sprint:** Hardening Sprint 1  
**Engine:** `7.0.0-phase12`  
**Baseline:** 166 pass / 0 fail

## Legend

- **implementation.status** — how deeply the requirement is built: `implemented` / `partial` / `specification_only`
- **test.status** — whether an executable test locks it: `tested` / `untested`
- A requirement can be `implemented` yet `untested`; Sprint 1 moves high-risk ones to `tested`.

## Scope

This matrix covers **26 high-risk requirements selected across Phases 1–11 (plus cross-cutting
orchestrator / update-queue / execution-boundary owners)** — not an exhaustive audit of every
spec field in every phase. Selection criterion: invariants whose violation is safety-, privacy-,
or correctness-critical. Field-level parity for all packets lives in `schema-field-map.json`;
per-runtime enforcement status lives in `runtime-contract-map.json`. Four phases (continuity,
relationship, thought, decision) have **no dedicated** requirement here and are covered only by
cross-cutting requirements — see the phase-coverage partition in `tests/spec-coverage.test.js`.

## Summary

Total requirements: **26** (high-risk, cross-phase selection — see Scope above)

| implementation.status | count | % |
|---|---|---|
| implemented | 14 | 54% |
| partial | 7 | 27% |
| specification_only | 5 | 19% |

| test.status | count | % |
|---|---|---|
| tested | 21 | 81% |
| untested | 5 | 19% |

| severity | count | tested |
|---|---|---|
| critical | 7 | 7/7 |
| high | 12 | 12/12 |
| medium | 5 | 2/5 |
| low | 2 | 0/2 |

**Critical invariants under test: 7/7.** Remaining high/critical untested: none.

## Requirements

| ID | Phase | Runtime | Sev | Impl | Test | Requirement |
|---|---|---|---|---|---|---|
| R-EXEC-01 | 11 | language | critical | implemented | tested | Language Packet must never claim external execution; executionStatus stays not_executed until a real confirmed handler returns success. |
| R-EXEC-02 | 12 | execution-boundary | critical | implemented | tested | Message generated != message sent. Execution boundary defaults to dry-run and does not deliver. |
| R-EXEC-03 | 9 | behavior | critical | implemented | tested | External action requests inside Behavior Packet must be marked not executed and confirmation-required, never treated as already executed. |
| R-PRIV-01 | 11 | language | critical | partial | tested | Public/private separation: private referents (exact location, real name, private promise, intimate detail) must not appear in public-channel rendered output. |
| R-PRIV-02 | 10 | expression | high | implemented | tested | On public_post/live_stream channels, expression disclosure level must be low and private detail rhetorical acts blocked. |
| R-SURF-01 | 11 | language | critical | implemented | tested | No-surface behavior (wait / observe_without_engaging / no_action) and no_surface expression must produce no rendered text. |
| R-BUDGET-01 | 11 | language | high | implemented | tested | Rendered message units must not exceed behavior.messageOrActionCount. |
| R-UPD-01 | 2 | update-queue | high | implemented | tested | Every long-term update must carry evidence refs; updates without evidence are rejected. |
| R-UPD-02 | 2 | update-queue | critical | implemented | tested | Updates may only target counters/patterns/memory paths; cross-runtime or arbitrary model paths are forbidden. |
| R-UPD-03 | 3 | update-queue | high | partial | tested | One event may not make identity-level jumps; increment magnitude is capped. |
| R-CANON-01 | 3 | update-queue | high | implemented | tested | Canon-only updates must not commit in Living Mode (route-level escalation stays gated). |
| R-NAME-01 | 3 | all | high | implemented | tested | Generated runtime output uses partner display name 豆豆 (canon quotations may keep 阿P). |
| R-DET-01 | 12 | orchestrator | high | implemented | tested | Same event + state + seed produces the same packet hashes and pipeline hash (deterministic replay). |
| R-EVENT-01 | 12 | orchestrator | high | implemented | tested | Invalid RuntimeEvents (missing id, bad timestamp, bad mode/actor, missing channel) are rejected before pipeline execution. |
| R-PKT-01 | 1-11 | all | high | implemented | tested | Every packet must carry kind, packetId, runtimeVersion, eventId, generatedAt, data, hash and match its expected runtime kind and event id. |
| R-PKT-02 | 5 | emotion | high | partial | tested | Emotion Packet may not contain need/goal/action/decision/reply_text/final_message/persona_output; Behavior may not contain final wording; Expression may not contain final text/emoji. |
| R-ESC-01 | 5 | emotion | critical | partial | tested | Local/ordinary events must not escalate to severe emotion or global relationship claims (anti-escalation); severe emotions require gate/evidence. |
| R-FACT-01 | 4 | meaning | high | partial | tested | Hypothesis/candidate meaning must not collapse into asserted fact in final output (fact vs hypothesis separation). |
| R-DARK-01 | 5 | emotion/behavior | high | partial (bidirectional-gate-missing) | tested | Sensitive input must pass a bidirectional gate: no auto-escalation (dark→crisis, sexual→intimacy, drug→severe state) AND no silent under-handling (content marked by a first-class restraint block, not merely non-engagement). |
| R-ORD-01 | 3 | need/behavior | medium | implemented | tested | Ordinary life is first-class: a forgotten pudding may remain a forgotten pudding; rest/food behaviors are legitimate and not career abandonment. |
| R-DUAL-01 | 10 | expression | medium | partial | tested | Ame and KAngel are two surfaces of one person sharing one substrate; stage energy must not delete fatigue; performance is not automatically fake. |
| R-SCHEMA-01 | 1-11 | all | medium | specification_only | untested | Every YAML schema field and enum should be enforced at runtime with a generated JSON Schema pipeline. |
| R-DSL-01 | 3-11 | all | medium | specification_only | untested | DSL/Markdown rules should compile into the runtime rule table (single source of truth). |
| R-EVID-01 | 1 | knowledge | medium | specification_only | untested | Evidence must be sourced, classified (canon/guide/community/simulator), confidence-scored, location-addressable; no unsourced claim silently becomes Canon; no full copyrighted corpus in repo. |
| R-WX-01 | future | weather-adapter | low | specification_only | untested | Weather adapter produces typed RuntimeEvents with source/freshness/timezone; rain must not imply abandonment/crisis; no notification without execution handler. |
| R-LLM-01 | future | renderer | low | specification_only | untested | A constrained LLM renderer may vary wording but not facts/outcome/behavior/message count/disclosure/execution status; baseline tests stay zero-network. |

## Detail

### R-EXEC-01 — Language Packet must never claim external execution; executionStatus stays not_executed until a real confirmed handler returns success.

- **Phase / Runtime:** 11 / language  
- **Severity:** critical  
- **Source:** language/validator.md V2; START_HERE_CLAUDE.md; CLAUDE_BOOTSTRAP_PROMPT.md  
- **Expected packet field:** `language.data.executionStatus`  
- **Implementation (implemented):** rendered()/noOutput() hardcode executionStatus:'not_executed'; validatePipeline pushes 'language_execution_boundary_violation' if language.data.executionStatus !== 'not_executed'. _(src/runtimes/language.js + src/validators.js)_  
- **Validator:** validatePipeline execution-boundary check  
- **Test (tested):** execution claim in language packet is rejected _(tests/parity-contract.test.js)_

### R-EXEC-02 — Message generated != message sent. Execution boundary defaults to dry-run and does not deliver.

- **Phase / Runtime:** 12 / execution-boundary  
- **Severity:** critical  
- **Source:** START_HERE_CLAUDE.md 'Important execution boundary'; CURRENT_IMPLEMENTATION.md 8  
- **Expected packet field:** `ExecutionBoundary.request().status`  
- **Implementation (implemented):** dryRun default true -> status 'not_executed' reason 'dry_run'; non-allowlisted -> 'blocked'; unconfirmed -> 'not_executed'; missing handler -> 'not_executed'. _(src/execution/execution-boundary.js)_  
- **Validator:** ExecutionBoundary internal  
- **Test (tested):** dry-run never executes; unconfirmed/handlerless never executes _(tests/execution.test.js + tests/parity-contract.test.js)_

### R-EXEC-03 — External action requests inside Behavior Packet must be marked not executed and confirmation-required, never treated as already executed.

- **Phase / Runtime:** 9 / behavior  
- **Severity:** critical  
- **Source:** behavior/validator.md V4/V16 (EXECUTION_LEAK)  
- **Expected packet field:** `behavior.data.externalActionRequests[].status`  
- **Implementation (implemented):** risk_containment path emits externalActionRequests:[{action,status:'not_executed',confirmationRequired:true}] (verified via probe). _(src/runtimes/behavior.js)_  
- **Validator:** none dedicated (structural)  
- **Test (tested):** behavior external action requests stay not_executed _(tests/parity-contract.test.js)_

### R-PRIV-01 — Public/private separation: private referents (exact location, real name, private promise, intimate detail) must not appear in public-channel rendered output.

- **Phase / Runtime:** 11 / language  
- **Severity:** critical  
- **Source:** language/safety_privacy_redaction.md; language/validator.md V5; PROJECT_CONCEPT.md 10  
- **Expected packet field:** `language.data.renderedText + language.data.redactions`  
- **Implementation (partial):** privacy_risk scenario renders fixed safe text and declares redactions[ exact_location, real_name, private_promise, intimate_detail ]. Verified renderedText does not contain injected LOC/NAME. Coverage is per-scenario, not a general redaction pass over arbitrary text. _(src/runtimes/language.js reduce_public_exposure branch)_  
- **Validator:** expression disclosure.redactions on public channels; no general leak scanner  
- **Test (tested):** privacy scenario redacts private referents from public output _(tests/parity-contract.test.js)_

### R-PRIV-02 — On public_post/live_stream channels, expression disclosure level must be low and private detail rhetorical acts blocked.

- **Phase / Runtime:** 10 / expression  
- **Severity:** high  
- **Source:** expression/validator.md; PROJECT_CONCEPT.md 10  
- **Expected packet field:** `expression.data.disclosure.level + rhetoricalPlan.blockedActs`  
- **Implementation (implemented):** disclosure.level='low' + redactions list on public channels; blockedActs includes 'private_relationship_detail' on public channels. _(src/runtimes/expression.js)_  
- **Validator:** expression build-time  
- **Test (tested):** public channel expression forces low disclosure and blocks private detail _(tests/parity-contract.test.js)_

### R-SURF-01 — No-surface behavior (wait / observe_without_engaging / no_action) and no_surface expression must produce no rendered text.

- **Phase / Runtime:** 11 / language  
- **Severity:** critical  
- **Source:** behavior/silence_and_waiting.md; expression/validator.md V1; language/validator.md V1  
- **Expected packet field:** `language.data.renderStatus == 'no_output'`  
- **Implementation (implemented):** language emits noOutput() for those action types / no_surface; validatePipeline rejects with 'no_surface_behavior_rendered_text' and 'no_surface_has_rendered_text' when violated (verified via probe3). _(src/runtimes/language.js + src/validators.js)_  
- **Validator:** validatePipeline no-surface checks  
- **Test (tested):** no_surface pipeline carrying rendered text is rejected _(tests/parity-contract.test.js)_

### R-BUDGET-01 — Rendered message units must not exceed behavior.messageOrActionCount.

- **Phase / Runtime:** 11 / language  
- **Severity:** high  
- **Source:** behavior/validator.md V7 (MESSAGE_BUDGET_EXCEEDED); language/validator.md V2  
- **Expected packet field:** `language.data.messageUnits.length <= behavior.data.messageOrActionCount`  
- **Implementation (implemented):** validatePipeline pushes 'language_message_budget_exceeded' when messageUnits.length > messageOrActionCount (verified via probe). _(src/validators.js)_  
- **Validator:** validatePipeline budget check  
- **Test (tested):** message budget overflow is rejected _(tests/parity-contract.test.js)_

### R-UPD-01 — Every long-term update must carry evidence refs; updates without evidence are rejected.

- **Phase / Runtime:** 2 / update-queue  
- **Severity:** high  
- **Source:** engines/continuity/validator.md; every phase update_queue.md; ACCEPTANCE_CRITERIA runtime boundaries  
- **Expected packet field:** `update.evidenceRefs`  
- **Implementation (implemented):** missing/empty evidenceRefs -> 'missing_update_evidence' (verified via probe). _(src/update-queue.js validateUpdate)_  
- **Validator:** validateUpdate  
- **Test (tested):** update without evidence is rejected _(tests/parity-contract.test.js + tests/update-queue.test.js)_

### R-UPD-02 — Updates may only target counters/patterns/memory paths; cross-runtime or arbitrary model paths are forbidden.

- **Phase / Runtime:** 2 / update-queue  
- **Severity:** critical  
- **Source:** all validator.md 'DIRECT_MODEL_MUTATION' / 'target belongs to another runtime'  
- **Expected packet field:** `update.path + update.runtime`  
- **Implementation (implemented):** path must match ^(counters|patterns|memory)(\.|$) else 'forbidden_update_path'; commit writes only into state.models[update.runtime] (verified via probe). _(src/update-queue.js validateUpdate + commitUpdateQueues)_  
- **Validator:** validateUpdate  
- **Test (tested):** forbidden path is rejected; commit stays within runtime model _(tests/parity-contract.test.js + tests/update-queue.test.js)_

### R-UPD-03 — One event may not make identity-level jumps; increment magnitude is capped.

- **Phase / Runtime:** 3 / update-queue  
- **Severity:** high  
- **Source:** relationship/validator.md V6 'update exceeds per-event cap'; emotion V13  
- **Expected packet field:** `update.delta`  
- **Implementation (partial):** increment abs > 3 -> 'update_increment_cap_exceeded' (verified). This is a global magnitude cap, not a per-domain identity-jump gate; identity/trait-level protection from spec is not separately modeled. _(src/update-queue.js MAX_INCREMENT=3)_  
- **Validator:** validateUpdate  
- **Test (tested):** over-cap increment is rejected _(tests/parity-contract.test.js)_

### R-CANON-01 — Canon-only updates must not commit in Living Mode (route-level escalation stays gated).

- **Phase / Runtime:** 3 / update-queue  
- **Severity:** high  
- **Source:** relationship/validator.md V8; PROJECT_CONCEPT.md 6; update-queue policy  
- **Expected packet field:** `update.policy + event.mode`  
- **Implementation (implemented):** policy 'canon_only' with mode !== 'canon' -> 'canon_update_in_living_mode' (verified via probe). _(src/update-queue.js validateUpdate)_  
- **Validator:** validateUpdate  
- **Test (tested):** canon_only update in living mode is rejected _(tests/parity-contract.test.js)_

### R-NAME-01 — Generated runtime output uses partner display name 豆豆 (canon quotations may keep 阿P).

- **Phase / Runtime:** 3 / all  
- **Severity:** high  
- **Source:** NAMING_POLICY.md; every validator.md naming section; BOOTSTRAP invariants  
- **Expected packet field:** `language.data.referenceResolution.partner`  
- **Implementation (implemented):** referenceResolution defaults { partner: '豆豆' } (verified via probe). No runtime code emits 阿P. _(src/runtimes/language.js)_  
- **Validator:** none dedicated  
- **Test (tested):** partner naming is 豆豆 and rendered output never emits 阿P _(tests/parity-contract.test.js)_

### R-DET-01 — Same event + state + seed produces the same packet hashes and pipeline hash (deterministic replay).

- **Phase / Runtime:** 12 / orchestrator  
- **Severity:** high  
- **Source:** all validator.md determinism sections; engine README; replay.js  
- **Expected packet field:** `result.pipelineHash`  
- **Implementation (implemented):** pipelineHash derived from ordered packet hashes; ReplayEngine.verify compares hash sequences (verified two identical runs match). _(src/orchestrator.js + src/replay/replay.js + src/util.js hashValue)_  
- **Validator:** ReplayEngine.verify  
- **Test (tested):** identical events yield identical pipeline hashes _(tests/parity-contract.test.js + tests/determinism.test.js + tests/replay.test.js)_

### R-EVENT-01 — Invalid RuntimeEvents (missing id, bad timestamp, bad mode/actor, missing channel) are rejected before pipeline execution.

- **Phase / Runtime:** 12 / orchestrator  
- **Severity:** high  
- **Source:** src/validators.js validateEvent; ACCEPTANCE baseline  
- **Expected packet field:** `throws INVALID_RUNTIME_EVENT`  
- **Implementation (implemented):** run() throws INVALID_RUNTIME_EVENT on reject before any runtime executes. _(src/validators.js validateEvent + orchestrator guard)_  
- **Validator:** validateEvent  
- **Test (tested):** invalid event rejected pre-pipeline _(tests/validation.test.js + tests/packet-contract.test.js)_

### R-PKT-01 — Every packet must carry kind, packetId, runtimeVersion, eventId, generatedAt, data, hash and match its expected runtime kind and event id.

- **Phase / Runtime:** 1-11 / all  
- **Severity:** high  
- **Source:** packet.js validatePacketShape; every phase *_packet.md  
- **Expected packet field:** `packet.{kind,packetId,runtimeVersion,eventId,generatedAt,data,hash}`  
- **Implementation (implemented):** validatePacketShape enforces required fields + kind; validatePipeline adds event_id_mismatch per packet (verified via probe). _(src/packet.js + src/validators.js)_  
- **Validator:** validatePacketShape + validatePipeline  
- **Test (tested):** all 11 packets carry required contract fields and matching eventId _(tests/packet-contract.test.js)_

### R-PKT-02 — Emotion Packet may not contain need/goal/action/decision/reply_text/final_message/persona_output; Behavior may not contain final wording; Expression may not contain final text/emoji.

- **Phase / Runtime:** 5 / emotion  
- **Severity:** high  
- **Source:** emotion/validator.md V17 packet purity; behavior V16; expression V2  
- **Expected packet field:** `packet.data key set`  
- **Implementation (partial):** By construction each runtime emits only its own concern (verified emotion keys: emotions,dominant,expressionPressure,regulatedBy,blocked,ameKangelSharedState; behavior/expression carry no renderedText). There is no runtime validator that actively scans packet.data for forbidden purity-violating keys/strings; purity holds by construction, not by enforcement. _(src/runtimes/emotion.js, behavior.js, expression.js)_  
- **Validator:** none dedicated (spec asks for active purity scan)  
- **Test (tested):** emotion/behavior/expression packets are free of downstream-layer fields _(tests/packet-contract.test.js)_

### R-ESC-01 — Local/ordinary events must not escalate to severe emotion or global relationship claims (anti-escalation); severe emotions require gate/evidence.

- **Phase / Runtime:** 5 / emotion  
- **Severity:** critical  
- **Source:** emotion/validator.md V5 severity gate; PROJECT_CONCEPT.md 7-8; relationship V5  
- **Expected packet field:** `emotion.data.blocked + emotion.data.emotions`  
- **Implementation (partial):** Scenario paths block severe emotions (e.g. pudding blocks relationship_survival/abandonment) and keep ordinary events ordinary. This is scenario-encoded, not a general severity-gate engine; only typed scenarios are protected. _(src/runtimes/emotion.js)_  
- **Validator:** none dedicated general gate  
- **Test (tested):** ordinary pudding event blocks abandonment/severe emotion and stays local _(tests/parity-contract.test.js)_

### R-FACT-01 — Hypothesis/candidate meaning must not collapse into asserted fact in final output (fact vs hypothesis separation).

- **Phase / Runtime:** 4 / meaning  
- **Severity:** high  
- **Source:** meaning/README; meaning/validator.md; language/validator.md V6  
- **Expected packet field:** `meaning.data (candidate meanings) vs language.data.renderedText`  
- **Implementation (partial):** Language branches attach blockedContent like 'unverified_motive','global_relationship_accusation','relationship_rupture' so rendered lines stay local/specific. There is no general validator asserting no hypothesis-as-fact across arbitrary text; protection is per-scenario blockedContent. _(src/runtimes/meaning.js + language.js blockedContent)_  
- **Validator:** none dedicated  
- **Test (tested):** generic feedback yields specific request, blocks global accusation, and never renders relationship-rupture text _(tests/parity-contract.test.js)_

### R-DARK-01 — Sensitive-input bidirectional gate (substatus: bidirectional-gate-missing)

- **Phase / Runtime:** 5 / emotion/behavior  
- **Severity:** high  
- **Source:** PROJECT_CONCEPT.md 8; emotion V14.7/13/14; behavior V18.9-11  
- **Expected packet field:** `meaning.data.blockedMeanings + emotion.data.blocked + behavior.data.actionType`  
- **Requirement:** Sensitive input (dark humor / sexual joke / drug reference) must pass a **bidirectional** gate — it must not auto-*escalate* (dark→crisis, sexual→intimacy, drug→severe state / operational instruction) **and** it must not be silently *under-handled* (the content should be marked by a first-class restraint block, not merely fall through to non-engagement).  
- **Implementation (partial, bidirectional-gate-missing):** Over-escalation direction is enforced for dark & sexual — dark_humor → meaning.blockedMeanings=[automatic_crisis], emotion.blocked=[forced_crisis]; sexual_joke → blockedMeanings=[automatic_intimacy], emotion.blocked=[forced_intimacy]; both then non_engagement / no_action / no rendered text. The under-handling direction is MISSING: drug_reference has no first-class block (blockedMeanings stays []), it only falls through to non_engagement. The gap is the missing second gate direction, not merely "no drug block". _(src/runtimes/meaning.js, emotion.js, decision.js, behavior.js)_  
- **Validator:** over-escalation direction via meaning/emotion scenario blocks (dark, sexual); under-handling direction has no first-class block for any of the three (drug is the clearest case)  
- **Test (tested):** over-escalation direction locked for dark & sexual; under-handling direction documented as missing (drug blockedMeanings asserted still-empty as a temporary pin) _(tests/parity-contract.test.js + tests/property-conformance.test.js)_

### R-ORD-01 — Ordinary life is first-class: a forgotten pudding may remain a forgotten pudding; rest/food behaviors are legitimate and not career abandonment.

- **Phase / Runtime:** 3 / need/behavior  
- **Severity:** medium  
- **Source:** PROJECT_CONCEPT.md 7 ordinary-life principle; behavior V13  
- **Expected packet field:** `language.data.renderedText for pudding/fatigue scenarios`  
- **Implementation (implemented):** pudding -> 'practical_completion' -> '布丁没了'/'布丁库存管理又不合格'; fatigue -> 'rest_priority' -> '我先躺会儿，数据晚点看'. _(src/runtimes/decision.js, behavior.js, language.js)_  
- **Validator:** none dedicated  
- **Test (tested):** ordinary pudding/fatigue stay ordinary _(tests/scenario-conformance.test.js + tests/parity-contract.test.js)_

### R-DUAL-01 — Ame and KAngel are two surfaces of one person sharing one substrate; stage energy must not delete fatigue; performance is not automatically fake.

- **Phase / Runtime:** 10 / expression  
- **Severity:** medium  
- **Source:** PROJECT_CONCEPT.md 4; emotion V8/V10 Ame-KAngel; expression persona_surfaces.md  
- **Expected packet field:** `expression.data.primarySurface + emotion.data.ameKangelSharedState`  
- **Implementation (partial):** Surfaces selected per behavior (kangel_stage vs ame_private) with shared emotion substrate (ameKangelSharedState present, fatigue kept as hidden under audience_euphoria). Not a full persona blend/leakage engine as specified. _(src/runtimes/expression.js + emotion.js)_  
- **Validator:** none dedicated  
- **Test (tested):** million-followers uses kangel_stage while shared emotion substrate persists _(tests/parity-contract.test.js)_

### R-SCHEMA-01 — Every YAML schema field and enum should be enforced at runtime with a generated JSON Schema pipeline.

- **Phase / Runtime:** 1-11 / all  
- **Severity:** medium  
- **Source:** */schemas/*.yaml; KNOWN_LIMITATIONS 3  
- **Expected packet field:** `n/a (schema enforcement)`  
- **Implementation (specification_only):** Only packet shape (required keys) is validated. No generated JSON Schema, no enum enforcement. Deferred to Sprint 2 (Schema and Type Safety). _(n/a)_  
- **Validator:** partial (shape only)  
- **Test (untested):** TODO Sprint 2

### R-DSL-01 — DSL/Markdown rules should compile into the runtime rule table (single source of truth).

- **Phase / Runtime:** 3-11 / all  
- **Severity:** medium  
- **Source:** */dsl/*.dsl; KNOWN_LIMITATIONS 2  
- **Expected packet field:** `n/a`  
- **Implementation (specification_only):** Runtime behavior is hardcoded JS conditionals; DSL/Markdown are not compiled. Duplicate sources of truth acknowledged. Deferred to Sprint 3 (Rule Source Unification). _(n/a)_  
- **Validator:** none  
- **Test (untested):** TODO Sprint 3

### R-EVID-01 — Evidence must be sourced, classified (canon/guide/community/simulator), confidence-scored, location-addressable; no unsourced claim silently becomes Canon; no full copyrighted corpus in repo.

- **Phase / Runtime:** 1 / knowledge  
- **Severity:** medium  
- **Source:** evidence/README.md; evidence/evidence_schema.yaml; corpus/annotation_contract.md  
- **Expected packet field:** `knowledge.data (facts + provenance)`  
- **Implementation (specification_only):** Knowledge runtime derives a scenario label from signals; it does not ingest an evidence corpus or carry per-fact provenance. Evidence pipeline is spec-only. No corpus is bundled (correct). Deferred to Sprint 4. _(src/runtimes/knowledge.js)_  
- **Validator:** none  
- **Test (untested):** TODO Sprint 4

### R-WX-01 — Weather adapter produces typed RuntimeEvents with source/freshness/timezone; rain must not imply abandonment/crisis; no notification without execution handler.

- **Phase / Runtime:** future / weather-adapter  
- **Severity:** low  
- **Source:** NEXT_ACTIONS Sprint 5; PROJECT_CONCEPT.md 2  
- **Expected packet field:** `n/a (adapter)`  
- **Implementation (specification_only):** No weather adapter in engine. Character core only. Deferred to Sprint 5. _(n/a)_  
- **Validator:** none  
- **Test (untested):** TODO Sprint 5

### R-LLM-01 — A constrained LLM renderer may vary wording but not facts/outcome/behavior/message count/disclosure/execution status; baseline tests stay zero-network.

- **Phase / Runtime:** future / renderer  
- **Severity:** low  
- **Source:** NEXT_ACTIONS Sprint 6  
- **Expected packet field:** `n/a`  
- **Implementation (specification_only):** Renderer is deterministic fixed-rule. No LLM adapter. Deferred to Sprint 6. _(n/a)_  
- **Validator:** none  
- **Test (untested):** TODO Sprint 6


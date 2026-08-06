# P0 Handoff v1 Strict Audit

## Verdict

**FAIL. Do not give v1 to Claude as an implementation contract.**

The first package captured the correct product direction, but it was not strict enough to guarantee that implementation would preserve the existing v7 evidence model, allow valid sensitive contexts, or prevent contradictory states.

## Audit scope

Reviewed:

- all 14 files in `rain-push-p0-claude-handoff.zip`
- all four JSON Schemas against JSON Schema Draft 2020-12
- current GitHub `main` audit state
- the complete locally available v7 specification package
- `PROJECT_CONCEPT.md`
- `runtime/v7/corpus/annotation_contract.md`
- the 1051-line research model and runtime behavior specification
- the existing private-corpus workspace and v0.1 annotation schema
- the current executable engine contracts and channel enums

## Automated findings

All four v1 schemas are meta-schema valid.

However, seven deliberately invalid semantic examples were tested and **all seven passed validation**:

1. `suspected_ai` evidence marked behavior-eligible and Canon-capable
2. community evidence marked behavior-eligible for a Canon-severe route
3. keyword-only substance input allowed to activate `severe`
4. operational guidance left unblocked
5. non-adult/public/withdrawn intimacy allowed at high intensity
6. sexual joke with unclear consent allowed high intimacy on live stream
7. RenderPlan carrying final wording inside Emotion plus public severe intimacy with unclear consent

Meta-schema validity only proves that the schema is legal JSON Schema. It does not prove that the schema enforces the product contract.

## Critical blockers

### C1. Source revision was not pinned

The v1 package did not record the exact GitHub commit and ZIP blob it was designed against.

Current verified GitHub state at audit time:

- `main` commit: `30685cc42c91ad66a9887d5c38d5a7abaf22a819`
- current root ZIP blob: `b2c74c3b79055a741f40a7041ee3bca44efb526d`
- current root ZIP size: `528131`

The locally available full v7 ZIP is older:

- local size: `457296`
- local Git blob SHA-1: `99a22cbc36b26b54bc4b4ea97d05b51b4e5f5ba3`
- local SHA-256: `9e056a01f04ad1065469105a032d87239920185735b54ed1a103b21cd1c96834`

The old local source is still useful for specification review because the Sprint 1 commits report no executable `src/` behavior change, but it must not be used as the source copied into a new branch.

### C2. The corpus contract created a parallel incompatible model

v7 already has an annotation contract with:

- A/B/C/D evidence levels
- channel
- persona surface
- Canon time and state
- event trigger
- functional need
- P role
- behavior primitives
- expected reply class
- reply timing sensitivity
- state effect
- route severity
- context-required flag

The private corpus workspace also models an event as a **trigger plus a sequence of messages**, including order, delay, speech acts, tone, goals, escalation and persona transition.

The v1 `CorpusRecord` collapsed this into a mostly single-record style description and omitted several existing fields. It also used `private_jine`, while the executable runtime's canonical channel enum is `jine_private`.

Implementing v1 would create a second dialect and force later migration.

### C3. Source policy was prose only

The v1 schema allowed annotators to set `behaviorEligible` and `languageEligible` freely.

That means `suspected_ai`, `community`, or `synthetic` records could declare themselves behavior-authoritative. Eligibility must be derived from the source registry and evidence level, not trusted as an input boolean.

### C4. Sensitive bidirectional gating was not encoded

The v1 schema permitted:

```text
provenance = keyword_only
allowedSeverity = severe
operationalGuidanceBlocked = false
```

This is the exact contradiction P0 is supposed to eliminate.

Positive activation and negative restraint require cross-field validators and paired tests. A loose enum list is not sufficient.

### C5. Intimacy and consent were under-modeled

The v1 schema allowed:

```text
allAdults = false
consent = withdrawn
channel = public_post
intent = consensual_intimacy
allowed = high
```

It lacked:

- per-event evidence
- scope
- freshness
- withdrawal precedence
- public/private hard constraints
- coercion/pressure state
- a derived activation decision
- a rule that unclear or withdrawn consent forces `allowed = none`

### C6. RenderPlan was not actually frozen

`emotion` was an unrestricted object, so it could contain final wording, decisions, actions or consent claims.

The plan also lacked:

- upstream packet hashes
- required semantic units
- blocked semantic units
- no-output status
- redaction requirements
- output comparison contract
- source influence boundaries

### C7. Fidelity tests were descriptive, not executable

The 24 scenarios were useful product examples but not runnable fixtures. They lacked complete RuntimeEvent/state/history inputs and exact packet-level invariants.

The package also had no formal protocol for:

- retrieval precision
- source-route contamination
- verbatim leakage
- blind-test sample size
- randomization
- long-conversation repetition measurement
- user sign-off

### C8. Typecheck requirements contradicted each other

The master plan required a blocking `typecheck` job, while P0-0 said to add checkJs only if convenient.

A strict checkJs probe against the locally available executable source produced:

- 179 TypeScript errors
- 25 source files with errors

Therefore source promotion and type hardening must be separate PRs. Combining them would make P0-0 impossible to review as a no-behavior-change move.

### C9. ZIP determinism and manifest integrity were underspecified

The v1 manifest listed paths only. It contained no file hashes and did not include its own integrity model.

A deterministic ZIP contract must specify:

- sorted file order
- fixed timestamps
- normalized permissions
- normalized path separators
- compression settings
- SHA-256 content manifest
- stale-artifact CI check

## What v1 got right

- It correctly made fidelity and positive sensitive activation P0.
- It correctly rejected blanket suppression.
- It correctly separated runtime decisions from final wording.
- It correctly kept the full copyrighted corpus out of public Git.
- It correctly staged P0 rather than asking for a giant PR.
- It correctly recognized that ordinary life, streaming, dark material and adult intimacy must coexist.

## Corrective decisions in v2

1. Pin the exact repository revision and current ZIP blob.
2. Split P0-0 into:
   - P0-0A: reviewable source SSOT
   - P0-0B: JSDoc/checkJs type hardening
3. Preserve and extend the existing v7 annotation terminology.
4. Model corpus samples as event/message sequences, not isolated style cards.
5. Derive source eligibility from a source registry.
6. Make only P0-A schemas authoritative now.
7. Keep P0-B through P0-F contracts as review gates, not premature schemas.
8. Add migration mapping from the existing private corpus v0.1.
9. Add machine-verifiable negative tests.
10. Define a real fidelity evaluation and user sign-off gate.

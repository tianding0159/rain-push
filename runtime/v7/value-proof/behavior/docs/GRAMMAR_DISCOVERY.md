# Behavior Grammar Discovery (P1-1B)

Data-first discovery of candidate "behavior grammar" from the 50 revised single-sided annotations
(Layer A → Layer B). This pilot mines *candidate* dynamic patterns — action transitions, driver→
strategy couplings, conditional co-occurrence — and reports **what deserves testing at a larger n**.
It asserts no laws, no production readiness, and builds no runtime (Layer C is out of scope).

> Every number here is a `PILOT_ESTIMATE` at n=50. Read it as "worth collecting more data for",
> never as "true".

## What this is NOT

- Not cross-turn conversation grammar. The corpus is single-sided (no partner turns), so all arcs
  are *intra-message* and `possible_next_strategy` is deliberately left `unknown` (§14).
- Not a validated model. The strongest status any hypothesis can earn is `preliminary_support`.
  There is no `supported`/`confirmed`/`production_ready` terminal anywhere in the pipeline.
- Not ground truth. The annotations are model-assisted research annotations, subject to human
  review and overturn.

## Pipeline

```
private annotations (50, WITH text)
        │  link each record → recordHash (selection-key.private.json)
        ▼
grammar-discovery.mjs   → 9 discovery sections (transitions, couplings, arcs …)
grammar-hypotheses.mjs  → H1-H11 data-first evaluation
grammar-churn.mjs       → annotation-guide churn signals
grammar-gate.mjs        → PROCEED_TO_200 decision
        │
        ├─ 11 PRIVATE files (gitignored, carry recordHash links)
        │     private/pilot-50/grammar/*.private.json
        │
        └─ 3 COMMITTED-SAFE files (verbatim-free, links stripped)
              behavior/discovery/grammar-candidate.aggregate.json
              behavior/discovery/grammar-hypotheses.aggregate.json
              behavior/discovery/annotation-guide-churn.json
```

Run it:

```bash
cd runtime/v7/value-proof
node behavior/bin/discover-grammar.mjs
```

The driver fails loud if the discovery bundle does not validate against
`behavior-grammar-candidate.schema.json` (+ the `production_ready` ban), and reports
`rawHashUnchanged` — the raw corpus is never opened.

## Discipline baked in

| Concern | How it is enforced |
|---|---|
| Unique-record support | `recordSupport` (distinct records) is the primary weight; a transition repeated inside one long message adds at most +1 (`occurrenceCount` kept separately, diagnostic only). |
| Prior vs record evidence | Driver→strategy couplings split into tierA (record-specific strong), tierB (moderate), exploratory (prior-only/weak). Prior-only **never** enters the primary tally (§6). |
| Honest rates | Every rate is a `pilotRate`: `observed_count` + `eligible_opportunity_count` + `uncertainty_note`. Never a bare percentage; `null` when there is no eligible opportunity. |
| Counterexamples | First-class: `revealWithoutMaskRecords`, `conflictingRecordCount`, per-hypothesis `counterexample_count`. A pattern is only meaningful next to what breaks it. |
| Verbatim safety | Committed aggregates strip every `recordHash` link and never carry `text`/`evidence` fields — only counts and enum-token keys survive. |
| Determinism | All emitted arrays are sorted; output is byte-identical run to run (asserted by test + a 3× driver check). |

## Hypotheses H1-H11 (data-first)

Status vocabulary (no "supported" terminal): `preliminary_support` · `weak_support` · `mixed` ·
`contradicted` · `insufficient_evidence`. Counts are computed FIRST; status follows a fixed rule
(`MIN_ELIGIBLE=5`, prelim ≥ 0.5, weak ≥ 0.2, contradicted ≤ 0.1).

| ID | Claim (structural) | Result | obs/elig |
|----|--------------------|--------|----------|
| H1 | a transition grammar exists at all | preliminary_support | 27/27 |
| H2 | reveal → self-devaluation | weak_support | 3/10 |
| H3 | a reveal is usually masked right after | **contradicted** | 3/31 |
| H4 | fear-of-abandonment → reassurance-seeking | preliminary_support | 5/7 |
| H5 | low trigger + high activation (hair-trigger) | weak_support | 9/30 |
| H6 | single-valence dominates; simultaneous rare | mixed | 6/15 |
| H7 | test_bond is the top relationship operation | preliminary_support | 9/18 |
| H8 | designed to elicit a specific partner op | preliminary_support | 49/50 |
| H9 | multi-beat messages carry an escalation arc | weak_support | 7/27 |
| H10 | confident self-presentation → reveal | insufficient_evidence | 2/3 |
| H11 | cross-action grammar is sparse at this n | weak_support | 23/50 |

**Notable finding — H3 contradicted.** The intuition that vulnerability is "always masked" does not
hold: only 3 of 31 reveal-bearing records conceal right after. 28 reveal *without* masking. This is
exactly the kind of assumption the pilot exists to catch before it hardens into a rule.

## PROCEED_TO_200 gate

Terminal status: **`BEHAVIOR_GRAMMAR_NEEDS_GUIDE_REVISION`** → decision `REVISE_GUIDE_THEN_SCALE`.

The pipeline machinery works (10/11 hypotheses evaluable, several reach preliminary/weak support),
so this is **not** `BEHAVIOR_GRAMMAR_FAILED`. But two guide-health signals block a clean scale-up:

1. **`triggerDomains` enum long-tail leak** — 50% of records fell back to `other`. The enum is
   missing real categories (candidates surfaced as dead-but-adjacent: `humiliation`,
   `loss_of_control`, `partner_unavailability`). Expand the enum before annotating 200 more, or
   n=200 inherits the same 50% catch-all.
2. **Sparse structure** — 23/50 records are single-action, so transition grammar (H1/H2/H9/H10) is
   data-starved. Either push finer action decomposition in the guide, or accept that transition
   claims stay provisional even at n=200.

Dead-enum signals (unused `affectLabels`, `behaviorActions`, etc.) are advisory only — unused values
may simply be long-tail; re-check at n=200 before pruning.

## P1-1B.1 — targeted guide refinement + controlled re-run

The two gate blockers above were addressed with three evidence-backed guide changes, then the SAME 50
records were re-annotated deterministically (`behavior/bin/refine-and-rerun.mjs`) with the discovery
algorithm **unchanged**, so any movement is attributable to the guide alone:

1. **Trigger split** — `other` → `{no_external_trigger | indeterminate | diffuse_internal_state}` via
   the classifier in `refinement-gap.mjs`. Result: trigger `other` **25 → 1**.
2. **Behavior action** — the action gap was 1.1% (1 fallback use), so **no record needed a new
   action**; candidates stay in vocab, unused.
3. **Functional mask** — mask re-expressed under the FUNCTIONAL definition (a reveal→X edge is a mask
   only if X reduces vulnerability exposure), attached as an explicit `maskAnalysis` block. 3 records
   populated (`self_mockery` ×2, `accusation` ×1); the count is not engineered to exceed the surface
   count.

### Additive vs substantive churn (why the re-run does NOT block)

The re-run changed **26/50 records (52%)**. Read naively that trips `GUIDE_CHURN_TOO_HIGH` — but 52%
is the wrong number to gate on. `evaluateDualStatus` now splits churn:

- **Additive** — a fallback token (`other`/`unknown`/`no_clear_action`) is replaced by a real
  category, or a previously-empty field is populated (`null → value`). This is the guide gap being
  *closed*; counting it as churn punishes the fix for working.
- **Substantive** — a previously-committed, non-fallback value is **flipped** to a different one.
  This is real annotation instability.

Only the **substantive** fraction gates `PROCEED_TO_200`. In the re-run all 26 changes are additive
(25 `other`→enum + 3 `null`→functional-mask), **0 substantive** — no committed judgment was reversed.

| verdict | value |
|---|---|
| grammar discovery | `GRAMMAR_DISCOVERY_SUCCESSFUL` (top bigrams stable, no hypothesis reversal) |
| annotation guide | `GUIDE_NEEDS_REFINEMENT` (high additive movement, residual `indeterminate`) |
| additive / substantive records | 26 / 0 |
| decision | **`PROCEED_TO_200`** (no blockers) |

The two verdicts are independent: a guide fix is not a discovery failure, and `PROCEED_TO_200` means
"collect more data under the refined guide" — it does **not** validate the grammar.

## Files

| File | Committed? | Content |
|---|---|---|
| `behavior/lib/grammar-discovery.mjs` | yes | discovery functions (transitions, couplings, arcs) |
| `behavior/lib/grammar-hypotheses.mjs` | yes | H1-H11 data-first evaluator |
| `behavior/lib/grammar-churn.mjs` | yes | annotation-guide churn detector |
| `behavior/lib/grammar-gate.mjs` | yes | PROCEED_TO_200 gate |
| `behavior/lib/grammar-candidate.mjs` | yes | schema validator + `production_ready` ban + rate rule |
| `behavior/schemas/behavior-grammar-candidate.schema.json` | yes | candidate grammar schema |
| `behavior/bin/discover-grammar.mjs` | yes | discovery driver |
| `behavior/discovery/*.aggregate.json`, `annotation-guide-churn.json` | yes | verbatim-free aggregates |
| `behavior/tests/grammar-discovery.test.mjs` | yes | 32 tests (synthetic, deterministic) |
| `private/pilot-50/grammar/*.private.json` | no (gitignored) | 11 link-bearing private outputs |

## Verification

- Raw corpus hash unchanged (`rawHashUnchanged: true`).
- Committed aggregates carry zero verbatim-bearing fields; all 287 keys are enum tokens (0 Chinese).
- 199 tests pass (behavior 109 + top-level 90), 0 fail.
- Driver output byte-identical across 3 runs.

---

# P1-1C — 200-Record Grammar Stability & Falsification Study

## Premise

50 records was *discovery* (how much support?). 200 records is *stability + falsification* (under what
conditions does each pattern FAIL?). The whole stage is built to try to break the P1-1B findings, not to
accumulate more confirmations. The pilot 50 are pinned inside the 200 so nothing is lost.

## What this stage found (headline)

**Terminal status: `BEHAVIOR_200_READY`.** The pipeline ran end-to-end, every artifact is deterministic
and verbatim-free, and the 1051 gate returned a defensible **HOLD** — not because the grammar collapsed,
but because a known instrument confound makes the 200-stage stability read *inconclusive* by construction.

The single most important result is a **methodology finding, not a character finding**: the 50 carry-over
records are hand-authored while the 150 new records were annotated by a deliberately conservative
heuristic instrument. That instrument under-detects multi-action sequences, functional masks, and
meta-tags. So every raw "SHIFTED" verdict is dominated by *which instrument annotated the record*, not by
the character behaving differently. This is surfaced first-class in `summary.aggregate.json`
(`instrumentShift.confounded: true`, heuristic share 0.688, single-action rate Δ +0.315).

## Selection (§2-3) — deterministic, pilot-preserving

- 200 records total: **50 originals preserved** + **150 new unique** (seeds `selection=46168593`,
  `presentation=11642349`, `holdout=4238823`). All five invariants hold (`originalsPreserved`,
  `newUnique`, `totalUnique`, `holdoutExcludesOriginals`, `discoverySupersetsOriginals`).
- Split: **160 discovery/stability + 40 sealed holdout**; the holdout excludes all originals and is
  disjoint from discovery (enforced as code + re-checked in the holdout driver).
- New records deliberately include mundane / ordinary text, so `no_external_trigger` is a *legitimate*
  category (86/160), not an escape hatch.

## Guide freeze (§4)

- `guideFreezeVersion = P1-1C.freeze.1`, fingerprint `9fad35528203…` over 5 artifacts (2 docs, 2 schemas,
  1 vocab). Every downstream stage calls `enforceFreeze` and aborts on `GUIDE_FREEZE_BROKEN`.
- Freeze checker is fail-safe: a fingerprint mismatch that cannot be localized to a per-artifact drift is
  reported `BROKEN`, never silently `UNCHANGED` (hardened this stage + covered by test).

## Annotation (§5)

- 160 annotated: 50 reused from refined-50 (hand), 110 via the conservative heuristic instrument.
- Grades: E0=84, E1=45, E2=31. E3/E4 are cross-corpus only and are *never* emitted by the single-record
  annotator — they can only be earned in §18.

## Stability (§6) — INCONCLUSIVE by construction

- All 9 pattern families read `SHIFTED`. **This is expected and is not evidence of drift** — it tracks the
  hand-vs-heuristic instrument change. Treated as INCONCLUSIVE pending single-instrument re-annotation.

## Counterexamples + falsification (§7-9)

- Grammar candidates by robustness on 160: **GC4 robust** (exclusivity→unique, 17 support / 1 CE),
  **GC5 robust** (explicit relationship-management, 27 / 10); GC2/GC3/GC6/GC7 weak-or-artifact;
  GC1 insufficient support.
- H1-H11 falsification (canonical wording preserved): **SURVIVES ×5** (H1, H4, H6, H8, H11),
  **WEAKENED ×2** (H2, H9), **REJECTED ×3** (H3, H5, H7), **INSUFFICIENT ×1** (H10). Every weakened/
  rejected hypothesis carries a revised formulation + boundary condition. Rejections that ride on
  heuristic-under-detected fields (H3 mask, H7 relationship-op frequency) are flagged as partly
  instrument-driven and must be re-tested under one instrument.

## Context-conditioned dimensions (§10-16)

Each dimension is reported **conditioned on context** and **split by cohort** (`carried_50` vs
`heuristic_110`); a `cohortNote` fires when the two instruments diverge ≥ 0.25 — flagged on
characterPriors, intraMessageMomentum, expectedPartnerOperations, maskAnalysis.

- **§10 priors** are per-trigger-domain, not flat: `public_evaluation → need_for_recognition = 0.70` is a
  strong domain-specific prior a flat count would blur.
- **§11** hair-trigger cell isolated with its low-low counter-cell (bounds H5); single-sided caveat stated.
- **§12** escalation measured among multi-beat records only (bounds H9).
- **§13** partner-op expectations counted confident-vs-speculative separately (bounds H8).
- **§14/§15** performance conditioned on audience (private-context performing isolated).
- **§16** functional mask rate over reveal-bearing records only; heuristic under-detection called out —
  the heuristic found only 4 reveal-bearing records in 110, so its mask rate is a small-sample artifact.

## Holdout validation + E3 survival (§17-18)

- Grammar verdicts on 160 were **frozen before** the sealed 40-record holdout was opened; the holdout
  driver is the only reader of the holdout, refuses to score without the pre-computed frozen grammar
  (`HOLDOUT_NOT_AUTHORIZED`), and re-checks disjointness.
- Holdout: CONFIRMED ×2, WEAKENED ×1, ABSENT ×3, REFUTED ×1.
- **E3-candidate survivors: GC4 and GC5** — the only two meeting all of: ≥8 unique support, ≥3
  counterexample *opportunities* examined, holdout-confirmed, not weak/prior-dominated. "E3-candidate"
  means *eligible for human review*, never *confirmed*.

## Guide churn + 1051 gate (§19-20)

- **`GUIDE_STABLE_FOR_FULL_SCALE`**: escape-hatch rate 0.175 < 0.20 budget; the frozen vocabulary fit the
  broader corpus. (The 0.95 weak-inference rate is a corpus+instrument property, not a guide defect, so it
  informs the gate but does not fail the guide.)
- **`HOLD_BEFORE_FULL_SCALE`**: the sole blocker is the instrument confound. Remediation is specific:
  re-annotate the 50 carry-overs with the *same* instrument (or hand-annotate a matched sample), re-run
  stability + falsification under one instrument, and carry forward only GC4/GC5 as priors on a fresh
  larger holdout. The fix is a single-instrument re-annotation, **not** more data.

## Files (P1-1C)

| File | Committed? | Content |
|---|---|---|
| `behavior/lib/heuristics-200.mjs`, `select-200.mjs` | yes | extended sampling buckets + selection engine |
| `behavior/lib/guide-freeze.mjs` | yes | freeze fingerprint + fail-safe checker + enforcement |
| `behavior/lib/heuristic-annotator.mjs` | yes | deterministic conservative annotator (the instrument) |
| `behavior/lib/grammar-stability.mjs` | yes | rank correlation, overlap@K, family verdicts |
| `behavior/lib/counterexample.mjs` | yes | GC1-GC7 candidates + true/competing/ambiguous buckets |
| `behavior/lib/hypothesis-falsification.mjs` | yes | H1-H11 falsification (revised formulations) |
| `behavior/lib/behavior-dimensions.mjs` | yes | §10-16 context-conditioned dimensions + cohort split |
| `behavior/lib/holdout-validation.mjs` | yes | §17-18 holdout scoring + E3 survival (anti-peeking) |
| `behavior/lib/full-scale-gate.mjs` | yes | §19-20 guide-churn + 1051 gate |
| `behavior/bin/*-200.mjs`, `freeze-guide.mjs` | yes | 9 stage drivers |
| `behavior/discovery-200/*.aggregate.json` | yes | 8 verbatim-free aggregates (integrity hashes only) |
| `behavior/tests/p1-1c-200.test.mjs` | yes | 22 tests (synthetic, deterministic) |
| `private/behavior-200/*.private.json` | no (gitignored) | 11 link-bearing private outputs |

## Verification (P1-1C)

- Every stage driver re-run byte-identical (`sha256sum` stable across runs), private + committed.
- All 8 committed aggregates: **0 CJK**, **0 record hashes** — the only 64-hex strings are the guide
  fingerprint, per-guide-artifact content hashes, and the raw-corpus SHA256 (integrity, not
  de-anonymizers).
- All 11 private outputs confirmed `git check-ignore` IGNORED.
- **144 behavior tests pass** (122 prior + 22 new), 0 fail.
- Engine untouched; no four-arm generation, no merge, no push.

## Terminal status

**`BEHAVIOR_200_READY`** — grammar frozen and holdout-validated; guide certified stable for full scale;
the 1051 gate HOLDS pending a single-instrument re-annotation. Stop here for user review.

---

# P1-1D — Annotation Instrument Bias Audit

## Premise

The research object here is **the annotation instrument, not the character**. P1-1C's sole 1051 blocker
was an instrument confound: the 200 records mixed hand annotation (Instrument A, 50 records) with the
heuristic annotator (Instrument B, 150 records), so any Grammar Shift could be an instrument artifact.
This audit measures **what Instrument B systematically mis-measures** and whether that changes the
Grammar Discovery conclusions.

## Design — paired A-vs-B on identical input (§1)

The only clean way to separate instrument from character without new human annotation (which the
directive forbids) is a paired design: run Instrument B on the **exact 50 records Instrument A already
annotated by hand**. The character (the raw `text`) is held constant, so every A↔B disagreement is a
**measured instrument effect**. A is the *reference* the downstream grammar was built on — not absolute
ground truth, but exactly the baseline whose drift decides whether B-annotated records can be pooled
with A-annotated ones. `pairAll` produces 50 `{id, a, b}` pairs; the whole audit is a function of these.

## What this stage found (headline)

- The instrument **loses 37% of reference actions** (detection ratio **0.629**, floor 0.85).
- It sees **almost no reveals** (reveal survival **0.161**): 26 of 31 reveal-bearing records lose the
  reveal entirely. The apparent "mask miss" is **downstream of reveal under-detection**, not an
  independent mask failure (mask FN = 0, FP = 0).
- Trigger domain agreement is **0.22**; the instrument routes specifics into escape hatches.
- **9 grammar families** sit under HIGH instrument threat; **6 of 7** grammar candidates are
  instrument-fragile. **GC5 is the only robust survivor.** GC4 — a P1-1C E3 survivor — is fragile.
- **Verdict: `BIAS_TOO_HIGH` → `HOLD_FIX_INSTRUMENT_FIRST`.** This independently **validates P1-1C's
  HOLD**: the two instruments cannot be pooled.

## §3 Action bias

| metric | value |
|---|---|
| reference actions (A) | 89 |
| instrument actions (B) | 56 |
| net detection ratio (B/A) | **0.629** |
| under-detected (A had, B missed) | 78 |
| over-detected (B invented, chiefly fallback tokens) | 45 |
| under-segmentation records (A ≥2 actions, B collapsed) | 23 |

Top under-detected actions: **reveal ×28**, seek_confirmation ×5, self_devalue ×5, perform_confidence ×4.
The dominant confusion is `reveal ⇒ no_clear_action` — the instrument doesn't see reveals and stamps a
fallback in their place.

## §4 Trigger bias

Domain agreement **0.22** (39/50 records disagree). Reference used an escape domain (other /
indeterminate) 15 times; the instrument, 8 — but on *different* records, so the low escape count is not
agreement, it is different specifics being lost. Fallback routing is the mechanism, not a safety net.

## §5 Mask bias (reveal-conditional — the critical reframe)

Among 31 reveal-bearing reference records: **FN = 0, FP = 0**, but **26 ambiguous-unjudgeable** because
the instrument never saw the reveal (reveal survival **0.161**). The honest reading: **there is no
independent mask failure** — the mask layer inherits the reveal under-detection upstream of it. Counting
this as a mask bias would double-count the reveal miss. §11's remediation therefore makes mask detection
*conditional on reveal detection first*.

## §6 Long-message bias

Action retention drops monotonically with reference text length — the instrument drops proportionally
**more** as utterances grow:

| length bucket | n | action retention (B/A) |
|---|---|---|
| 0-14 | 9 | 1.00 |
| 15-29 | 26 | 0.69 |
| 30-59 | 12 | 0.56 |
| 60+ | 3 | 0.31 |

## §2 Bias taxonomy (15 types)

15 named instrument biases (≥14 required), each with definition, primary annotation layer, support
sample, severity ∈ [0,1], and the grammar families it corrupts. Full definitions in the committed
aggregate; the ranked subset appears in §10. Types: under_segmentation, over_segmentation,
action_vocabulary_bias, trigger_fallback_bias, trigger_confusion, mask_detection_bias,
driving_force_suppression, driving_force_inflation, interaction_function_collapse,
relationship_operation_collapse, expected_partner_collapse, performance_collapse,
meta_self_monitoring_miss, weak_inference_inflation, prior_leakage.

## §7 Bias heatmap — per-layer reliability (best → worst)

reliability = 1 − worst bias severity on that layer.

| layer | reliability |
|---|---|
| L_confidence | 0.78 |
| L2_functions | 0.76 |
| L_relationship | 0.727 |
| L1_actions | 0.494 |
| L2_driving_force | 0.30 |
| L_expected_partner | 0.266 |
| L2_trigger | 0.22 |
| L_performance | 0.20 |
| L3_mask | 0.161 |
| L_meta | 0.10 |

Most reliable layer: **L_confidence**. Least reliable: **L_meta**.

## §8 Impact — grammar families under instrument threat (top 6)

aggregate threat: dominant bias severity + diminishing-weight contributions, capped at 1.

| grammar family | aggregate threat |
|---|---|
| reveal_grammar | 1.00 |
| performance_grammar | 1.00 |
| trigger_sensitivity | 1.00 |
| priors_grammar | 1.00 |
| self_monitoring_grammar | 0.90 |
| transition_grammar | 0.86 |

## §9 Grammar robustness — per-candidate bias sensitivity

| candidate | sensitivity | max dependency threat | fragile |
|---|---|---|---|
| GC1_delayed_reply_to_accuse_or_seek | HIGH | 1.00 | yes |
| GC2_reveal_to_mask | HIGH | 1.00 | yes |
| GC4_exclusivity_trigger_to_unique | HIGH | 1.00 | yes |
| GC6_low_trigger_high_activation | HIGH | 1.00 | yes |
| GC7_self_monitoring_present | HIGH | 0.90 | yes |
| GC3_accusation_seeks_reassurance | HIGH | 0.86 | yes |
| **GC5_relationship_management_explicit** | **LOW** | **0.273** | **no** |

**GC5 is the only instrument-robust candidate.** GC4 — a P1-1C E3 survivor — is fragile: its evidence
rides on trigger_sensitivity and priors_grammar, both maxed at threat 1.0.

## §10 Priority ranking — Top 10 by remediation benefit

benefit = severity × min(1, reach/3) × fixability.

| # | bias type | benefit | stars |
|---|---|---|---|
| 1 | mask_detection_bias | 0.503 | ★★★ |
| 2 | performance_collapse | 0.373 | ★★ |
| 3 | trigger_fallback_bias | 0.312 | ★★ |
| 4 | driving_force_suppression | 0.280 | ★ |
| 5 | action_vocabulary_bias | 0.260 | ★ |
| 6 | trigger_confusion | 0.260 | ★ |
| 7 | under_segmentation | 0.245 | ★ |
| 8 | over_segmentation | 0.135 | ★ |
| 9 | expected_partner_collapse | 0.122 | ★ |
| 10 | meta_self_monitoring_miss | 0.120 | ★ |

## §11 Remediation proposals (minimal — PROPOSALS ONLY, none applied)

The directive forbids modifying the instrument or grammar; these are minimal fixes for a future
single-instrument re-annotation, not changes made here.

- **mask_detection_bias** [review_question]: make mask conditional on reveal detection first — a mask
  question only fires once a reveal is detected (the "mask miss" is a reveal miss).
- **performance_collapse** [guide_rule]: add perform_confidence lexical cues (boast/flex markers).
- **trigger_fallback_bias** [guide_rule]: prefer the nearest specific trigger domain before falling back
  to other/indeterminate.
- **action_vocabulary_bias** [guide_rule + qa_test]: add lexical cues for the top-missed action (reveal);
  add a reveal-recall QA test on a fixed mini-set.
- **under_segmentation** [validator]: flag single-action annotations for a second segmentation pass when
  a coordinating/turn marker or newline is present.

## §12 Simulation — fix Top-1 and Top-2 (projection over MEASURED gaps, no re-annotation)

| rank | bias | measured gap | projected recovered | retention before → after |
|---|---|---|---|---|
| 1 | mask_detection_bias | 3 | 3 | 0.00 → 1.00 |
| 2 | performance_collapse | 4 | 3 | 0.20 → 0.80 |

Cumulative units recovered: **6**. Even fixing the top two biases leaves the action detection ratio and
trigger agreement far below tolerance — the confound is structural, not a two-fix patch.

## §13 Stop rule

**`BIAS_TOO_HIGH` → `HOLD_FIX_INSTRUMENT_FIRST`.** Any one of these trips it; all three fire:

1. action detection ratio **0.629 < 0.85** floor,
2. **9** grammar families under HIGH threat (≥0.6),
3. a P1-1C E3 survivor (**GC4**) is instrument-fragile.

This is the decisive result: it **independently validates P1-1C's HOLD_BEFORE_FULL_SCALE**. B-annotated
records cannot be pooled with A-annotated records; a single-instrument re-annotation is required before
grammar shift can be attributed to character rather than instrument.

## The 18 required outputs

| # | output | where |
|---|---|---|
| 1 | bias taxonomy (15 types) | §2 + committed `taxonomy` |
| 2 | bias heatmap (layer × bias) | §7 + committed `heatmap` |
| 3 | action bias | §3 + committed `actionBias` |
| 4 | trigger bias | §4 + committed `triggerBias` |
| 5 | mask bias | §5 + committed `maskBias` |
| 6 | long-message bias | §6 + committed `longMessageBias` |
| 7 | layer reliability | §7 `layerReliability` |
| 8 | grammar sensitivity (impact) | §8 + committed `impact` |
| 9 | grammar robustness (per-candidate) | §9 + committed `robustness` |
| 10 | Top-10 priority | §10 + committed `priority` |
| 11 | minimal fixes | §11 + committed `remediation` |
| 12 | simulation (fix top-2) | §12 + committed `simulation` |
| 13 | bias status | **`BIAS_TOO_HIGH`** |
| 14 | PROCEED_TO_1051? | **NO — `HOLD_FIX_INSTRUMENT_FIRST`** |
| 15 | changed files | see Files (P1-1D) below |
| 16 | tests | 27 new, full suite **171 pass / 0 fail** |
| 17 | raw corpus hash | `a081bdf240426ee3b6cf325132c2910153fc343b75ef0cdcda4d632d9486ded8` (round-a.refined.private.json) |
| 18 | git status / branch | branch `p1-1a/single-sided-behavior-pilot`; artifacts uncommitted (no commit/push/merge/PR per directive) |

## Files (P1-1D)

| File | Committed? | Content |
|---|---|---|
| `behavior/lib/instrument-bias.mjs` | yes | paired design + §3-§6 measurements + layer coverage |
| `behavior/lib/instrument-bias-synthesis.mjs` | yes | §2 taxonomy, §7-§13 synthesis + orchestrator |
| `behavior/bin/instrument-bias-audit.mjs` | yes | driver; fail-closed CJK/hash guard on committed output |
| `behavior/discovery-1d/instrument-bias.aggregate.json` | yes | verbatim-free aggregate (ids → counts) |
| `behavior/tests/instrument-bias.test.mjs` | yes | 27 tests (synthetic, deterministic) |
| `private/behavior-1d/instrument-bias.private.json` | no (gitignored) | full audit incl. link-bearing id arrays |

## Verification (P1-1D)

- Driver re-run byte-identical (`sha256sum` stable), committed + private.
- Committed aggregate: **0 CJK**, **0 record hashes / 64-hex tokens**, no `text` / `textualEvidence`,
  id arrays reduced to counts. The driver **refuses to write** (exit 2) if CJK or a 64-hex token
  appears — fail-closed, so this cannot silently regress.
- Private output confirmed `git check-ignore` IGNORED; committed aggregate confirmed NOT ignored.
- **171 behavior tests pass** (144 prior + 27 new), 0 fail.
- Instrument (`heuristic-annotator.mjs`) untouched; grammar untouched; no re-annotation, no push, no
  merge, no PR.

## Terminal status

**`INSTRUMENT_BIAS_TOO_HIGH`** — the annotation instrument's measured bias against the hand reference is
too high to pool instruments: action detection 0.629, reveal survival 0.161, 9 grammar families under
HIGH threat, and E3 survivor GC4 fragile. GC5 is the only robust candidate. This independently confirms
P1-1C's `HOLD_BEFORE_FULL_SCALE`; a single-instrument re-annotation is the prerequisite for 1051. Stop
here for user review.

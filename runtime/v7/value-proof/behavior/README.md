# Single-Sided Behavioral Evidence Corpus (单侧行为观察语料库)

This layer turns 1051 lines of **one speaker's** (糖糖) verbatim utterances into rigorously
graded behavioral evidence. There is no partner turn and none will be supplied — that is a
permanent property of the data, not a blocker.

## What this layer is (and is not)

- **Is**: a method for deriving, from single-sided output, 糖糖's behavior atoms, interaction
  functions, expression strategies, latent-need candidates, expected-reply classes, and
  escalation paths — each with an explicit evidence grade and known-unknowns.
- **Is not**: a wording corpus, and not event→reply pairs. The missing partner turn means we
  never reconstruct the trigger, the actual reply, the causal event, or the relationship-state
  change. We annotate the *speaking behavior* only.

## Charter (frozen for this layer)

- **No engine changes.** This layer produces evidence and patterns; it does not touch the
  frozen 11-stage engine.
- **No fabrication.** Never invent partner text, scene, or event context. Every latent-need /
  affect / expected-reply field is a *candidate* with confidence, alternatives, and an
  uncertainty reason.
- **No single-record personality rules.** A pattern (L4) exists only when multiple independent
  records support it and it survives the E3/E4 requirements.
- **Model assists, humans decide.** Model suggestions are candidates; E3/E4 require human review.

## Four-layer separation (§2)

| Layer | Meaning | Never contains |
|------|---------|----------------|
| L1 observable | speech acts, behavior atoms, wording contradiction, punctuation | psychology |
| L2 function | what the utterance tries to achieve in the interaction | need claims |
| L3 latent need | need **candidates** + confidence + alternatives + uncertainty | asserted facts |
| L4 pattern | cross-corpus regularity from many records | single-record inference |

## Evidence grades (§3)

`E0` context-dependent/unknowable · `E1` observable local act · `E2` supported interaction
function · `E3` recurring pattern · `E4` high-confidence core regularity candidate. E3/E4
requirements are enforced by `lib/pattern.mjs`, not by the schema alone. See
[`docs/EVIDENCE_GRADING.md`](docs/EVIDENCE_GRADING.md).

## SSOT and privacy

- **Vocabulary SSOT**: [`policy/behavior-vocab.json`](policy/behavior-vocab.json). Schemas
  reference it via `enumFrom`; no enum is duplicated in a schema. New labels enter through
  `extensionProposals` and need ≥5 real supporting samples before promotion (§4).
- **Raw corpus is never committed.** It resolves at runtime from a gitignored path or the
  `RAIN_PUSH_SINGLE_SIDED_CORPUS` env var (see `lib/raw-corpus.mjs`). Everything that lands in a
  log, report, or git artifact goes through `redactedRecord()` / `redactedBatch()` — hashes,
  order, length, punctuation shape only, **never verbatim text**.
- Committed artifacts: importer, validators, schemas, guides, no-text audit/summary, tests,
  synthetic fixtures. **Never**: verbatim lines, sampled lines in reports, the database.

## Guides

- [`docs/ANNOTATION_GUIDE.md`](docs/ANNOTATION_GUIDE.md) — the 12 questions each record must
  answer, and the forbidden answers (§10).
- [`docs/EVIDENCE_GRADING.md`](docs/EVIDENCE_GRADING.md) — E0–E4 and the E3/E4 gates (§3).
- [`docs/EXPECTED_REPLY_GUIDE.md`](docs/EXPECTED_REPLY_GUIDE.md) — functional reply classes
  without reconstructing partner text (§7).
- [`docs/TRANSITION_GUIDE.md`](docs/TRANSITION_GUIDE.md) — surface↔function transitions and the
  concurrency classes that gate them as evidence (§5, §6).

## Processing stages (§9) and quality gates (§14)

Stage 1 clean audit → Stage 2 **50-record pilot** (two rounds) → Stage 3 200 records (only if
pilot gates pass) → Stage 4 full 1051 (only if 200 passes). **This branch delivers Stage 1 +
the Stage-2 pilot tooling only.** It does not process the full corpus and does not run the
four-arm evaluation.

Pilot quality gates (§14): observable acts ≥90%, interaction function ≥80%, expected reply
≥80%, latent-need candidate ≥70%, evidence grade ≥85% inter-round agreement. Below any → revise
the annotation guide and re-annotate; do not expand to 200.

## Hypotheses under test (§13)

H1–H7 are hypotheses, not conclusions. Each pilot run reports `supported /
partially_supported / unsupported / not_evaluable` with sample counts, supporting hashes,
counterexample counts, confidence, and limitations. See `lib/hypotheses.mjs`.

# Annotation Guide — Single-Sided Behavioral Evidence

Every record is annotated against the four layers (L1–L4) with strict separation. Fill L1 from
what is literally on the page; only then move up. When in doubt, grade lower and record the
uncertainty. All enums come from `policy/behavior-vocab.json` — if a needed label is missing,
propose it in `extensionProposals` (it is invalid until promoted with ≥5 samples).

## The 12 questions each record must answer (§10)

1. **What did the text literally do?** → L1 speech acts + behavior atoms.
2. **To whom?** → L1 `attentionTarget` (partner / self / third_party / audience / unknown).
3. **What was explicitly requested?** → L1 `explicitRequest` (+ atom `request_practical_action`
   or `ask` if applicable).
4. **What is the implied interaction function?** → L2 `functions` (may be several).
5. **Which emotions are visible?** → `affect.primary` (+ others if present).
6. **What contrary or masked emotion is evidenced?** → `affect.opposing` / `masked` / `leak`,
   with a `concurrencyClass` (see below).
7. **Most likely latent need?** → L3 candidate(s), each with confidence + alternatives +
   uncertainty reason. Never a bare assertion.
8. **What alternative explanations exist?** → L3 `alternatives` (and note the strongest).
9. **What reply class does it seek?** → `expectedReply.functionalExpectedReply`.
10. **Which replies would fail to satisfy it?** → `expectedReply.likelyUnsatisfyingReplies`.
11. **Is there escalation pressure?** → `expectedReply.likelyEscalationIfUnsatisfied`.
12. **Which judgments depend entirely on missing context?** → `contextDependentJudgments`.

## Concurrency class gates affect-as-evidence (§6)

Mark each multi-emotion / contradiction observation:

- `A_explicit` — both affects are explicit in the wording.
- `B_context_strong` — context strongly supports the second affect.
- `C_designed_inference` — inferred from our design goals. **Hypothesis only** — excluded from
  pattern statistics.
- `D_undecidable` — cannot decide.

Only **A / B** count as behavioral evidence. C is retained but never enters the main pattern
results (prevents design goals from being laundered into "canon evidence").

## Forbidden answers (§10)

Never write, infer, or reconstruct:

- what the partner actually said, or the specific scene/event;
- a precise relationship state, or exact emotion percentages, or fixed personality ratios;
- unsupported adult / crisis / drug-severity framing (a dark/adult/drug surface is **not**
  automatically a severe state — see H6; its function may be joke, performance, intimacy,
  discharge, or a real event, and the corpus must decide).

## Model-assist rules (§11)

The model may propose candidate labels, extract literal linguistic evidence, offer alternative
explanations, cluster, and surface repeated patterns for human review. The model may **not**:
mark an inference as fact, raise an evidence grade, complete missing context in its own style,
fabricate a partner turn, write a high-confidence behavior rule, decide a need/emotion from a
single keyword, or backfill our prior design goals as if they were source evidence. Model
suggestions carry `modelSuggested:true`; E3/E4 patterns require `humanReviewed:true`.

## Two-round protocol

Each record is annotated independently in `round:1` and `round:2` (ideally different annotators,
or the same annotator blind to round 1). `bin/consistency.mjs` computes per-field agreement; the
§14 gates decide whether the pilot passes or the guide needs revision.

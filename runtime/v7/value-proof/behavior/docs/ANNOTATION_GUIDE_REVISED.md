# Annotation Guide — Single-Sided Behavioral Evidence (Revised, P1-1A.2)

This revises the static four-label model into a **behavior-chain + multi-function + character-specific
driving-force + multi-affect + relationship-management + layered-expected-reply** model. The v1 guide
(`ANNOTATION_GUIDE.md`) still governs the v1 committed schema and its tests; this file governs the
revised schema (`behavior-annotation-revised.schema.json`) and the real Round-A initial pass.

Core stance: **rigor is not normalizing 糖糖 into an average person.** Do not calibrate her against an
ordinary-human threshold. If the corpus repeatedly shows *small trigger → strong relational
uncertainty → strong confirmation / possessiveness / testing / catastrophizing*, then a **low trigger
threshold is itself a character regularity** and belongs in the downstream prior — but a character
prior can never impersonate current single-record evidence.

Every inference must separate:
`current record evidence` · `interaction structure` · `cross-corpus character prior` · `alternative explanations`.

## 1. Pipeline order (do NOT collapse into one "big emotion verdict")

```
L1 Observable Evidence
 → Behavior Action Sequence
 → Interaction Functions (multi)
 → Affect Structure
 → Driving Force Candidates
 → Trigger Sensitivity
 → Relationship Management
 → Meta Self-Monitoring
 → Expected Reply (3 layers)
 → Evidence Grade
 → Review Flags
 → Failure Risk
```

## 2. Behavior Action Sequence (§2)

1–8 actions in **text order**, each `{ action, order, confidence, textualEvidence, notes }`. Only label
actions that literally happen; `order` must reflect the intra-utterance chain; multiple actions per
utterance are allowed; a **hidden need is never an action**; do not pad actions to look complex. A new
action label needs ≥5 real supporting samples before promotion (`extensionProposals`). Watch for
candidate chains like `reveal→mask`, `apologize→justify→self_devalue→seek_confirmation`,
`tease→accuse→retract`, `future_bind→seek_confirmation` — candidates, not preset answers.

## 3. Multi-Function Interaction (§3)

`interactionFunctions.functions[]`, each `{ function, role, confidence, textualEvidence?, alternatives?, contextDependency? }`.
Caps: **primary ≤1, secondary ≤2, supporting ≤3**. When primary is undecidable, use `unknown`. Do not
fill every slot just to appear multi-functional.

## 4. Affect Structure (§4)

Keep `primarySurface / opposingAffect / maskedAffect / leakedAffect`, each `{ value, confidence }`. New
`coexistenceType`: `simultaneous | sequential | ambiguous | unknown` — distinguishes "shy → then bold"
from "shy and bold at once". **Only fill a dimension when evidenced.** The project's interest in complex
affect does NOT license auto-filling opposing/masked/leaked on every record.

## 5. Driving Force Candidates (§5)

Not a momentary emotion, not a clinical diagnosis, not a fixed personality percentage — the
**directional force most likely driving the current interaction strategy.** Max 3. Each carries
`candidate, confidence, evidence, alternativeExplanation, whatWouldChangeMyMind, contextDependency,
inferredFrom[], priorContribution, recordSpecificSupport`.

## 6. Character prior vs current evidence must stay separate (§6)

`priorContribution` = cross-corpus historical pattern; `recordSpecificSupport` = this utterance alone.
Final confidence cannot rest on prior alone.

- Invalid: "糖糖很 needy，所以这里一定怕被抛弃。"
- Valid: "this utterance shows availability-monitoring + catastrophic exclusivity reading + explicit
  reassurance demand together; that structure recurs in her other low-intensity reply-delay records,
  so the attachment-related driving force gets higher posterior support."

## 7. Do not correct 糖糖 with a normal-person threshold (§7)

Use a **Character-Specific Empirical Baseline** — her own corpus distribution. If the corpus proves
`minimal trigger → high internal activation`, a low-intensity trigger does NOT imply a low-intensity
internal state; that abnormally low threshold is character information, not noise. But the low threshold
must come from cross-corpus evidence, never be established by a single record.

## 8. Trigger Sensitivity (§8)

`{ domain, observedTriggerIntensity, inferredInternalActivation, thresholdInterpretation, confidence,
evidence, requiresCrossCorpusSupport }`. **`thresholdInterpretation: characteristically_low` cannot be
established by a single record** — only by referencing an existing cross-corpus provisional prior
(`requiresCrossCorpusSupport` must be true; enforced by the validator).

## 9. Affect may feed driving-force inference but never equals it (§9)

`Affect + Observable Action + Interaction Function + Character Prior (if any) → Driving Force Candidate.`
Allowed: jealousy + exclusivity testing + attention comparison → `need_to_be_unique`. Forbidden direct
maps: `sad→fear_of_abandonment`, `angry→need_for_control`, `arousal→need_for_closeness`. A behavior or
interaction structure must mediate.

## 10. Adult / dark / drug modelling (§10)

These are first **context / state / content** (`stateContext.domains`), NOT driving forces. They can
amplify inhibition, expression intensity, impulsivity, masking, boldness, self-monitoring, risk
perception, attachment expression. Allowed: drug-state + observable disinhibition + attachment-seeking →
a *more visible* pre-existing attachment force. Forbidden: `drug→need_for_closeness`,
`adult→desire_confirmation`, `dark_joke→fear_of_abandonment`. Keep amplifier separate from force
(validator enforces the direct-map ban).

## 11. Neither auto-reject nor auto-accept "needy-looking" (§11)

Decompose into structure: does it demand a reply? monitor reply speed? demand special status? read
ambiguous feedback as relational risk? future-bind? push-away/invite-pursuit? trade self-devaluation for
confirmation? overreact to a tiny availability disruption? repeatedly re-confirm the bond? Multiple
co-present structures + existing prior → higher-confidence attachment force. A bare "别离开我 / 你喜欢我吗"
alone → keep higher uncertainty.

## 12. Relationship Management (§12)

`{ present, operations[], confidence, evidence }`. Captures "this line actively manages the relationship,
not merely expresses emotion." **Never default `present:true`** (validator: when not present, operations
must be empty).

## 13. Meta Self-Monitoring (§13)

`{ tags[], confidence, evidence }` — self_observation / self_judgment / anticipation_of_backlash /
awareness_of_performance|dependency|excess|contradiction / none / unknown. For lines like "我是不是…",
"我知道我这样", "这想法危险", "我是不是玩脱了". Not defaulted.

## 14. Expected Reply — three independent layers (§14)

`immediateReply / relationshipReply / longerTermReply`, each `{ classes[], confidence, textualEvidence?,
alternatives?, contextRequired? }`, each may be `unknown` on its own. Plus
`likelyUnsatisfyingReplyClasses[]`.

## 15. Base-rate calibration (§15)

Cross-corpus stats will later form a Character-Specific Empirical Prior (prevalence, context-conditioned
prevalence, typical trigger intensity, typical strategies, expression transforms, false-positive risk,
counterexamples). Forbidden: uniform 50% prior, ordinary-population prior as substitute, freezing a
production constant in pilot. **At the 50-record stage every base rate is `provisional` only.**

## 16. Round-A nature (§16)

This pass is `model_assisted_research_annotation` — **NOT human ground truth**; the user will review,
edit, overturn. Every inference carries confidence; every E2 needs written evidence; `weak_inference`
never enters strong stats; all ambiguity goes to `reviewFlags`; the model's own preference is not the
correct answer. Single record → **E0/E1/E2 only**, never E3/E4.

## 17. Review Flags (§17)

From `reviewFlags` vocab: context_missing_materially, persona_surface_uncertain, joke_literal_ambiguity,
quote_or_reenactment_possible, plot_event_possible, public_private_ambiguity, adult/dark/drug_context_ambiguous,
driving_force_uncertain, expected_reply_uncertain, multi_function_overlap, action_sequence_uncertain,
translation_artifact_possible, character_prior_used, low_trigger_high_activation_candidate.

## 18. Especially-careful records (§18)

PA-019, PA-022, PA-025, PA-029, PA-032, PA-038, PA-040, PA-047, PA-049 — high complexity, not "standard
answers". PA-029 / PA-040: a "死/杀" token does NOT auto-escalate to severe — separate symbolic threat /
dark humor / possessive exaggeration / actual severe state / insufficient context. PA-012: 媚药 does NOT
auto-mean intimacy escalation — first weigh curiosity / disinhibition candidate / risk ambiguity /
surface boldness / possible adult context.

## 19–21. Candidate transforms & descriptive-only stats

Report each candidate transform (§21: vulnerability→irritation, attachment_concern→accusation,
shame→bold_escalation, fear_of_rejection→control, affection→teasing_attack, reassurance_request→command,
sadness→exaggerated_spectacle, desire→challenge, jealousy→exclusivity_demand, overload→absurd_humor,
public_confidence→private_crash, self_exposure→immediate_masking) with support / counterexamples /
ambiguous cases / alternative functional reading. Do NOT force a transform just because the guide names
it. Stats stay **descriptive only** (§20): no E3/E4, no "core regularity proven" — only pilot
observations, provisional priors, candidate transforms, human-review priorities.

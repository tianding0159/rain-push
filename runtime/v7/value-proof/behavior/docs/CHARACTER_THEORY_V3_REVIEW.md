# Character Theory v3 — Architecture Review

Status: **review only** — no schema/engine/annotation changes made. This report evaluates
whether the proposed 7-layer Character Theory is the *minimal-and-sufficient* theory for 糖糖's
behavior, using the 50-record Round-A pilot (`private/pilot-50/round-a.revised.private.json`)
and the 1051-line raw corpus as the empirical base.

Verdict up front: **the 7-layer chain is NOT minimal.** Three of the proposed layers
(`Relationship Concern`, `Move Pattern`, `Desired Relationship State`) fail their own burden of
proof at n=50 and are demoted to **Derived**. `Character Conservation` as a *hard* law is
**rejected** (empirically non-invertible) but survives as a *soft diagnostic*. The rest of the
theory is frozen.

---

## 0. Method note (why n=50 can only demote, not delete)

Every claim below is tested against 50 real records. n=50 is enough to **refute a "necessary"
claim** (one clean dissociation is a counterexample) but not enough to **prove a layer is
permanently useless**. So the strongest action this review takes on a weak layer is
**demote to Derived + mark "needs corpus re-test at n≥150"**, not hard-delete from the vocabulary.
This is deliberate: deleting a vocabulary now would be an irreversible engine-touching change,
which is out of scope this round.

---

## 1. Theory / Schema / Statistics decoupling

The single biggest architectural problem today: **the theory does not exist as its own artifact.**
There is a Schema (`behavior-annotation-revised.schema.json`), a Statistics layer
(`round-a-stats.mjs`), and a prose guide — but "Character Theory" is only *implied* by the schema
field list. That inversion (schema defines theory) is exactly what must stop.

Classifying every current field into the three layers:

| Field (schema) | True layer | Rationale |
|---|---|---|
| `drivingForceCandidates[].candidate` | **Theory** | the driver ontology *is* the causal claim |
| `interactionFunctions[].function` | **Theory** | strategy ontology = "what the character is trying to do" |
| `affect.*` (blend/coexistence) | **Theory (modulation)** | belongs to theory but off the main chain |
| `triggerSensitivity.domain` | **Theory (situation)** | this is the real "Situation/Concern" axis (see §3) |
| `expectedReply.{immediate,relationship,longerTerm}` | **Theory** | the "desired state" claim lives here already (see §6) |
| `relationshipManagement.{present,operations}` | **Schema+Theory** | operations overlap strategy vocab; present-flag is bookkeeping |
| `behaviorActionSequence[].{action,order}` | **Schema** | the *recording* of moves; ordering is data, not theory |
| `l1_observable.*`, `text`, `recordHash`, `annotator`, `round`, `modelSuggested`, `annotationNature`, `recordFormatVersion` | **Schema** | provenance / observable bookkeeping |
| `metaSelfMonitoring.tags` | **Schema+Theory** | tags are theory; the per-record presence is data |
| `evidenceGrade`, `reviewFlags`, `failureRiskNotes` | **Statistics/Process** | confidence + review routing, not the character model |
| `triggerSensitivity.{observedIntensity,inferredActivation,thresholdInterpretation,requiresCrossCorpusSupport}` | **Statistics (Prior)** | these are cross-corpus rate claims, not per-record truth (see §9) |

**Split proposal (no code this round, target state):**

- `behavior/theory/character-theory.v3.json` — the ontologies + the main causal chain + which
  axes are modulation vs prior. **Source of truth for "why".**
- `behavior/schemas/*.schema.json` — how to *record* an observation. May reference theory
  ontologies via `enumFrom`, but must never add a causal claim.
- `round-a-stats.mjs` + a future `character-prior.json` — "does the corpus support it", including
  everything in the Statistics rows above.

Invariant to enforce later: **theory may change only from corpus evidence, never because a schema
field was renamed.** Today that invariant is unenforceable because theory has no file.

---

## 2. Character Theory v3 — layer-by-layer challenge

Proposed chain: `Situation → Driver → Concern → Strategy → Move → Desired State → Language`,
with `Affect / Persona / Language-fingerprint` as modulation and `Trigger Sensitivity` as prior.

| Layer | Necessary? | Distinct? | Deleting degrades R/G/D? | Verdict |
|---|---|---|---|---|
| Situation | yes | yes (= `triggerSensitivity.domain`) | Retrieval yes | **KEEP** (rename: Situation = trigger domain) |
| Driver | yes | yes | R+G+D yes | **KEEP** (core) |
| Concern | **no** (§3) | **no** — collapses into Situation | no measurable degradation | **DEMOTE → Derived** |
| Strategy | yes | yes | G+D yes | **KEEP** (core) |
| Move | partial | **no** (§5) — derivable from `behaviorActionSequence` | no | **DEMOTE → Derived** |
| Desired State | **no** (§6) | **no** — = `expectedReply.relationshipReply` | no | **DEMOTE → Derived (rename existing field)** |
| Language | yes | yes | G yes | **KEEP** (surface/output) |
| Affect (mod) | yes | yes (§7) | G yes, chain no | **KEEP as modulation** |
| Persona (mod) | yes | yes (§8) | G yes | **KEEP as surface policy** |
| Trigger prior | yes | yes (§9) | D yes | **KEEP as prior table, not per-record** |

Frozen main chain after review (§6 of the output spec):

```
Situation (=trigger domain)
  → Driver
    → Strategy            [Affect ⇒ modulates Language only]
      → Language           [Persona ⇒ surface policy on Language]
```

with `Move`, `Concern`, `Desired State` as **derived views**, and a **Trigger-Prior table**
sitting *beside* the chain (not inside the packet).

---

## 3. Relationship Concern — DEMOTED

Burden: prove that with **Driver fixed**, a differing **Concern** flips **Strategy**. If the thing
that flips strategy is just the *situation*, then "Concern" is not a missing layer — it is a
renamed Situation.

Evidence (`fear_of_abandonment`, n=9 — the richest driver):

| Record | Situation (trigger domain) | Strategy |
|---|---|---|
| PA-025 | exclusivity_threat | test_exclusivity |
| PA-040 | exclusivity_threat | test_exclusivity |
| PA-032 | delayed_reply | test_exclusivity |
| PA-049 | delayed_reply | obtain_specific_reassurance |
| PA-003 | perceived_rejection | obtain_specific_reassurance |
| PA-048 | perceived_rejection | obtain_specific_reassurance |
| PA-047 | perceived_rejection | repair_relationship |
| PA-019 | ambiguous_feedback | conceal_vulnerability |
| PA-022 | isolation | build_future_bond |

Same driver → 5 strategies. **But the strategy tracks the Situation, not an independent Concern.**
When I collapse "Concern" into "Situation" and test (Driver @ Situation) → Strategy across all 50:
**6 cells constant, 11 cells still varying.** So:

1. Concern adds nothing beyond Situation (it *is* Situation under a nicer name), and
2. even Situation+Driver does **not** determine Strategy at n=50 — the residual variance is real
   and is carried by Affect + persona + the specific move, i.e. by layers we already have.

I cannot produce the required **10 minimal pairs where Driver+Situation are identical but a
separately-named Concern flips Strategy** — because Situation already absorbs every such flip. By
the review's own rule ("if you can't, Concern should not be independent"), **Concern is demoted to a
derived label** = `driver × situation`. Re-test at n≥150: if a driver+situation cell still splits
by something nameable, promote it back.

---

## 4. Strategy — KEEP, with a de-duplication warning

Strategy vocab (`interactionFunctions`, 22 tokens) vs Move vocab (`behaviorActions`, 32 tokens):
**0 literal overlap** — good, they are not the same list. But several strategy tokens are
semantically a *single move wearing a strategy hat*:

| Strategy token | Near-duplicate Move | Risk |
|---|---|---|
| `test_exclusivity` | `seek_exclusivity` | strategy = one move |
| `establish_boundary` | `set_boundary` | strategy = one move |
| `conceal_vulnerability` | `conceal` / `mask` | strategy = one move |
| `intensify_intimacy` | `seek_proximity` | thin abstraction |
| `solicit_validation` | `seek_confirmation` | thin abstraction |

These are the tokens drifting toward Move. **Recommendation (defer to n≥150):** a token qualifies as
Strategy only if it can be realized by **≥2 distinct moves** in the corpus; if it is always realized
by exactly one move, demote it to Move. Not acting now (vocabulary edit = engine-touching).

---

## 5. Move Pattern — DEMOTED (fully derivable)

Claim to test: can `Move` be reconstructed from `behaviorActionSequence` alone?
`behaviorActionSequence` already records `{action, order, textualEvidence}` for up to 8 steps —
that **is** the move pattern (ordered atomic moves + their surface evidence). A separate "Move
Pattern" layer would re-encode `action` + `order`, which the sequence already holds.

What a separate Move layer would add that the sequence lacks: **nothing observed at n=50.** The one
thing the sequence *cannot* express — a move's *strategic role* — is already captured by
`interactionFunctions[].role` (primary/secondary/supporting). So Move = a **view** over
`behaviorActionSequence` grouped by `interactionFunctions`. **Demote to Derived.** No new field.

(If a later corpus shows a recurring *multi-record* move template that a single record's sequence
can't express — e.g. a signature 3-beat "reveal→retract→seek_confirmation" that only means
something across records — that would justify promoting Move to a pattern-mining output, still not a
per-record field.)

---

## 6. Desired Relationship State — DEMOTED (it already exists)

"Desired State" is **not a new field**: `expectedReply` already has three tiers —
`immediateReply`, `relationshipReply`, `longerTermReply`. `relationshipReply` **is** the desired
relationship state. So the question is only: does the `relationshipReply` tier earn its place next
to `immediateReply`? The review demands dissociation both ways.

Tested across all 50 (proxy: immediate = `immediateReply.classes`, desired = `relationshipReply.classes`):

- **(A) same immediate reply, different desired state: 40 pairs.** e.g. PA-002 vs PA-004 both want
  `reassure,stay_present` immediately, but PA-002 wants `remain_available` (availability) while
  PA-004 wants `validate_identity` (recognition).
- **(B) same desired state, different immediate reply: 256 pairs.** e.g. PA-003 vs PA-016 both
  ultimately want the bond reaffirmed, but one solicits reassurance and the other punishes neglect.

So the *three-tier `expectedReply`* is justified — the tiers genuinely dissociate. **But that means
"Desired State" is already modeled; it does not need to be a separate top-level theory layer.**
Verdict: **keep the `relationshipReply` tier; demote "Desired Relationship State" as a named layer
to "a renamed view of `expectedReply.relationshipReply`."** Optional cosmetic rename deferred.

---

## 7. Emotion — CONFIRMED as modulation (stays off the main chain)

Claim: Affect modulates **Language**, not **Strategy**. Test: hold Strategy fixed, see if Affect
varies (modulation) without changing the strategy.

| Strategy (fixed) | Affect blends observed | Reading |
|---|---|---|
| `discharge_overload` (n=6) | sadness (PA-002/018/043) **and** anger (PA-033/036/046) | same strategy, opposite affect ⇒ modulation |
| `obtain_specific_reassurance` (n=6) | 5 distinct blends incl. fear, sadness, fear/loneliness | modulation |
| `reduce_distance` (n=6) | 5 blends: calm, joy, excitement/fear, affection | modulation |
| `test_exclusivity` (n=4) | fear, anger/fear, jealousy/affection | modulation |

Affect changes the *coloring* of the language while the strategy holds. **No record at n=50 forces a
strategy change purely because of emotion** — where strategy differs, Situation or Driver also
differs. **Emotion stays as modulation. No genuine exceptions found at this n.** (Flagged for
re-test: `anger`-loaded `discharge_overload` sometimes co-occurs with `escalate` moves; watch
whether high-arousal anger ever *forces* `establish_boundary` at larger n — that would be the first
real exception.)

---

## 8. Persona (Ame / KAngel / 超天酱) — KEEP as Surface Policy

Test: do the personas share Driver / (Concern) / Strategy, differing only at the surface? At n=50
the schema only carries a `personaSurfaceCandidate` string + a `switch_persona` move +
`persona_surface_uncertain` flag — there is **no record where a persona switch co-occurs with a
Driver change.** PA-025 ("if I stop being 超天酱, will you still love me") explicitly *separates*
identity-surface from the underlying `fear_of_abandonment` driver — evidence that persona is a skin
over a shared driver, not a separate goal system.

**Verdict: keep the Surface Policy stance (personas share driver/strategy, differ in language).**
No candidate found where Goal changes with persona. Re-test trigger: any record where KAngel pursues
a goal Ame would not — none at n=50.

---

## 9. Trigger Sensitivity — MOVE to a Character-Prior table

Per-record `triggerSensitivity` currently forces every annotation to assert `observedIntensity /
inferredActivation / thresholdInterpretation` — but those are **cross-corpus rate claims**, not
facts about a single utterance. The evidence: 31/50 records sit at E0/E1 and their trigger
`confidence` is mostly `weak_inference`/`unknown`; `characteristically_low` is only meaningful *with*
`requiresCrossCorpusSupport=true` (a rule we already enforce). That is a prior wearing a per-record
costume.

**Proposal:** keep only `triggerSensitivity.domain` per record (that is Situation, §2). Move
intensity/activation/threshold into a standalone **Character-Prior table**:

```
delayed_reply     → driver: sensitivity_to_unavailability
                  → typical strategy: obtain_specific_reassurance | test_exclusivity
                  → typical move: seek_confirmation | accuse→retract
                  → typical affect: fear (± anger)
                  → threshold: characteristically_low  [needs n≥150]
```

This is exactly the shape the review sketches, and the pilot already supports the rows (PA-006 /
PA-032 / PA-049 for `delayed_reply`). **Keep it as a prior; stop paying per-record packet cost.**

---

## 10. Character Packet — compressed

Proposed packet: `{Situation, Driver, Concern, Strategy, Move, Desired State, Affect, Persona,
Language}` — 9 slots. After §3/§5/§6, three slots are derived. **Minimal generation packet:**

```
CharacterPacket = {
  situation,      // = trigger domain
  driver,         // core
  strategy,       // core
  affect,         // modulation (colors language)
  persona,        // surface policy (skins language)
  language        // output surface cues
}
```

Everything else is a **derived view**, reconstructable at read time:

- `concern`      = f(driver, situation)
- `move`         = view(behaviorActionSequence grouped by strategy role)
- `desiredState` = expectedReply.relationshipReply

6 read slots vs 9. Principle honored: the packet holds only what generation actually reads;
diagnosis/retrieval consume the derived views on demand.

---

## 11. Character Conservation Law — REJECTED as hard law, KEPT as soft diagnostic

Claim: every generated line must invert `Language → Move → Strategy → Concern → Driver`; failure ⇒
character identity lost.

Empirically the inversion is **not unique**, so as a *hard* law it is false:

- **Upward fan-out (many-to-one):** `conceal_vulnerability` ← 5 distinct drivers;
  `test_exclusivity` ← 5; `obtain_specific_reassurance` ← 4; `reduce_distance` ← 4. Given only the
  strategy you cannot recover the driver.
- **Missing bottom:** 6/50 records have **zero** confidently recoverable driver; 14/50 carry **≥2**
  driver candidates. So Language→Driver is one-to-many *and* many-to-one.
- **Weak evidence floor:** 31/50 are E0/E1 — inversion would be asserting structure the record
  doesn't contain.

A conservation law that fails on 40%+ of real data is not a law. **However**, the *contrapositive*
is useful: if a generated line inverts to a driver **outside** 糖糖's driver set (or to a strategy
her prior never pairs with that situation), that is a strong **out-of-character signal**. So:

**Verdict: reject as a hard invertibility requirement; adopt as a soft diagnostic —**
"generated line must invert to *some* driver **within** the character's known driver set, under the
situation's prior." Unique inversion is not required; **membership** is. This is checkable against
the Character-Prior table (§9) and belongs in Diagnosis, not in the generation packet.

---

## 12. Theory Usefulness Audit (the 5 questions per surviving layer)

| Layer | Δ Retrieval | Δ Generation | Explains failure | Compresses samples | Counterfactual predictive | Keep |
|---|---|---|---|---|---|---|
| Situation | ✅ index key | ✅ selects strategy dist. | ✅ wrong-situation misread | ✅ (domains) | ✅ change domain → strategy dist. shifts | ✅ |
| Driver | ✅ | ✅ | ✅ | ✅ (17 drivers over 50) | ✅ change driver → different goal | ✅ |
| Strategy | ➖ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Affect (mod) | ➖ | ✅ tone | ✅ tone-mismatch | ✅ | ✅ change affect → language tone, strategy fixed | ✅ |
| Persona (mod) | ➖ | ✅ surface | ✅ persona-bleed | ✅ | ✅ switch persona → language skin, driver fixed | ✅ |
| Trigger-Prior | ✅ | ➖ | ✅ over/under-reaction | ✅✅ (whole table) | ✅ | ✅ (as table) |
| Language | ➖ | ✅ output | ✅ | ➖ | ✅ | ✅ |
| ~~Concern~~ | ❌ = situation | ❌ | ❌ | ❌ | ❌ (no independent counterfactual) | ✗ demote |
| ~~Move~~ | ❌ | ❌ derivable | ❌ | ❌ | ❌ | ✗ demote |
| ~~Desired State~~ | ❌ | ❌ = relationshipReply | ➖ | ❌ | ❌ | ✗ demote |

The three demoted layers fail ≥4 of the 5 questions. The seven survivors each pass Generation + at
least one of Retrieval/Diagnosis + a counterfactual.

---

## 13. Final answers to the output spec

1. **Theory final version** — 4-node chain + 2 modulators + 1 prior table (§2 frozen chain).
2. **Passed review:** Situation, Driver, Strategy, Language, Affect(mod), Persona(surface),
   Trigger-Prior(as table).
3. **Deleted (as independent layers):** none hard-deleted this round (n=50 can't justify irreversible
   vocab deletion); **Concern / Move / Desired-State removed from the *theory chain*.**
4. **Demoted to Derived:** Concern = f(driver,situation); Move = view(behaviorActionSequence);
   Desired State = expectedReply.relationshipReply.
5. **Needs corpus re-test at n≥150:** the 11 non-constant (driver@situation) cells (§3); the 5
   strategy tokens that may be single-move (§4); anger-arousal possibly forcing boundary strategy
   (§7); any persona-goal divergence (§8); `characteristically_low` thresholds (§9).
6. **Final main causal chain:** `Situation → Driver → Strategy → Language`, Affect modulates
   Language, Persona skins Language, Trigger-Prior sits beside the chain.
7. **Final Character Packet:** `{situation, driver, strategy, affect, persona, language}` (6 read
   slots; §10).
8. **Theory/Schema boundary:** theory owns the ontologies + chain (target file
   `behavior/theory/character-theory.v3.json`); schema owns recording + provenance and may only
   *reference* ontologies via `enumFrom`; statistics/prior owns intensity/threshold/rate claims.
   Theory changes only from corpus evidence, never from a schema rename (§1).
9. **Character Conservation:** rejected as a hard invertibility law (empirically many-to-one, §11);
   **adopted as a soft "driver-set membership" diagnostic.**
10. **Future annotation adaptation:** stop annotating Concern/Move/DesiredState as first-class;
    keep recording `behaviorActionSequence`, `interactionFunctions`, `affect`,
    `expectedReply.relationshipReply`, and `triggerSensitivity.domain`; derive the rest. Migrate the
    non-domain trigger fields into a prior table. **No Round-A record is modified by this report.**

---

## What this review did NOT do (scope guard)

No push, no PR, no merge, no engine edit, no Round B, no expansion to 200, no re-annotation, no
schema/vocab mutation. Round-A records untouched (`rawHashUnchanged` still holds). This file is the
sole artifact produced.

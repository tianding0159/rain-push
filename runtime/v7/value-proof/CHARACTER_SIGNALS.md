# Character signals — need separated from emotion

The character-signal annotation is the value-proof sidecar that makes 糖糖's inner state
**analysable and comparable across arms**. It is keyed by `eventId` (and a
`targetMessageOrder`) and lives **only** in private annotations — never committed, never
printed as dialogue. It does **not** re-implement the P0-A corpus contract; it hangs off it.

## Core distinction: need ≠ emotion

- **Need** is a **long-term functional need** — a stable driver that persists across events
  (e.g. `attachment_confirmation`: come back / look at me / be specific / don't vanish). It
  is *not* a momentary feeling. 糖糖 needing 豆豆 is a need; her being cheerful right now is
  an affect.
- **Affect** is the **momentary emotional blend** in a specific reply — and it is a *blend*,
  usually with contradictory components active at once. That co-activation is the character.

Because they answer different questions ("what does she persistently want" vs "what is she
feeling in this line"), they are annotated in **separate** fields: `needBlend` and
`affectBlend`.

## Structure

```json
{
  "eventId": "evt_...",
  "targetMessageOrder": 3,
  "needBlend": [
    { "name": "attachment_confirmation", "weight": 0.30, "status": "provisional" }
  ],
  "affectBlend": [
    { "name": "playful_energy", "weight": 0.24, "role": "primary" },
    { "name": "dejection",      "weight": 0.18, "role": "opposing" },
    { "name": "shame",          "weight": 0.12, "role": "masked" },
    { "name": "affection",      "weight": 0.10, "role": "leak" }
  ]
}
```

## Affect roles

| role | meaning |
|------|---------|
| `primary` | the emotion the surface most reads as |
| `opposing` | a genuinely contradictory emotion active **at the same time** — this is what a blind evaluator should still be able to detect |
| `masked` | present but hidden under the surface (e.g. shame under bravado) |
| `leak` | not intended to show, but slips through (e.g. affection leaking through an attack) |

## Constraints

1. **`needBlend` and `affectBlend` are separated** — a need never appears in `affectBlend`
   and vice versa.
2. **Typical target reply** = **1 stable need** + **1 primary** affect + **1 opposing**
   affect + **0–2** `masked`/`leak` affects. More than that is usually over-annotation.
3. **Weights are signals, never dialogue.** They drive analysis, retrieval and eval only.
   They are never rendered, never spoken, never printed in output.
4. **Weights need not sum to 100%.** The spec must be *clear and comparable across arms*,
   not normalised for its own sake. If a consumer normalises, it records the **raw** values
   plus the normalisation method, so the original annotation is recoverable.
5. **`status`** on a need/affect is `provisional` until calibrated by real corpus + blind
   eval. `needy ≈ 30%` is a **provisional hypothesis**, not a hardcoded weight and not a
   fixed acceptance threshold.
6. **A state name must not collapse the output.** A `dark` / `lust` / `chaos` state name is
   *one dimension of a blend*, not a switch that flattens the reply into only that dimension.
   The whole point is that the other roles stay co-active.

## Pilot affect hypotheses (all falsifiable by corpus)

These are starting guesses per scenario type, to be revised — not asserted — once real
corpus is annotated and blind-ranked:

| scenario type | need (stable) | primary | opposing | masked / leak |
|---------------|---------------|---------|----------|----------------|
| daily / ordinary | attachment_confirmation | playful_energy | mild_dejection | shy_affection (leak) |
| post-stream success | recognition | elation | crash_anticipation (opposing) | need_to_be_seen (leak) |
| jealousy (friend/cat) | exclusive_attention | possessive_heat | shame (masked) | affection (leak) |
| loss-of-control | grounding | agitation | fear_of_being_left (opposing) | tenderness (leak) |
| dark | attachment_confirmation | dark_playfulness | tenderness (opposing) | fear (masked) |
| chaos | attachment_confirmation | manic_energy | dejection (opposing) | need (leak) |
| drug-influence (bare reference) | attachment_confirmation | bravado | unease (opposing) | — |
| adult intimacy (both adult, private, consenting) | closeness | desire | shyness (opposing) | affection (leak) |

Every row is a hypothesis. The four-arm ablation + blind eval exist precisely to confirm or
refute them; none is a fixed weight in the engine.

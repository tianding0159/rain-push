# rain-push v7 value-proof (P0-value)

Does the engine + corpus retrieval actually sound **more like 糖糖 (Tangtang)** than a
prompt alone? This directory is the harness that answers that question with data, not
assertion.

It is a **measurement layer**, not a new engine and not the corpus. It builds a private
corpus pilot, a character-signal annotation sidecar, a four-arm ablation, a scenario suite,
and a blind-evaluation pack, then reports what is actually implemented, tested, privately
evaluated, synthetic-only, blocked, or inferred — honestly separated.

## The question

糖糖's appeal is **one high-need personality that stays continuous across contradictory
emotions** — high-energy *and* dejected, bright *and* dark, shy *and* bold, aggressive *and*
affectionate, needing 豆豆 (Douubou) *and* hating that she needs him. The claim under test:
a deterministic engine plus provenance-bounded corpus retrieval reproduces that continuity
better than prompt-only generation.

Success is **not** "the system can generate more complex dialogue." Success is: blind
evaluators more reliably recognise 糖糖 — and specifically *not* because of keyword tics,
fixed emotional reversals, literary trauma one-liners, or exaggerated punctuation, but
because the personality holds together while the emotions contradict each other.

## What this layer is (and is not)

- **Is**: private-corpus pilot loader, character-signal annotation, retrieval + eval harness,
  four-arm ablation (prompt / prompt+retrieval / engine / engine+retrieval+renderer), a
  ≥30-scenario suite, deterministic blind-eval packing, and diagnostic metrics.
- **Is not**: a rewrite of the P0-A corpus contract (reused as-is), a change to the frozen
  engine, or a claim of fidelity without blind-eval data.

## Reuses P0-A, does not redo it

The provenance contract already exists under [`../corpus/`](../corpus/): source layers
C1–C4, evidence levels A–D, trust levels (`suspected_ai` quarantined), the SSOT
`policy/source-policy.json`, the deterministic `lib/io.mjs`, the `mini-schema` validator, and
the private→public export + privacy scanner. This layer **imports** those; it does not fork
enums, re-implement canonical JSON, or re-define source eligibility. Character-signal
annotation is a **sidecar** keyed by `eventId`, not a second copy of the corpus contract.

## Frozen this round (do not touch)

Per the P0-value directive, the following are explicitly out of scope and must not change:

- the legacy bundle and its lock (`../legacy-bundle/`)
- archive lifecycle, manifest refinements, ZIP parity
- the frozen engine's behavior (11-stage pipeline, R-CANON-01, execution boundary, atomic
  state commit)
- new generic schema *frameworks* for their own sake
- tests written to hit a number, and abstraction introduced before a failure is observed

If a value-proof result implies an engine change, this layer **reports** it (see the stop
rules below); it does not silently edit the engine.

## Preserved (design invariants this layer must not break)

- the 11-stage architecture and its ordering
- provenance (every produced line justified by referenced evidence, influence bounded by
  source layer × evidence level)
- privacy (no private verbatim in any committed or public artifact)
- deterministic replay (same input → byte-identical output; no clock / network / LLM in the
  deterministic paths)
- atomic state commit
- the execution boundary (generation ≠ execution)
- Canon / Living separation
- ordinary-event **anti-globalization**: a dramatic surface (an "electronic funeral" over a
  12-minute-late reply) must **not** collapse the underlying state into a severe one.

## Working principles (how "done" is judged)

1. **No abstraction without an observed failure.** Do not add a field, a schema, or a layer
   because it might be useful. Add it when a concrete case needs it *now*.
2. **Every field must be consumed immediately** by retrieval, safety, or eval — or it does
   not go in.
3. **Completion is not measured by code or test volume.** A larger diff is not more done.
4. **No fidelity claim without blind-eval data.** "Feels like 糖糖" is a hypothesis until
   ranked blind.
5. **If the complex system is ≤ the prompt, say so and simplify.** See stop rules.

## Provisional hypotheses, not hardcoded weights

Numbers like "needy ≈ 30%" are **provisional hypotheses to be calibrated** by real corpus +
blind eval. They are analysis / retrieval / eval signals — never printed as dialogue, never a
fixed acceptance threshold. Punctuation and rhythm thresholds are likewise compared to the
**corpus distribution**, not asserted arbitrarily. See
[`CHARACTER_SIGNALS.md`](CHARACTER_SIGNALS.md) and [`EVAL_RUBRIC.md`](EVAL_RUBRIC.md).

## Stop rules (read before expanding anything)

- **If D (engine+retrieval+renderer) ≤ A (prompt only):** do not expand the architecture.
  Analyse the failure, delete the layers that earn nothing, and recommend collapsing to
  prompt+retrieval or smaller.
- **If B (prompt+retrieval) ≥ D:** the deterministic engine may be adding no value. Do not
  hide that — report a reduction recommendation.

## Layout

```
runtime/v7/value-proof/
  README.md              # this file
  EVAL_RUBRIC.md         # human blind-eval dimensions + auto-diagnostic metrics + thresholds
  CHARACTER_SIGNALS.md   # needBlend / affectBlend model, roles, constraints
  FAILURE_TAXONOMY.md    # named failure modes (error A / error B, template feel, GPT-ish, …)
  schemas/               # character-signal sidecar + scenario + candidate + blind-pack schemas
  lib/                   # loaders, annotation parse, retrieval, metrics, blind packing (zero-dep)
  bin/                   # CLI entrypoints
  fixtures/synthetic/    # synthetic-only fixtures (no private / official text)
  tests/                 # node:test suites (offline, zero production deps)
```

## Privacy boundary (never commit)

Private corpus text, private annotations, raw candidates that embed private retrieval text,
rater identities, and unredacted failure examples are **never committed**. The private corpus
is loaded at runtime via `RAIN_PUSH_PRIVATE_CORPUS=/absolute/path/events.private.json` (or a
gitignored path); CI uses **synthetic fixtures only**. Committed / public artifacts carry only
synthetic fixtures, schemas, deterministic tooling, anonymised aggregate scores, redacted
evidence ids / hashes, public failure categories, and no-verbatim examples.

## Status

This round establishes the harness and proves it on synthetic fixtures. If no real private
corpus is present in the workspace, the pilot is marked **`READY_FOR_PRIVATE_CORPUS`** and no
claim of real character validation is made. See the final report in the PR for the honest
implemented / tested / evaluated / blocked breakdown.

# rain-push v7 corpus contract (P0-A)

Canonical, executable contract for the rain-push v7 character corpus: how provenance is
recorded, what each source layer is allowed to influence, how private annotations are
migrated and how a public, verbatim-free projection is produced and checked.

This directory is a **contract**, not the corpus. It ships schemas, policy, validators and
tools plus **synthetic** fixtures. The real annotated corpus (the private 1051-line dataset)
and any official copyrighted lines are **never** committed here.

## Why this exists

A single "character card" collapses distinct questions — what happened, what is true, what
she feels, what she does, how she speaks — into one prompt, producing dramatic but
ungrounded output. The v7 architecture keeps those layers separate and demands that every
generated line be **justified by referenced evidence** whose influence is bounded by its
provenance. This contract makes those bounds executable: a record cannot claim more
influence than its source is entitled to, and nothing private can leak into public material.

## Vocabulary (preserved from the v7 handoff)

- **Source layers** `C1..C4` — `C1` canon (primary text), `C2` guide (mechanics only),
  `C3` community (language fingerprint only), `C4` extension (test-only, never exported).
- **Evidence levels** `A..D` — `A/B` may support behavior + wording, `C` wording only,
  `D` excluded from driving generation. (From `annotation_contract.md`.)
- **Annotation unit** — an **event** plus its **ordered message sequence**.
- Per-event annotation: **channel**, **persona surface**, **Canon/Living mode**,
  **Canon state**, **event trigger**, **functional need**, **P role**,
  **behavior primitives**, **expected reply class**, **reply timing sensitivity**,
  **state effect**, **route severity**, **route id**, **context-required**, **uncertainty**;
  per-message: **sequence order** and **delay**.

## Files

```
policy/source-policy.json        # SSOT for every enum + per-layer/level capability
schemas/                         # four mini-schema JSON documents
  source-registry.schema.json
  private-corpus-event.schema.json
  public-derived-event.schema.json
  retrieval-evidence-reference.schema.json
lib/                             # zero-dependency implementation
  source-policy.mjs              #   the ONLY reader of the policy
  mini-schema.mjs                #   zero-dep structural validator (enumFrom→policy)
  validator.mjs                  #   cross-record contract (the executable rules)
  migrate.mjs                    #   v0.1 → v1 (deterministic, lossless)
  export-public.mjs              #   private → public derived (no verbatim)
  privacy-scan.mjs               #   verbatim / private-field leak scanner
  io.mjs                         #   canonical (sorted, deterministic) JSON IO
bin/                             # CLI entrypoints (see CLI.md)
fixtures/                        # SYNTHETIC valid corpus + v0.1 sample + invalid/cases.json
tests/                           # node:test suites (offline, zero-dep)
CLI.md                           # command reference + exit codes
MIGRATION_MAPPING.md             # v0.1 → v1 field + confidence mapping
KNOWN_LIMITATIONS.md             # what this contract does NOT yet cover
```

## Enforced invariants (executable)

Each maps to a stable code in `lib/validator.mjs` (`VALIDATION_CODES`) — see `CLI.md`.

- **Influence is derived from the registry**, never self-declared: a record backed by a
  source cannot drive behavior/wording the source's layer + evidence level disallow
  (`SELF_AUTHORIZE_*`).
- **Records cannot self-authorize**: capabilities come only from the referenced source.
- **`suspected_ai` sources are quarantined** — no record may reference them
  (`QUARANTINED_SOURCE`).
- **Synthetic (C4) is test-only**: may only back a `syntheticOnly` event and is refused by
  the public exporter (`SYNTHETIC_LEAK`, `ERR_EXPORT_NOT_EXPORTABLE`).
- **Community (C3) cannot influence behavior** (`COMMUNITY_BEHAVIOR`); **guide (C2) is
  mechanics-only** — no persona wording (`GUIDE_WORDING`); **C is language-only, D excluded**
  (via capability derivation).
- **Canon-severe route** requires a canon-capable source **and** `mode=canon` **and** a
  `routeId` (`CANON_SEVERE_SOURCE|MODE|ROUTE_ID`) — mirrors engine rule `R-CANON-01`.
- **Public export carries no private verbatim** — only content hashes + length buckets; the
  privacy scanner fails on any verbatim or private-only field in public material.
- **Duplicate record ids / message content hashes fail** (`DUP_ID`, `DUP_HASH`).
- **Message order is unique, positive and contiguous 1..N** (`MSG_ORDER_*`).
- **Migration preserves unknown fields** (`x_legacy`) and never invents provenance.
- **Retrieval references** must target an existing event and declare a usage the referenced
  event's derived capabilities permit (`RETRIEVAL_*`).

## Quick start

```bash
cd runtime/v7/corpus

# validate the synthetic corpus (schemas + cross-record contract)
node bin/validate.mjs \
  --registry fixtures/registry.valid.json \
  --events   fixtures/events.valid.json \
  --retrievals fixtures/retrievals.valid.json

# migrate a v0.1 corpus to v1
node bin/migrate.mjs --in fixtures/corpus.v0_1.json \
  --out-registry /tmp/registry.json --out-events /tmp/events.json

# export a verbatim-free public projection, then scan it
node bin/export-public.mjs --registry fixtures/registry.valid.json \
  --events fixtures/events.valid.json --out /tmp/public.json
node bin/privacy-scan.mjs --private fixtures/events.valid.json --public /tmp/public.json

# run the offline test suite
node --test tests/
```

## Design rules honoured

- **SSOT** — every enum + capability lives once, in `policy/source-policy.json`; code reads
  it via `lib/source-policy.mjs` and never hardcodes a list.
- **Determinism** — all tools emit canonical (sorted-key) JSON so re-runs are
  byte-identical; no clock, no network, no LLM.
- **Zero production dependencies** — schemas and validators are hand-rolled so the CI job
  runs fully offline.

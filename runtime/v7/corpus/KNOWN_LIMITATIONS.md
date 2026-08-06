# Known limitations (P0-A corpus contract)

This contract is the provenance + policy + IO layer for the corpus. It deliberately stops
short of several things, documented here so callers don't assume coverage that isn't there.

## Scope boundaries

- **Not the corpus.** This directory ships the contract and **synthetic** fixtures only. The
  real annotated dataset and any official copyrighted lines are never committed here.
- **No generation.** Nothing here produces character output. It validates provenance and
  bounds influence; wiring evidence into the runtime engine is later work.
- **No engine coupling.** The `canon_severe` gate mirrors the engine's `R-CANON-01`
  semantics but is enforced independently; the two are not yet cross-checked against a shared
  rule source.

## Validation limits

- **Custom mini-schema, not full JSON Schema.** `lib/mini-schema.mjs` supports only the
  keywords the four schemas use (type, required, additionalProperties, properties, items,
  $defs/$ref, enum, const, enumFrom, minLength, minimum, minItems, pattern). It is not a
  general JSON-Schema validator; adding a keyword to a schema requires adding it here.
- **`$ref` is local only** (`#/...`). No remote or cross-file refs.
- **Semantic freedom in free-text fields.** `canonState`, `functionalNeed`, `pRole`,
  `expectedReplyClass`, `behaviorPrimitives`, `stateEffect` are validated as
  well-formed strings/arrays, not against controlled vocabularies. Enumerating those is a
  future policy extension (they are intentionally open while the corpus vocabulary settles).

## Privacy scanner limits

- **Exact / substring text matching**, not semantic. It catches verbatim reuse and
  private-only fields; it does not detect paraphrase or partial reconstruction.
- **Short lines** (< 4 chars) are not substring-scanned (they false-positive against
  ordinary prose); they are still caught by private-only-field detection when a whole private
  record leaks.
- The scanner checks **parsed public artifacts you pass it**. It is a gate to run on export
  output / anything about to be committed, not an ambient filesystem watcher.

## Migration limits

- **Single-message events only** from v0.1: a v0.1 record maps to one message. Multi-turn
  v0.1 encodings (if any exist) are preserved under `x_legacy` rather than expanded.
- **Confidence map is fixed** to the documented vocabulary; new confidence values fall back
  to C4/D with a warning until the map is extended.

## Determinism caveats

- Determinism depends on **canonical JSON** (`lib/io.mjs`). Hand-edited output that isn't
  re-serialised through the tools may differ byte-for-byte while remaining semantically
  equal; always regenerate via the CLI.

# v0.1 → v1 migration mapping

`bin/migrate.mjs` (via `lib/migrate.mjs`) converts the loose v0.1 annotation shape described
in [`annotation_contract.md`](../../../handoff/runtime/v7/corpus/annotation_contract.md) into
the v1 schemas. It is deterministic and lossless: every v0.1 key is either mapped to a v1
field or preserved verbatim under `x_legacy`.

## Field mapping (v0.1 → v1 private event)

| v0.1 key | v1 field | Notes |
|----------|----------|-------|
| `id` | `id` | slugified, prefixed `evt_`; missing → `evt_unmigrated` + warning |
| `text` | `messages[0].text` | single line → 1-message ordered sequence (`order:1`) |
| `role` | `messages[0].role` | defaults to `ame` when absent |
| `source.type` | (registry) `sourceType` | |
| `source.reference` | (registry) `reference` + source id | source id = `src_<slug(reference)>` |
| `source.confidence` | (registry) `sourceLayer` + `evidenceLevel` | via confidence map below |
| `channel` | `channel` | |
| `persona_surface` | `personaSurface` | |
| `canon_time` | `canonTime` | |
| `canon_state` | `canonState` | |
| `day` | `day` | integer only |
| `event_trigger` | `eventTrigger` | missing → `(unmigrated)` |
| `functional_need` | `functionalNeed` | |
| `p_role` | `pRole` | |
| `behavior_primitives` | `behaviorPrimitives` | non-empty arrays only |
| `expected_reply_class` | `expectedReplyClass` | |
| `reply_timing_sensitivity` | `replyTimingSensitivity` | |
| `state_effect` | `stateEffect` | non-empty arrays only |
| `route_severity` | `routeSeverity` | also drives `mode` (see below) |
| `context_required` | `contextRequired` | boolean only |
| `uncertainty` | `uncertainty` | non-empty arrays only |
| `notes` | `notes` | |
| *(any other key)* | `x_legacy.<key>` | preserved verbatim (lossless) |

`mode` is derived: `route_severity == canon_severe` → `canon`, else `living`.
When the mapped source layer is `C4`, the event is marked `syntheticOnly: true`.

## Confidence → (source layer, evidence level)

From the evidence schema's `confidence` vocabulary
([`evidence_schema.yaml`](../../../handoff/runtime/v7/evidence/evidence_schema.yaml)):

| v0.1 `source.confidence` | `sourceLayer` | `evidenceLevel` |
|--------------------------|---------------|-----------------|
| `CANON_TEXT` | `C1` | `A` |
| `GUIDE_CONFIRMED` | `C2` | `B` |
| `GUIDE_UNCERTAIN` | `C2` | `C` |
| `CORPUS_INFERENCE` | `C3` | `C` |
| `COMMUNITY_INFERENCE` | `C3` | `C` |
| `SIMULATOR_EXTENSION` | `C4` | `D` |
| *(anything else)* | `C4` | `D` + `MIGRATE_UNKNOWN_CONFIDENCE` warning |

An unknown confidence falls back to the **most restrictive** pairing (`C4/D`, which drives
nothing and is not exportable) rather than guessing a permissive layer — a mis-migrated
record fails safe, and the warning names it for human review. The original value is retained
on the source's `notes` (`legacyConfidence=<value>`).

## Guarantees

- **Deterministic** — same input → byte-identical output (canonical JSON; sources sorted by
  id, events in input order).
- **Lossless** — no unrecognised field is dropped (`x_legacy`).
- **No invention** — provenance is only ever narrowed, never fabricated; a record with no
  usable source data becomes a non-influential C4/D placeholder, not a canon claim.

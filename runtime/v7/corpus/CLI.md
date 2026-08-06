# Corpus contract CLI reference

All commands are zero-dependency Node ≥20 ES modules. All are pure/offline: no clock, no
network, no LLM. Output written with `--out*` is canonical (sorted-key) JSON, so re-runs are
byte-identical.

## Exit-code convention (shared)

| Code | Meaning |
|------|---------|
| `0`  | success / clean |
| `1`  | contract failure — schema/cross-record problems, leakage found, or strict refusal |
| `2`  | usage or IO error (bad args, unreadable/malformed file) — no stack trace printed |

Stable machine-readable codes are printed for failures (see tables below), so CI can assert
on them without parsing prose.

## `bin/validate.mjs`

Validate a corpus against the schemas + cross-record contract.

```bash
node bin/validate.mjs --registry PATH --events PATH [--retrievals PATH] [--json]
```

- `--events` / `--retrievals` accept either a bare JSON array or `{ "events": [...] }` /
  `{ "retrievals": [...] }`.
- `--json` prints `{ valid, problems }`; otherwise a `CODE\trecordId\tdetail` line per
  problem.

Problem codes (`VALIDATION_CODES`):

| Code | Trigger |
|------|---------|
| `SCHEMA` | per-record shape failure (type/required/enum/pattern/additional) |
| `UNKNOWN_SOURCE` | event references a source id not in the registry |
| `QUARANTINED_SOURCE` | event references a `suspected_ai` source |
| `SELF_AUTHORIZE_BEHAVIOR` | behavior primitives on a source whose layer+level can't drive behavior |
| `SELF_AUTHORIZE_WORDING` | wording payload on a source whose layer+level can't drive wording |
| `SYNTHETIC_LEAK` | C4 (test-only) source backs a non-`syntheticOnly` event |
| `COMMUNITY_BEHAVIOR` | C3 community source carries behavior primitives |
| `GUIDE_WORDING` | C2 guide source carries a persona wording payload |
| `CANON_SEVERE_SOURCE` | `canon_severe` route on a non-canon-capable source |
| `CANON_SEVERE_MODE` | `canon_severe` route with `mode!=canon` |
| `CANON_SEVERE_ROUTE_ID` | `canon_severe` route without a `routeId` |
| `DUP_ID` | duplicate event or source id |
| `DUP_HASH` | duplicate message content hash across events |
| `MSG_ORDER_DUPLICATE` | repeated message `order` within an event |
| `MSG_ORDER_NOT_CONTIGUOUS` | message orders are not exactly `1..N` |
| `RETRIEVAL_UNKNOWN_EVENT` | retrieval references a non-existent event |
| `RETRIEVAL_USAGE_NOT_PERMITTED` | declared usage exceeds the referenced event's capabilities |

## `bin/migrate.mjs`

Migrate a v0.1 corpus (`{ version:"0.1", records:[...] }`) to v1 registry + events.

```bash
node bin/migrate.mjs --in PATH [--out-registry PATH] [--out-events PATH] [--json]
```

- With no `--out-*`, prints `{ registry, events, warnings }` to stdout (canonical JSON).
- Warnings (`MIGRATE_MISSING_ID`, `MIGRATE_UNKNOWN_CONFIDENCE`) never fail the run — they
  flag records that need human attention. Unknown v0.1 confidence falls back to the most
  restrictive `C4/D` (never a permissive layer). See `MIGRATION_MAPPING.md`.

## `bin/export-public.mjs`

Project a private corpus onto the public derived set (no verbatim).

```bash
node bin/export-public.mjs --registry PATH --events PATH [--out PATH] [--strict] [--json]
```

- Each message becomes `{ order, role, sha256, lengthBucket }` — no text.
- Capabilities on the public record are **derived from the source**, not copied.
- C4 / non-exportable sources are **skipped** by default (reported) or, with `--strict`,
  cause exit `1` (`ERR_EXPORT_NOT_EXPORTABLE`). Unknown source → `ERR_EXPORT_UNKNOWN_SOURCE`.

## `bin/privacy-scan.mjs`

Scan public-facing artifacts for leaked private verbatim / private-only fields.

```bash
node bin/privacy-scan.mjs --private PATH --public PATH [--public PATH ...] [--json]
```

| Code | Trigger |
|------|---------|
| `PRIVACY_VERBATIM_TEXT` | a private message's exact text appears in a public artifact |
| `PRIVACY_PRIVATE_FIELD` | a public artifact carries a private-only field (`text`/`messages`/`verbatim`/`x_legacy`) |

Exit `0` clean, `1` if any finding, `2` on usage/IO error.

// Cross-record validator — the executable corpus contract.
//
// Per-record shape is checked by mini-schema against the four schemas. This module adds
// the CROSS-record and POLICY invariants that a shape check cannot express, each mapped to
// a stable problem `code` so tests and CI can assert on exact failures rather than prose:
//
//   Provenance / self-authorization
//     - every record references a source that exists in the registry           (UNKNOWN_SOURCE)
//     - a record cannot claim influence its source layer/evidence disallows —
//       influence is DERIVED from the registry, records never self-authorize    (SELF_AUTHORIZE_*)
//   Trust
//     - suspected_ai sources are quarantined: no record may reference them      (QUARANTINED_SOURCE)
//   Test-only isolation
//     - synthetic sources (C4 / synthetic:true) may only back syntheticOnly events (SYNTHETIC_LEAK)
//   Layer role limits
//     - community (C3) events must not carry behavior primitives / route escalation (COMMUNITY_BEHAVIOR)
//     - guide (C2) events are mechanics-only: no persona wording payload         (GUIDE_WORDING)
//     - C (evidence) is language-only; D is excluded from driving anything       (via capability derivation)
//   Canon-severe gate (mirrors engine R-CANON-01)
//     - routeSeverity canon_severe requires a canon-severe-capable source,
//       mode==canon, and a routeId                                              (CANON_SEVERE_*)
//   Identity
//     - duplicate record IDs fail; duplicate message content hashes fail        (DUP_ID / DUP_HASH)
//   Message sequence
//     - orders are positive, unique and contiguous 1..N                         (MSG_ORDER_*)
//   Retrieval references
//     - referenced events exist and the declared usage is permitted by the
//       referenced event's derived capabilities                                 (RETRIEVAL_*)
//
// Pure and deterministic: no clock, no network, no filesystem (callers pass parsed data).

import { createHash } from "node:crypto";
import { validate } from "./mini-schema.mjs";
import {
  canDriveBehavior, canDriveWording, canDriveMechanics,
  canBeCanonSevere, isQuarantined, routeSeverity, layerLabel,
} from "./source-policy.mjs";

export const VALIDATION_CODES = Object.freeze({
  SCHEMA: "SCHEMA",
  UNKNOWN_SOURCE: "UNKNOWN_SOURCE",
  QUARANTINED_SOURCE: "QUARANTINED_SOURCE",
  SELF_AUTHORIZE_BEHAVIOR: "SELF_AUTHORIZE_BEHAVIOR",
  SELF_AUTHORIZE_WORDING: "SELF_AUTHORIZE_WORDING",
  SYNTHETIC_LEAK: "SYNTHETIC_LEAK",
  COMMUNITY_BEHAVIOR: "COMMUNITY_BEHAVIOR",
  GUIDE_WORDING: "GUIDE_WORDING",
  CANON_SEVERE_SOURCE: "CANON_SEVERE_SOURCE",
  CANON_SEVERE_MODE: "CANON_SEVERE_MODE",
  CANON_SEVERE_ROUTE_ID: "CANON_SEVERE_ROUTE_ID",
  DUP_ID: "DUP_ID",
  DUP_HASH: "DUP_HASH",
  MSG_ORDER_DUPLICATE: "MSG_ORDER_DUPLICATE",
  MSG_ORDER_NOT_CONTIGUOUS: "MSG_ORDER_NOT_CONTIGUOUS",
  RETRIEVAL_UNKNOWN_EVENT: "RETRIEVAL_UNKNOWN_EVENT",
  RETRIEVAL_USAGE_NOT_PERMITTED: "RETRIEVAL_USAGE_NOT_PERMITTED",
});

// Canonical hash of one message's content: role + text, so identical text under different
// roles is not treated as a duplicate. Used for both dup detection and public export.
//
// Length-prefixed framing (not a plain separator) so the mapping (role, text) → bytes is
// injective even if a field contained the delimiter: e.g. ("a","b\0c") and ("a\0b","c")
// must NOT collide. Roles are enum-constrained in a valid corpus, but this function also
// runs during dup detection before that guarantee holds, so we frame defensively.
export function messageContentHash(role, text) {
  const r = String(role);
  const t = String(text);
  const framed = `${Buffer.byteLength(r, "utf8")}:${r}${Buffer.byteLength(t, "utf8")}:${t}`;
  return createHash("sha256").update(framed, "utf8").digest("hex");
}

function problem(code, recordId, detail, extra = {}) {
  return { code, recordId, detail, ...extra };
}

// Validate an array against its schema; push SCHEMA problems tagged with the record id.
function schemaCheck(records, schema, policy, idKey, problems) {
  for (const rec of records) {
    const res = validate(schema, rec, policy);
    if (!res.valid) {
      for (const e of res.errors) {
        problems.push(problem(VALIDATION_CODES.SCHEMA, rec && rec[idKey], `${e.path}: ${e.code} (${e.detail})`, { schemaPath: e.path, schemaCode: e.code }));
      }
    }
  }
}

// Check message order set is exactly 1..N with no duplicates.
function checkMessageOrders(evt, problems) {
  const orders = evt.messages.map((m) => m.order);
  const seen = new Set();
  for (const o of orders) {
    if (seen.has(o)) {
      problems.push(problem(VALIDATION_CODES.MSG_ORDER_DUPLICATE, evt.id, `duplicate order ${o}`));
    }
    seen.add(o);
  }
  const sorted = [...orders].sort((a, b) => a - b);
  const contiguous = sorted.length > 0 && sorted[0] === 1 && sorted.every((v, i) => v === i + 1);
  if (!contiguous) {
    problems.push(problem(VALIDATION_CODES.MSG_ORDER_NOT_CONTIGUOUS, evt.id, `orders must be 1..N contiguous, got [${sorted.join(",")}]`));
  }
}

// Core cross-record validation.
//   input: { schemas: {registry, event, retrieval}, policy, registry, events, retrievals }
//   returns: { valid, problems: [...] } — deterministic order.
export function validateCorpus(input) {
  const {
    schemas, policy,
    registry = { sources: [] },
    events = [],
    retrievals = [],
  } = input;
  const problems = [];

  // 1. Per-record shape.
  schemaCheck([registry], schemas.registry, policy, "registryFormatVersion", problems);
  schemaCheck(events, schemas.event, policy, "id", problems);
  schemaCheck(retrievals, schemas.retrieval, policy, "id", problems);

  // Index sources by id (duplicate source ids surface as DUP_ID below).
  const sourceById = new Map();
  const dupSourceIds = new Set();
  for (const s of registry.sources || []) {
    if (sourceById.has(s.id)) dupSourceIds.add(s.id);
    else sourceById.set(s.id, s);
  }
  for (const id of dupSourceIds) {
    problems.push(problem(VALIDATION_CODES.DUP_ID, id, `duplicate source id ${id}`));
  }

  // 2. Duplicate event ids.
  const eventById = new Map();
  for (const evt of events) {
    if (eventById.has(evt.id)) {
      problems.push(problem(VALIDATION_CODES.DUP_ID, evt.id, `duplicate event id ${evt.id}`));
    } else {
      eventById.set(evt.id, evt);
    }
  }

  // 3. Global duplicate message-content hashes (across all events).
  const hashOwner = new Map();
  for (const evt of events) {
    for (const m of evt.messages || []) {
      const h = messageContentHash(m.role, m.text);
      if (hashOwner.has(h)) {
        problems.push(problem(VALIDATION_CODES.DUP_HASH, evt.id, `duplicate message content hash (also in ${hashOwner.get(h)})`, { hash: h }));
      } else {
        hashOwner.set(h, evt.id);
      }
    }
  }

  // 4. Per-event provenance + policy invariants.
  for (const evt of events) {
    checkMessageOrders(evt, problems);

    const src = sourceById.get(evt.sourceId);
    if (!src) {
      problems.push(problem(VALIDATION_CODES.UNKNOWN_SOURCE, evt.id, `references unknown source ${evt.sourceId}`));
      continue; // capability checks below require a known source
    }

    // Quarantine: suspected_ai sources influence nothing.
    if (isQuarantined(policy, src.trustLevel)) {
      problems.push(problem(VALIDATION_CODES.QUARANTINED_SOURCE, evt.id, `source ${src.id} is quarantined (${src.trustLevel})`));
    }

    // Synthetic / test-only isolation. "Synthetic test-only" == the C4 layer, which the
    // policy marks publicExport:false. Such a source may only back a syntheticOnly event
    // (and export refuses it entirely). We key this on the LAYER capability, not on a
    // separate boolean, so there is exactly one definition of "test-only" (C4) and no
    // second flag can drift from it.
    const layer = policy.sourceLayers[src.sourceLayer];
    const layerIsSynthetic = layer && layer.capabilities && layer.capabilities.publicExport === false;
    if (layerIsSynthetic && evt.syntheticOnly !== true) {
      problems.push(problem(VALIDATION_CODES.SYNTHETIC_LEAK, evt.id, `test-only source ${src.id} (${src.sourceLayer}) may only back a syntheticOnly event`));
    }

    const hasBehavior = Array.isArray(evt.behaviorPrimitives) && evt.behaviorPrimitives.length > 0;
    // Wording payload = an expected reply class is asserted (a persona wording claim).
    const hasWording = typeof evt.expectedReplyClass === "string" && evt.expectedReplyClass.length > 0;

    // Self-authorization: influence must be derived from the source's layer + evidence.
    if (hasBehavior && !canDriveBehavior(policy, src.sourceLayer, src.evidenceLevel)) {
      problems.push(problem(VALIDATION_CODES.SELF_AUTHORIZE_BEHAVIOR, evt.id, `source ${src.id} (${src.sourceLayer}/${src.evidenceLevel}) cannot drive behavior`));
    }
    if (hasWording && !canDriveWording(policy, src.sourceLayer, src.evidenceLevel)) {
      problems.push(problem(VALIDATION_CODES.SELF_AUTHORIZE_WORDING, evt.id, `source ${src.id} (${src.sourceLayer}/${src.evidenceLevel}) cannot drive wording`));
    }

    // Role limits keyed on the policy's layer LABEL (not a hardcoded id), so "which layer is
    // community/guide" is defined once in the policy.
    const label = layerLabel(policy, src.sourceLayer);
    // Community role limit: language fingerprint only — no behavior / escalation.
    if (label === "community" && hasBehavior) {
      problems.push(problem(VALIDATION_CODES.COMMUNITY_BEHAVIOR, evt.id, `community source ${src.id} must not drive behavior primitives`));
    }
    // Guide role limit: mechanics only — no persona wording payload.
    if (label === "guide" && hasWording) {
      problems.push(problem(VALIDATION_CODES.GUIDE_WORDING, evt.id, `guide source ${src.id} is mechanics-only; drop expectedReplyClass`));
    }

    // Canon-severe gate (mirrors engine R-CANON-01).
    const sev = routeSeverity(policy, evt.routeSeverity);
    if (sev && sev.requiresCanonMode) {
      if (!canBeCanonSevere(policy, src.sourceLayer)) {
        problems.push(problem(VALIDATION_CODES.CANON_SEVERE_SOURCE, evt.id, `canon_severe requires a canon-capable source; ${src.id} is ${src.sourceLayer}`));
      }
      if (evt.mode !== "canon") {
        problems.push(problem(VALIDATION_CODES.CANON_SEVERE_MODE, evt.id, `canon_severe requires mode=canon, got ${evt.mode}`));
      }
      if (sev.requiresRouteId && !evt.routeId) {
        problems.push(problem(VALIDATION_CODES.CANON_SEVERE_ROUTE_ID, evt.id, `canon_severe requires a routeId`));
      }
    }
  }

  // 5. Retrieval references: target must exist and declared usage must be permitted by the
  //    referenced event's DERIVED capabilities (from its source).
  for (const ret of retrievals) {
    for (const ref of ret.references || []) {
      const target = eventById.get(ref.eventId);
      if (!target) {
        problems.push(problem(VALIDATION_CODES.RETRIEVAL_UNKNOWN_EVENT, ret.id, `references unknown event ${ref.eventId}`));
        continue;
      }
      const src = sourceById.get(target.sourceId);
      if (!src) continue; // already reported as UNKNOWN_SOURCE on the event
      let permitted = false;
      if (ref.usage === "behavior") permitted = canDriveBehavior(policy, src.sourceLayer, src.evidenceLevel);
      else if (ref.usage === "wording") permitted = canDriveWording(policy, src.sourceLayer, src.evidenceLevel);
      else if (ref.usage === "mechanics") permitted = canDriveMechanics(policy, src.sourceLayer);
      if (!permitted) {
        problems.push(problem(VALIDATION_CODES.RETRIEVAL_USAGE_NOT_PERMITTED, ret.id, `usage=${ref.usage} not permitted by ${ref.eventId} source ${src.id} (${src.sourceLayer}/${src.evidenceLevel})`));
      }
    }
  }

  return { valid: problems.length === 0, problems };
}

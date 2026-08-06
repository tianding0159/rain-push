// Deterministic private → public export.
//
// Projects a private corpus event onto the public-derived-event schema: it keeps the
// ANNOTATION (structure, evidence framing, derived capabilities) but strips every piece of
// verbatim text, replacing each message with a content hash + a length bucket. The public
// projection is what may be committed/published; the private verbatim never leaves.
//
// Capabilities on the public record are DERIVED from the referenced registry source (layer
// + evidence level) — never copied from the private record — so a private record cannot
// smuggle influence it was not entitled to into the public set.
//
// C4 / synthetic sources are NOT exportable (publicExport:false); attempting to export one
// is an error, not a silent drop, so a synthetic line can never appear in public output.
//
// Pure and deterministic: same input → byte-identical output.

import { messageContentHash } from "./validator.mjs";
import { canPublicExport, isQuarantined } from "./source-policy.mjs";

export const EXPORT_TOOL_VERSION = 1;

export const EXPORT_ERROR_CODES = Object.freeze({
  UNKNOWN_SOURCE: "ERR_EXPORT_UNKNOWN_SOURCE",
  NOT_EXPORTABLE: "ERR_EXPORT_NOT_EXPORTABLE",
  QUARANTINED: "ERR_EXPORT_QUARANTINED",
});

export class ExportError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "ExportError";
    this.code = code;
  }
}

function bucketFor(policy, len) {
  for (const b of policy.lengthBuckets) {
    if (b.maxChars === null || len <= b.maxChars) return b.name;
  }
  return policy.lengthBuckets[policy.lengthBuckets.length - 1].name;
}

// Export one private event → one public derived event. Throws ExportError for an unknown
// or non-exportable source so failures are loud and machine-assertable.
export function exportEvent(evt, sourceById, policy) {
  const src = sourceById.get(evt.sourceId);
  if (!src) throw new ExportError(EXPORT_ERROR_CODES.UNKNOWN_SOURCE, `${evt.id} → ${evt.sourceId}`);
  // Quarantined (suspected_ai) content must influence nothing — including public export,
  // regardless of its layer. Checked before the layer gate so a C1 quarantined source can
  // never slip through on layer alone.
  if (isQuarantined(policy, src.trustLevel)) {
    throw new ExportError(EXPORT_ERROR_CODES.QUARANTINED, `${evt.id}: source ${src.id} is quarantined (${src.trustLevel})`);
  }
  if (!canPublicExport(policy, src.sourceLayer)) {
    throw new ExportError(EXPORT_ERROR_CODES.NOT_EXPORTABLE, `${evt.id}: source ${src.id} layer ${src.sourceLayer} is not exportable`);
  }

  const layerCaps = policy.sourceLayers[src.sourceLayer].capabilities;
  const evLevel = policy.evidenceLevels[src.evidenceLevel].capabilities;
  const capabilities = {
    behavior: Boolean(layerCaps.behavior && evLevel.behavior),
    wording: Boolean(layerCaps.wording && evLevel.wording),
    mechanics: Boolean(layerCaps.mechanics),
    canonSevere: Boolean(layerCaps.canonSevere),
  };

  const messageHashes = [...evt.messages]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      order: m.order,
      role: m.role,
      sha256: messageContentHash(m.role, m.text),
      lengthBucket: bucketFor(policy, m.text.length),
    }));

  const out = {
    recordFormatVersion: 1,
    id: evt.id,
    sourceId: evt.sourceId,
    sourceLayer: src.sourceLayer,
    evidenceLevel: src.evidenceLevel,
    channel: evt.channel,
    mode: evt.mode,
    eventTrigger: evt.eventTrigger,
    capabilities,
    messageHashes,
    derivedFrom: { privateEventId: evt.id, exportToolVersion: EXPORT_TOOL_VERSION },
  };
  // Carry through annotation fields when present (never text).
  const carry = (k) => { if (evt[k] !== undefined && evt[k] !== null && evt[k] !== "") out[k] = evt[k]; };
  carry("personaSurface");
  carry("canonState");
  carry("functionalNeed");
  carry("pRole");
  carry("expectedReplyClass");
  carry("replyTimingSensitivity");
  carry("routeSeverity");
  carry("routeId");
  if (typeof evt.contextRequired === "boolean") out.contextRequired = evt.contextRequired;
  if (Array.isArray(evt.behaviorPrimitives) && evt.behaviorPrimitives.length) out.behaviorPrimitives = [...evt.behaviorPrimitives];
  return out;
}

// Export a whole corpus. Non-exportable (synthetic) events are skipped by default and
// reported, unless strict=true in which case the first one throws. Deterministic order.
export function exportCorpus({ events, registry, policy, strict = false }) {
  const sourceById = new Map((registry.sources || []).map((s) => [s.id, s]));
  const exported = [];
  const skipped = [];
  for (const evt of events) {
    try {
      exported.push(exportEvent(evt, sourceById, policy));
    } catch (err) {
      // Only the "expected" non-exportable layer (C4/synthetic) is skippable in non-strict
      // mode. QUARANTINED and UNKNOWN_SOURCE always throw — a valid corpus never contains
      // them (the validator rejects both), so hitting one at export time is a hard error,
      // not a routine skip.
      if (err instanceof ExportError && err.code === EXPORT_ERROR_CODES.NOT_EXPORTABLE && !strict) {
        skipped.push({ id: evt.id, reason: err.code });
        continue;
      }
      throw err;
    }
  }
  exported.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { events: exported, skipped };
}

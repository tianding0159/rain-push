// Source-policy accessor — the ONLY reader of policy/source-policy.json.
//
// Every other corpus module (validator, migrator, exporter, privacy scanner, CLI) asks
// this module for enums and per-layer / per-evidence-level capabilities instead of
// hardcoding them. That keeps policy/source-policy.json the single source of truth: the
// vocabulary lives in one file, and a policy change can never leave one module enforcing a
// stale enum while another enforces the new one.
//
// Zero runtime dependencies. Pure, deterministic reads (no clock, no network).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const POLICY_PATH = join(HERE, "..", "policy", "source-policy.json");

// The policy format versions this code understands. Bump only with a migration.
export const SUPPORTED_POLICY_FORMAT_VERSION = 1;

// Stable error codes for policy-load failures — machine-assertable, distinct from
// record-validation problems (which use problems[].code in the validator).
export const POLICY_ERROR_CODES = Object.freeze({
  UNREADABLE: "ERR_POLICY_UNREADABLE",
  MALFORMED_JSON: "ERR_POLICY_MALFORMED_JSON",
  NOT_OBJECT: "ERR_POLICY_NOT_OBJECT",
  UNSUPPORTED_VERSION: "ERR_POLICY_UNSUPPORTED_VERSION",
  MISSING_SECTION: "ERR_POLICY_MISSING_SECTION",
});

export class PolicyError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "PolicyError";
    this.code = code;
  }
}

const REQUIRED_SECTIONS = [
  "sourceLayers", "evidenceLevels", "trustLevels", "sourceTypes",
  "channels", "personaSurfaces", "modes", "routeSeverities",
  "messageRoles", "copyrightScopes", "lengthBuckets",
];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Load + structurally validate the policy. Deterministic: same file → same object.
// Callers can pass an explicit path (tests exercise malformed policies via temp files).
export function loadPolicy(path = POLICY_PATH) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new PolicyError(POLICY_ERROR_CODES.UNREADABLE, `${path} (${err.code || err.message})`);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw new PolicyError(POLICY_ERROR_CODES.MALFORMED_JSON, err.message);
  }
  if (!isPlainObject(obj)) {
    throw new PolicyError(POLICY_ERROR_CODES.NOT_OBJECT, "policy root must be a JSON object");
  }
  if (obj.policyFormatVersion !== SUPPORTED_POLICY_FORMAT_VERSION) {
    throw new PolicyError(
      POLICY_ERROR_CODES.UNSUPPORTED_VERSION,
      `got ${JSON.stringify(obj.policyFormatVersion)}, supported ${SUPPORTED_POLICY_FORMAT_VERSION}`,
    );
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!(section in obj)) {
      throw new PolicyError(POLICY_ERROR_CODES.MISSING_SECTION, section);
    }
  }
  return obj;
}

// ---- Enum accessors (sorted for determinism where order is not semantic) -------------

export function sourceLayerIds(policy) {
  return Object.keys(policy.sourceLayers).sort();
}
export function evidenceLevelIds(policy) {
  return Object.keys(policy.evidenceLevels).sort();
}
export function trustLevelIds(policy) {
  return Object.keys(policy.trustLevels).sort();
}
export function routeSeverityIds(policy) {
  return Object.keys(policy.routeSeverities).sort();
}
export function isSourceType(policy, v) {
  return policy.sourceTypes.includes(v);
}
export function isChannel(policy, v) {
  return policy.channels.includes(v);
}
export function isPersonaSurface(policy, v) {
  return policy.personaSurfaces.includes(v);
}
export function isMode(policy, v) {
  return policy.modes.includes(v);
}
export function isMessageRole(policy, v) {
  return policy.messageRoles.includes(v);
}
export function isCopyrightScope(policy, v) {
  return policy.copyrightScopes.includes(v);
}

// ---- Capability accessors ------------------------------------------------------------
// A capability is granted only if BOTH the source layer AND the evidence level grant it.
// This is the fundamental "derive influence from the registry, never self-authorize" rule
// expressed once, here, so every consumer computes it identically.

export function layerCap(policy, layerId, cap) {
  const layer = policy.sourceLayers[layerId];
  return Boolean(layer && layer.capabilities && layer.capabilities[cap]);
}
export function evidenceCap(policy, levelId, cap) {
  const level = policy.evidenceLevels[levelId];
  return Boolean(level && level.capabilities && level.capabilities[cap]);
}

// Effective behavior/wording eligibility = layer AND evidence-level both permit.
export function canDriveBehavior(policy, layerId, evidenceLevel) {
  return layerCap(policy, layerId, "behavior") && evidenceCap(policy, evidenceLevel, "behavior");
}
export function canDriveWording(policy, layerId, evidenceLevel) {
  return layerCap(policy, layerId, "wording") && evidenceCap(policy, evidenceLevel, "wording");
}
export function canDriveMechanics(policy, layerId) {
  return layerCap(policy, layerId, "mechanics");
}
export function canBeCanonSevere(policy, layerId) {
  return layerCap(policy, layerId, "canonSevere");
}
export function canPublicExport(policy, layerId) {
  return layerCap(policy, layerId, "publicExport");
}
export function isQuarantined(policy, trustLevel) {
  const t = policy.trustLevels[trustLevel];
  return Boolean(t && t.quarantined);
}
export function routeSeverity(policy, severityId) {
  return policy.routeSeverities[severityId];
}

// The human-facing label of a source layer (e.g. "community", "guide"). Role-limit checks
// key on this label rather than a hardcoded layer id, so "which layer is community" is
// defined once, in the policy, and the validator cannot contradict a policy change.
export function layerLabel(policy, layerId) {
  const l = policy.sourceLayers[layerId];
  return l ? l.label : undefined;
}

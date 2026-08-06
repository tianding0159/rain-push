// Signal-policy accessor — the ONLY reader of policy/signal-policy.json.
//
// The character-signal sidecar (need/affect annotation) uses affect roles, annotation
// statuses and well-formedness constraints. They live once, in policy/signal-policy.json,
// and every consumer (schema enumFrom resolution, the parser, the contradiction metric)
// reads them here rather than hardcoding. This mirrors the corpus lib/source-policy.mjs SSOT
// pattern so the two policy files behave the same way.
//
// Deliberately SEPARATE from the corpus source-policy: those are provenance capabilities
// (what a source may influence); these are eval/analysis signals. Keeping them apart stops a
// weight from ever being mistaken for an influence grant.
//
// Zero runtime dependencies. Pure, deterministic reads (no clock, no network).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SIGNAL_POLICY_PATH = join(HERE, "..", "policy", "signal-policy.json");

export const SUPPORTED_SIGNAL_POLICY_FORMAT_VERSION = 1;

export const SIGNAL_POLICY_ERROR_CODES = Object.freeze({
  UNREADABLE: "ERR_SIGNAL_POLICY_UNREADABLE",
  MALFORMED_JSON: "ERR_SIGNAL_POLICY_MALFORMED_JSON",
  NOT_OBJECT: "ERR_SIGNAL_POLICY_NOT_OBJECT",
  UNSUPPORTED_VERSION: "ERR_SIGNAL_POLICY_UNSUPPORTED_VERSION",
  MISSING_SECTION: "ERR_SIGNAL_POLICY_MISSING_SECTION",
});

export class SignalPolicyError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "SignalPolicyError";
    this.code = code;
  }
}

const REQUIRED_SECTIONS = ["affectRoles", "annotationStatuses", "constraints"];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function loadSignalPolicy(path = SIGNAL_POLICY_PATH) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new SignalPolicyError(SIGNAL_POLICY_ERROR_CODES.UNREADABLE, `${path} (${err.code || err.message})`);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw new SignalPolicyError(SIGNAL_POLICY_ERROR_CODES.MALFORMED_JSON, err.message);
  }
  if (!isPlainObject(obj)) {
    throw new SignalPolicyError(SIGNAL_POLICY_ERROR_CODES.NOT_OBJECT, "policy root must be a JSON object");
  }
  if (obj.policyFormatVersion !== SUPPORTED_SIGNAL_POLICY_FORMAT_VERSION) {
    throw new SignalPolicyError(
      SIGNAL_POLICY_ERROR_CODES.UNSUPPORTED_VERSION,
      `got ${JSON.stringify(obj.policyFormatVersion)}, supported ${SUPPORTED_SIGNAL_POLICY_FORMAT_VERSION}`,
    );
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!(section in obj)) {
      throw new SignalPolicyError(SIGNAL_POLICY_ERROR_CODES.MISSING_SECTION, section);
    }
  }
  return obj;
}

// ---- Enum accessors (sorted for determinism) -----------------------------------------

export function affectRoleIds(policy) {
  return Object.keys(policy.affectRoles).sort();
}
export function annotationStatusIds(policy) {
  return Object.keys(policy.annotationStatuses).sort();
}
export function isAffectRole(policy, v) {
  return v in policy.affectRoles;
}
export function isAnnotationStatus(policy, v) {
  return v in policy.annotationStatuses;
}

// ---- Constraint accessors ------------------------------------------------------------

export function constraints(policy) {
  return policy.constraints;
}

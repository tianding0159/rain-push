// Scenario-policy accessor + a combined enum view for schema validation.
//
// The scenario schema needs enums from TWO SSOTs: channels / modes come from the corpus
// source-policy (reused, never duplicated), and scenarioTypes comes from the value-proof
// scenario-policy. The mini-schema validator resolves enumFrom against a single policy
// object, so combinedEnumPolicy() returns one object exposing both sets. It does NOT copy the
// corpus enums into a new file — it reads them live and merges at call time, so the corpus
// source-policy stays the single source for channels / modes.
//
// Zero runtime dependencies. Pure, deterministic.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPolicy } from "../../corpus/lib/source-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCENARIO_POLICY_PATH = join(HERE, "..", "policy", "scenario-policy.json");
export const SUPPORTED_SCENARIO_POLICY_FORMAT_VERSION = 1;

let _cache = null;
export function loadScenarioPolicy(path = SCENARIO_POLICY_PATH) {
  if (path === SCENARIO_POLICY_PATH && _cache) return _cache;
  const obj = JSON.parse(readFileSync(path, "utf8"));
  if (obj.policyFormatVersion !== SUPPORTED_SCENARIO_POLICY_FORMAT_VERSION) {
    throw new Error(`ERR_SCENARIO_POLICY_UNSUPPORTED_VERSION: got ${JSON.stringify(obj.policyFormatVersion)}`);
  }
  if (!Array.isArray(obj.scenarioTypes)) {
    throw new Error("ERR_SCENARIO_POLICY_MALFORMED: scenarioTypes must be an array");
  }
  if (path === SCENARIO_POLICY_PATH) _cache = obj;
  return obj;
}

export function scenarioTypeIds(policy = loadScenarioPolicy()) {
  return [...policy.scenarioTypes].sort();
}
export function isScenarioType(v, policy = loadScenarioPolicy()) {
  return policy.scenarioTypes.includes(v);
}

// A policy object the mini-schema validator can use to resolve enumFrom for scenarios:
// channels + modes live in the corpus source-policy; scenarioTypes lives here. Merged live.
export function combinedEnumPolicy(opts = {}) {
  const corpus = opts.corpusPolicy || loadPolicy();
  const scenario = opts.scenarioPolicy || loadScenarioPolicy();
  return {
    channels: corpus.channels,
    modes: corpus.modes,
    scenarioTypes: scenario.scenarioTypes,
  };
}

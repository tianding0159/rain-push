// Scenario suite loader + validator.
//
// Loads the synthetic scenario suite, validates each against the scenario schema (reusing the
// corpus mini-schema validator with the combined channels/modes/scenarioTypes enum view), and
// enforces suite-level invariants the directive requires: ≥30 scenarios, every scenario ≥3
// turns, turn orders contiguous 1..N, unique scenarioIds, and category coverage.
//
// Zero runtime dependencies. Pure, deterministic.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validate } from "../../corpus/lib/mini-schema.mjs";
import { combinedEnumPolicy, scenarioTypeIds } from "./scenario-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "schemas", "scenario.schema.json");
export const DEFAULT_SUITE_PATH = join(HERE, "..", "fixtures", "synthetic", "scenarios.json");

export const SUITE_MIN_SCENARIOS = 30;
export const SUITE_MIN_TURNS = 3;

let _schemaCache = null;
export function loadScenarioSchema(path = SCHEMA_PATH) {
  if (path === SCHEMA_PATH && _schemaCache) return _schemaCache;
  const s = JSON.parse(readFileSync(path, "utf8"));
  if (path === SCHEMA_PATH) _schemaCache = s;
  return s;
}

export function loadScenarios(path = DEFAULT_SUITE_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Validate a single scenario: schema + contiguous turn order.
export function validateScenario(scenario, { policy = combinedEnumPolicy(), schema = loadScenarioSchema() } = {}) {
  const { valid, errors } = validate(schema, scenario, policy);
  const problems = errors.map((e) => ({ code: `SCN_${e.code}`, path: e.path, detail: e.detail }));
  if (valid && Array.isArray(scenario.turns)) {
    const orders = scenario.turns.map((t) => t.order);
    const expected = orders.map((_, i) => i + 1);
    if (JSON.stringify([...orders].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
      problems.push({ code: "SCN_TURN_ORDER_NOT_CONTIGUOUS", path: "turns", detail: `orders ${orders.join(",")}` });
    }
  }
  return { valid: problems.length === 0, problems };
}

// Validate the whole suite + the suite-level invariants.
export function validateSuite(scenarios, opts = {}) {
  const policy = opts.policy || combinedEnumPolicy();
  const schema = opts.schema || loadScenarioSchema();
  const problems = [];
  const seen = new Set();
  const byType = {};

  scenarios.forEach((scn, i) => {
    const r = validateScenario(scn, { policy, schema });
    for (const p of r.problems) problems.push({ index: i, scenarioId: scn.scenarioId, ...p });
    if (scn.scenarioId) {
      if (seen.has(scn.scenarioId)) problems.push({ index: i, code: "SCN_DUP_ID", detail: scn.scenarioId });
      seen.add(scn.scenarioId);
    }
    if (scn.type) byType[scn.type] = (byType[scn.type] || 0) + 1;
    if (Array.isArray(scn.turns) && scn.turns.length < SUITE_MIN_TURNS) {
      problems.push({ index: i, scenarioId: scn.scenarioId, code: "SCN_TOO_FEW_TURNS", detail: `${scn.turns.length} < ${SUITE_MIN_TURNS}` });
    }
  });

  if (scenarios.length < SUITE_MIN_SCENARIOS) {
    problems.push({ code: "SCN_SUITE_TOO_SMALL", detail: `${scenarios.length} < ${SUITE_MIN_SCENARIOS}` });
  }
  // Every declared scenario type must be represented at least once (coverage).
  for (const t of scenarioTypeIds()) {
    if (!byType[t]) problems.push({ code: "SCN_TYPE_NOT_COVERED", detail: t });
  }

  return { valid: problems.length === 0, count: scenarios.length, byType, problems };
}

// Turn the multi-turn scenario into a per-turn query stream for retrieval / generation. The
// query text is the P input (+ prior P inputs as context). Deterministic.
export function scenarioQueries(scenario) {
  const prior = [];
  return scenario.turns.map((t) => {
    const q = {
      text: [...prior, t.pInput].join(" "),
      channel: scenario.channel,
      mode: scenario.mode,
      turnOrder: t.order,
    };
    prior.push(t.pInput);
    return q;
  });
}

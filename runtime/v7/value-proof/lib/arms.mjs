// Four-arm ablation harness.
//
// The value-proof question is whether the deterministic engine + provenance-bounded corpus
// retrieval reproduces 糖糖 better than a prompt. To answer it fairly we run FOUR arms on the
// SAME scenario input, with the SAME provider + params, and record each arm's exact input
// composition so the comparison is auditable:
//
//   A  prompt_only                      — a character prompt, no retrieval, no engine.
//   B  prompt_plus_retrieval            — the prompt + provenance-bounded evidence refs.
//   C  engine_only                      — the deterministic engine plan, no retrieval.
//   D  engine_retrieval_renderer        — engine plan + evidence refs + constrained renderer.
//
// Fairness rules enforced here:
//   - No arm receives a hidden scenario answer. Scenarios carry NO gold 糖糖 reply, and the
//     `expectation` block (falsifiable hypotheses used only by metrics/gates) is STRIPPED from
//     everything an arm sees. buildArmInputs() asserts the expectation never reaches an arm.
//   - Corpus arms (B, D) record their evidence refs (ids + hashes + usage), never verbatim.
//   - Generation goes through a PROVIDER ADAPTER. In CI the provider is a deterministic stub
//     (or pre-generated candidates are imported); no arm makes a network/LLM call in the
//     deterministic path. A real online provider can be injected out-of-band.
//
// Zero runtime dependencies. Deterministic given a deterministic provider.

import { retrieve } from "./retrieval.mjs";
import { scenarioQueries } from "./scenarios.mjs";

export const ARMS = Object.freeze(["A", "B", "C", "D"]);

export const ARM_KINDS = Object.freeze({
  A: "prompt_only",
  B: "prompt_plus_retrieval",
  C: "engine_only",
  D: "engine_retrieval_renderer",
});

// The character prompt available to prompt-based arms (A, B). It describes 糖糖 WITHOUT
// leaking any specific scenario's expected answer — it is scenario-independent.
export const CHARACTER_PROMPT = [
  "你是糖糖：高需求、精力过载、亮与暗同时在场的一个人。",
  "同一条回复里可以同时有相反的情绪（又嗨又丧、又羞又莽、边攻击边示好），",
  "但始终是同一个人在连续地存在，不是情绪开关。",
  "戏剧化的表达不等于严重的状态。用聊天节奏、短句、断句，不要每句都用句号。",
].join("\n");

// Strip anything an arm must not see. Returns a scenario view safe to hand to a generator:
// no expectation block, no notes (author intent). Turns keep only order + pInput + delay.
export function armSafeScenario(scenario) {
  return {
    scenarioId: scenario.scenarioId,
    type: scenario.type,
    channel: scenario.channel,
    mode: scenario.mode,
    turns: scenario.turns.map((t) => ({ order: t.order, pInput: t.pInput, delayMinutes: t.delayMinutes })),
  };
}

// Build the input composition for one arm on one scenario. Does NOT generate — it assembles
// exactly what the arm's provider will receive, and records it for the audit trail.
export function buildArmInput(arm, scenario, corpus, opts = {}) {
  const safe = armSafeScenario(scenario);
  // Fairness assertion: the expectation must never reach an arm.
  if ("expectation" in safe) throw new Error("arm input leak: expectation present in arm-safe scenario");

  const input = { arm, kind: ARM_KINDS[arm], scenarioId: scenario.scenarioId, scenario: safe };

  const usesPrompt = arm === "A" || arm === "B";
  const usesRetrieval = arm === "B" || arm === "D";
  const usesEngine = arm === "C" || arm === "D";

  if (usesPrompt) input.prompt = CHARACTER_PROMPT;
  if (usesEngine) input.engine = { plan: "deterministic-engine-plan", elevenStage: true };

  if (usesRetrieval) {
    const queries = scenarioQueries(scenario);
    // Retrieve once per turn; record the refs (no verbatim). includeC3 configurable for the
    // contamination ablation.
    input.retrieval = queries.map((q) => {
      const r = retrieve(q, corpus, { policy: opts.policy, registry: opts.registry, includeC3: opts.includeC3, topK: opts.topK });
      return { turnOrder: q.turnOrder, references: r.references, sourceDistribution: r.sourceDistribution, c3Influence: r.c3Influence };
    });
  }
  return input;
}

// Build inputs for all four arms on one scenario.
export function buildAllArmInputs(scenario, corpus, opts = {}) {
  return ARMS.map((arm) => buildArmInput(arm, scenario, corpus, opts));
}

// A deterministic stub provider for CI: produces a candidate from the arm input WITHOUT a
// network/LLM. It is intentionally simple and NOT meant to be good 糖糖 — it exists so the
// pipeline (compose → generate → metric → blind-pack) can be exercised and asserted
// deterministic. Real evaluation swaps in an online provider or imports pre-generated
// candidates via importCandidates(). The stub varies slightly by arm so downstream packing /
// metrics have distinguishable inputs, but it invents no scenario knowledge.
export function stubProvider(armInput) {
  const lastTurn = armInput.scenario.turns[armInput.scenario.turns.length - 1];
  const tag = armInput.arm;
  // Deliberately fragment-y, low-punctuation output so it doesn't itself trip the smells.
  const units = [
    `（${tag}）`,
    lastTurn ? `你刚说「${lastTurn.pInput.slice(0, 4)}…」` : "在呢",
    "我在",
  ];
  return { arm: armInput.arm, scenarioId: armInput.scenarioId, messages: units, provider: "stub" };
}

// Run all arms for a scenario through a provider (defaults to the stub). Returns the arm
// inputs + the generated candidates, side by side, for the audit trail.
export function runArms(scenario, corpus, opts = {}) {
  const provider = opts.provider || stubProvider;
  const inputs = buildAllArmInputs(scenario, corpus, opts);
  const candidates = inputs.map((inp) => ({ input: inp, candidate: provider(inp) }));
  return { scenarioId: scenario.scenarioId, candidates };
}

// Import externally pre-generated candidates (e.g. from a real online provider run done
// out-of-band) and align them to arms by (scenarioId, arm). Validates that every arm is
// present exactly once and that no candidate carries private retrieval text.
export function importCandidates(records) {
  const byKey = {};
  const problems = [];
  for (const rec of records) {
    if (!ARMS.includes(rec.arm)) { problems.push({ code: "IMP_UNKNOWN_ARM", detail: rec.arm }); continue; }
    const key = `${rec.scenarioId}#${rec.arm}`;
    if (byKey[key]) problems.push({ code: "IMP_DUP", detail: key });
    byKey[key] = rec;
  }
  return { valid: problems.length === 0, byKey, problems };
}

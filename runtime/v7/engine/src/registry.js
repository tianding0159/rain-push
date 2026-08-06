import { RUNTIME_ORDER } from "./constants.js";
import { runKnowledge } from "./runtimes/knowledge.js";
import { runContinuity } from "./runtimes/continuity.js";
import { runRelationship } from "./runtimes/relationship.js";
import { runMeaning } from "./runtimes/meaning.js";
import { runEmotion } from "./runtimes/emotion.js";
import { runNeed } from "./runtimes/need.js";
import { runThought } from "./runtimes/thought.js";
import { runDecision } from "./runtimes/decision.js";
import { runBehavior } from "./runtimes/behavior.js";
import { runExpression } from "./runtimes/expression.js";
import { runLanguage } from "./runtimes/language.js";

const RUNTIMES = Object.freeze({
  knowledge: runKnowledge,
  continuity: runContinuity,
  relationship: runRelationship,
  meaning: runMeaning,
  emotion: runEmotion,
  need: runNeed,
  thought: runThought,
  decision: runDecision,
  behavior: runBehavior,
  expression: runExpression,
  language: runLanguage
});

export function getRuntime(kind) {
  const runtime = RUNTIMES[kind];
  if (!runtime) throw new Error(`Unknown runtime: ${kind}`);
  return runtime;
}

export function runtimeEntries() {
  return RUNTIME_ORDER.map((kind) => [kind, getRuntime(kind)]);
}

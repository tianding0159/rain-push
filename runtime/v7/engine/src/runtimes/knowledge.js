import { emit, scenarioOf } from "./common.js";
import { normalizeText } from "../util.js";

export function runKnowledge(context) {
  const { event, signals } = context;
  const data = {
    normalizedText: normalizeText(event.text),
    actor: event.actor,
    channel: event.channel,
    scenario: scenarioOf(context),
    signals,
    facts: [
      { type: "event", value: normalizeText(event.text), confidence: event.text ? 0.98 : 0.4 },
      { type: "channel", value: event.channel, confidence: 1 },
      { type: "actor", value: event.actor, confidence: 1 }
    ],
    context: { ...(event.context ?? {}) },
    uncertainty: event.text ? [] : ["missing_text"]
  };
  return emit(context, "knowledge", data, {
    confidence: event.text ? 0.96 : 0.72,
    rules: ["normalize_event", "preserve_direct_evidence"]
  });
}

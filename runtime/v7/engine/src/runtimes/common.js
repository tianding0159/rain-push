import { createPacket } from "../packet.js";
import { scenarioCounterUpdate } from "../update-queue.js";
import { clamp, unique } from "../util.js";

const SCENARIO_PRIORITY = [
  "privacy_risk",
  "million_followers",
  "generic_stream_feedback",
  "generic_feedback",
  "post_stream_crash",
  "live_to_private",
  "promise_overdue",
  "forgotten_pudding",
  "pudding",
  "single_troll",
  "control_overreach",
  "body_fatigue",
  "hungry",
  "illness",
  "specific_feedback",
  "accurate_reply"
];

export function scenarioOf(context) {
  const explicit = context.event.context?.scenario;
  if (explicit) return String(explicit);
  return SCENARIO_PRIORITY.find((signal) => context.signals.includes(signal)) ?? "ordinary_event";
}

export function has(context, ...signals) {
  return signals.some((signal) => context.signals.includes(signal));
}

export function upstream(context, kind) {
  return context.packets[kind]?.data ?? {};
}

export function emit(context, kind, data, options = {}) {
  const scenario = scenarioOf(context);
  const updates = options.updates ?? [
    scenarioCounterUpdate(kind, scenario, context.event.eventId, options.confidence ?? 0.8)
  ];
  return createPacket(kind, context.event, data, {
    confidence: clamp(options.confidence ?? 0.8),
    updates,
    trace: {
      scenario,
      signals: unique(context.signals),
      upstream: options.upstream ?? [],
      rules: options.rules ?? []
    },
    validation: {
      status: "pass",
      errors: [],
      warnings: options.warnings ?? []
    }
  });
}

export function scoreMap(entries) {
  return Object.fromEntries(
    entries
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => [key, Math.round(clamp(Number(value), 0, 100) * 100) / 100])
  );
}

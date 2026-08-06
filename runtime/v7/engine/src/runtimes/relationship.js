import { emit, has, upstream } from "./common.js";

export function runRelationship(context) {
  const continuity = upstream(context, "continuity");
  let eventClass = "ordinary";
  let localSeverity = "low";

  if (has(context, "generic_feedback")) eventClass = "low_information_feedback";
  if (has(context, "promise_overdue")) {
    eventClass = "overdue_promise";
    localSeverity = continuity.repetition.genericFeedback > 1 ? "medium" : "low";
  }
  if (has(context, "forgotten_pudding", "pudding")) eventClass = "ordinary_omission";
  if (has(context, "single_troll")) eventClass = "audience_provocation";
  if (has(context, "privacy_risk")) {
    eventClass = "privacy_threat";
    localSeverity = "high";
  }
  if (has(context, "control_overreach")) {
    eventClass = "autonomy_violation";
    localSeverity = "medium";
  }

  const data = {
    partnerDisplayName: "豆豆",
    role: context.event.context?.relationshipRole ?? "partner_and_producer",
    trustBaseline: Number(context.event.context?.trustBaseline ?? 0.72),
    eventClass,
    localSeverity,
    availability: has(context, "prior_notice") ? "explained_absence" : "unknown_or_available",
    repairStatus: context.event.context?.repairStatus ?? "none",
    safetyMemory: context.event.context?.safetyMemory ?? "stable_relationship",
    publicPrivateBoundary: has(context, "privacy_risk") ? "threatened" : "intact",
    globalRuptureSupported: false
  };

  return emit(context, "relationship", data, {
    confidence: 0.86,
    upstream: ["knowledge", "continuity"],
    rules: ["local_relationship_interpretation", "anti_globalization"]
  });
}

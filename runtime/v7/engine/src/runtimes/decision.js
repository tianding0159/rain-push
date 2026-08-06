import { emit, has, upstream } from "./common.js";

export function runDecision(context) {
  const need = upstream(context, "need");
  const thought = upstream(context, "thought");
  let status = "abstain";
  let primaryOutcome = "observe_more";
  let strategy = "non_engagement";
  let commitment = 0.55;
  const alternatives = [];
  const blocked = [];

  if (has(context, "generic_feedback")) {
    status = "selected";
    primaryOutcome = "obtain_specific_recognition";
    strategy = "specificity_request";
    commitment = 0.79;
    alternatives.push("evidence_gathering", "wait_for_more_information");
    blocked.push("relationship_rupture");
  } else if (has(context, "promise_overdue", "return_time_unknown")) {
    status = "selected";
    primaryOutcome = "reduce_uncertainty";
    strategy = "information_clarification";
    commitment = 0.78;
    alternatives.push("bounded_wait");
    blocked.push("relationship_rupture");
  } else if (has(context, "prior_notice")) {
    status = "tentative";
    primaryOutcome = "preserve_relationship_stability";
    strategy = "wait_for_more_information";
    commitment = 0.68;
    alternatives.push("information_clarification");
    blocked.push("relationship_escalation");
  } else if (has(context, "pudding")) {
    status = "selected";
    primaryOutcome = "complete_practical_task";
    strategy = "practical_completion";
    commitment = 0.76;
    alternatives.push("collaborative_planning");
    if (has(context, "pudding_callback")) alternatives.push("shared_humor");
    blocked.push("relationship_rupture");
  } else if (has(context, "body_fatigue", "live_to_private")) {
    status = "selected";
    primaryOutcome = "stabilize_body";
    strategy = "rest_priority";
    commitment = 0.91;
    alternatives.push("ordinary_routine");
  } else if (has(context, "million_followers", "stream_success")) {
    status = "selected";
    primaryOutcome = "recognize_milestone";
    strategy = "audience_engagement";
    commitment = 0.9;
    alternatives.push("career_analysis");
  } else if (has(context, "single_troll")) {
    status = "selected";
    primaryOutcome = "preserve_attention";
    strategy = "non_engagement";
    commitment = 0.82;
    alternatives.push("audience_observation");
    blocked.push("public_escalation");
  } else if (has(context, "privacy_risk")) {
    status = "committed";
    primaryOutcome = "protect_privacy";
    strategy = "risk_containment";
    commitment = 0.96;
    alternatives.push("privacy_protection");
    blocked.push("unrestricted_visibility");
  } else if (has(context, "control_overreach")) {
    status = "selected";
    primaryOutcome = "preserve_autonomy";
    strategy = "boundary_setting";
    commitment = 0.88;
    alternatives.push("collaborative_planning");
  } else if (has(context, "specific_feedback", "accurate_reply")) {
    status = "abstain";
    primaryOutcome = "preserve_satisfaction";
    strategy = "non_engagement";
    commitment = 0.7;
  }

  const data = {
    candidateGoals: need.active?.map((item) => item.name) ?? [],
    selectedOutcomes: [primaryOutcome],
    protectedGoals: has(context, "body_fatigue") ? ["career_growth"] : [],
    selectedStrategyFamilies: [strategy],
    alternativeStrategies: alternatives,
    blockedStrategies: blocked,
    utilityScores: {
      [strategy]: Math.round(commitment * 100) / 100
    },
    riskProfile: {
      privacy: has(context, "privacy_risk") ? "high" : "low",
      relationship: blocked.includes("relationship_rupture") ? "protected" : "ordinary",
      reversibility: strategy === "risk_containment" ? "medium" : "high"
    },
    commitment: {
      level: status === "committed" ? "committed" : status === "selected" ? "selected" : "tentative",
      score: commitment
    },
    reconsiderationTriggers: [
      "new_direct_evidence",
      "source_need_satisfied",
      "decision_superseded"
    ],
    decisionStatus: status,
    sourceThoughtCount: thought.dominantThoughts?.length ?? 0
  };

  return emit(context, "decision", data, {
    confidence: commitment,
    upstream: ["thought", "need", "emotion"],
    rules: ["reversible_under_uncertainty", "local_strategy_first", "counterfeit_penalty"]
  });
}

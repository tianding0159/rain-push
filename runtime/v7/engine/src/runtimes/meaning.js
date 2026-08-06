import { emit, has, scoreMap, upstream } from "./common.js";

export function runMeaning(context) {
  const continuity = upstream(context, "continuity");
  const meanings = [];
  const domains = [];

  if (has(context, "generic_feedback")) {
    meanings.push("feedback_low_information", "partner_may_not_have_watched_carefully");
    domains.push(["relationship", 0.82], ["career", 0.66]);
  }
  if (has(context, "specific_feedback", "accurate_reply")) {
    meanings.push("feedback_specific", "attunement_evidence");
    domains.push(["relationship", 0.72], ["career", 0.58]);
  }
  if (has(context, "prior_notice") && !has(context, "promise_overdue")) {
    meanings.push("delay_has_ordinary_explanation");
    domains.push(["relationship", 0.32]);
  }
  if (has(context, "promise_overdue", "return_time_unknown")) {
    meanings.push("return_time_unknown", "local_reliability_question");
    domains.push(["relationship", 0.74]);
  }
  if (has(context, "forgotten_pudding", "pudding")) {
    meanings.push("shared_life_ordinary_omission");
    domains.push(["ordinary_life", 0.8]);
  }
  if (has(context, "live_to_private", "body_fatigue")) {
    meanings.push("post_stream_capacity_drop", "performance_and_fatigue_coexist");
    domains.push(["body", 0.88], ["career", 0.52]);
  }
  if (has(context, "million_followers", "stream_success")) {
    meanings.push("success_is_real", "audience_impact_is_material");
    domains.push(["career", 0.9], ["audience", 0.94]);
  }
  if (has(context, "single_troll")) {
    meanings.push("low_value_audience_provocation");
    domains.push(["audience", 0.45]);
  }
  if (has(context, "privacy_risk")) {
    meanings.push("visibility_risk", "private_information_may_spread");
    domains.push(["privacy", 0.98], ["safety", 0.91]);
  }
  if (has(context, "control_overreach")) {
    meanings.push("agency_is_being_overridden");
    domains.push(["autonomy", 0.88], ["relationship", 0.62]);
  }
  if (has(context, "dark_humor")) meanings.push("dark_language_context_not_automatically_crisis");
  if (has(context, "sexual_joke")) meanings.push("sexual_joke_not_automatically_intimacy");
  if (has(context, "drug_reference")) meanings.push("drug_reference_not_automatically_severe");

  if (!meanings.length) meanings.push("ordinary_event_without_severe_implication");

  const data = {
    meanings,
    domains: scoreMap(domains),
    counterfactuals: has(context, "generic_feedback")
      ? ["one_concrete_detail_would_reduce_uncertainty"]
      : [],
    internetBridges: has(context, "million_followers") ? ["milestone_to_audience_impact"] : [],
    blockedMeanings: [
      ...(has(context, "generic_feedback", "pudding", "prior_notice") ? ["relationship_ending"] : []),
      ...(has(context, "dark_humor") ? ["automatic_crisis"] : []),
      ...(has(context, "sexual_joke") ? ["automatic_intimacy"] : [])
    ],
    promiseStatus: continuity.promise.status
  };

  return emit(context, "meaning", data, {
    confidence: 0.85,
    upstream: ["knowledge", "continuity", "relationship"],
    rules: ["typed_meaning_activation", "ordinary_explanation_first"]
  });
}

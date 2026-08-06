import { emit, has, upstream } from "./common.js";

function need(name, priority, sourceMeanings, sourceEmotions, status = "unsatisfied") {
  return {
    name,
    priority,
    activation: priority,
    deprivation: Math.max(0, priority - 0.12),
    sourceMeanings,
    sourceEmotions,
    satisfactionStatus: status
  };
}

export function runNeed(context) {
  const meaning = upstream(context, "meaning");
  const emotion = upstream(context, "emotion");
  const active = [];
  const blocked = [];

  if (has(context, "generic_feedback")) {
    active.push(
      need("recognition_specificity", 0.88, ["feedback_low_information"], ["irritation", "vulnerability"]),
      need("accurate_attunement", 0.79, ["feedback_low_information"], ["irritation"]),
      need("creative_partnership", 0.66, ["partner_may_not_have_watched_carefully"], ["vulnerability"])
    );
    blocked.push("relationship_survival");
  }
  if (has(context, "specific_feedback", "accurate_reply")) {
    active.push(need("milestone_recognition", 0.36, ["feedback_specific"], ["pride"], "satisfied"));
  }
  if (has(context, "promise_overdue", "return_time_unknown")) {
    active.push(
      need("uncertainty_reduction", 0.86, ["return_time_unknown"], ["irritation"]),
      need("predictability", 0.72, ["local_reliability_question"], ["vulnerability"])
    );
  } else if (has(context, "prior_notice")) {
    active.push(need("relationship_availability", 0.34, ["delay_has_ordinary_explanation"], ["attachment_warmth"], "partially_satisfied"));
  }
  if (has(context, "pudding")) {
    active.push(
      need("practical_completion", has(context, "repeated_pudding") ? 0.84 : 0.78, ["shared_life_ordinary_omission"], ["irritation"]),
      need("domestic_continuity", 0.58, ["shared_life_ordinary_omission"], ["ordinary_comfort"])
    );
    if (has(context, "pudding_callback")) active.push(need("play", 0.42, ["shared_life_ordinary_omission"], ["absurd_amusement"]));
    blocked.push("relationship_survival", "grounding");
  }
  if (has(context, "body_fatigue", "live_to_private")) {
    active.push(
      need("rest", 0.92, ["post_stream_capacity_drop"], ["fatigue", "post_stream_crash"]),
      need("ordinary_comfort", 0.62, ["performance_and_fatigue_coexist"], ["vulnerability"])
    );
  }
  if (has(context, "million_followers", "stream_success")) {
    active.push(
      need("audience_impact", 0.9, ["audience_impact_is_material"], ["audience_euphoria"]),
      need("milestone_recognition", 0.84, ["success_is_real"], ["triumph", "pride"]),
      need("career_growth", 0.74, ["success_is_real"], ["pride"])
    );
  }
  if (has(context, "single_troll")) {
    active.push(need("audience_distance", 0.48, ["low_value_audience_provocation"], ["irritation"]));
  }
  if (has(context, "privacy_risk")) {
    active.push(
      need("privacy", 0.98, ["visibility_risk"], ["fear"]),
      need("public_safety", 0.94, ["private_information_may_spread"], ["fear", "anger"]),
      need("boundary_protection", 0.86, ["visibility_risk"], ["anger"])
    );
  }
  if (has(context, "control_overreach")) {
    active.push(
      need("autonomy", 0.9, ["agency_is_being_overridden"], ["irritation", "anger"]),
      need("shared_control", 0.7, ["agency_is_being_overridden"], ["irritation"])
    );
  }
  if (has(context, "hungry")) active.push(need("food", 0.95, ["body_hunger"], ["irritation"]));
  if (has(context, "illness")) active.push(need("illness_care", 0.9, ["body_illness"], ["vulnerability"]));

  active.sort((a, b) => b.priority - a.priority);
  const dominant = active.filter((item) => item.priority >= 0.75).slice(0, 2).map((item) => item.name);

  const data = {
    active,
    dominant,
    protected: has(context, "body_fatigue") ? ["career_growth"] : [],
    blocked: [...new Set(blocked)],
    conflicts: [
      ...(has(context, "body_fatigue", "stream_success") ? [{
        needA: "rest",
        needB: "career_growth",
        type: "career_body"
      }] : []),
      ...(has(context, "privacy_risk", "stream_success") ? [{
        needA: "privacy",
        needB: "audience_impact",
        type: "privacy_visibility"
      }] : [])
    ],
    validSatisfierFamilies: {
      recognition_specificity: ["specific_feedback"],
      uncertainty_reduction: ["exact_information"],
      practical_completion: ["task_completion"],
      privacy: ["exposure_containment"],
      rest: ["body_regulation"]
    },
    invalidSubstitutes: {
      recognition_specificity: ["generic_praise"],
      practical_completion: ["unrelated_affection"],
      relationship_reliability: ["one_grand_promise"]
    },
    sourceMeaningCount: meaning.meanings?.length ?? 0,
    sourceEmotionCount: Object.keys(emotion.emotions ?? {}).length
  };

  return emit(context, "need", data, {
    confidence: active.length ? 0.88 : 0.7,
    upstream: ["meaning", "emotion", "relationship"],
    rules: ["need_emotion_separation", "counterfeit_satisfaction_block"]
  });
}

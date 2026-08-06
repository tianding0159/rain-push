import { emit, has, scoreMap, upstream } from "./common.js";

export function runEmotion(context) {
  const meaning = upstream(context, "meaning");
  const entries = [];

  if (has(context, "generic_feedback")) {
    entries.push(["irritation", 55], ["vulnerability", 35], ["affection", 24]);
  }
  if (has(context, "promise_overdue")) {
    entries.push(["irritation", 50], ["vulnerability", 28], ["loneliness", 18]);
  } else if (has(context, "prior_notice")) {
    entries.push(["ordinary_comfort", 20], ["attachment_warmth", 14]);
  }
  if (has(context, "pudding")) {
    entries.push(["irritation", has(context, "repeated_pudding") ? 42 : 25], ["absurd_amusement", 30]);
  }
  if (has(context, "body_fatigue", "live_to_private")) {
    entries.push(["fatigue", 82], ["post_stream_crash", 72], ["vulnerability", 40]);
  }
  if (has(context, "million_followers", "stream_success")) {
    entries.push(["triumph", 90], ["audience_euphoria", 85], ["pride", 78]);
  }
  if (has(context, "single_troll")) entries.push(["irritation", 22], ["contempt_play", 18]);
  if (has(context, "privacy_risk")) entries.push(["fear", 76], ["anger", 58], ["dread", 45]);
  if (has(context, "control_overreach")) entries.push(["irritation", 62], ["anger", 40]);
  if (has(context, "specific_feedback", "accurate_reply")) entries.push(["validation_relief", 66], ["pride", 34]);
  if (!entries.length) entries.push(["ordinary_comfort", 16]);

  const emotions = scoreMap(entries);
  const dominant = Object.entries(emotions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  const data = {
    emotions,
    dominant,
    expressionPressure: Math.min(100, Math.max(...Object.values(emotions), 0)),
    regulatedBy: has(context, "prior_notice") ? ["credible_ordinary_explanation"] : [],
    blocked: [
      ...(meaning.blockedMeanings?.includes("automatic_crisis") ? ["forced_crisis"] : []),
      ...(meaning.blockedMeanings?.includes("automatic_intimacy") ? ["forced_intimacy"] : [])
    ],
    ameKangelSharedState: true
  };

  return emit(context, "emotion", data, {
    confidence: 0.84,
    upstream: ["meaning", "relationship"],
    rules: ["multi_emotion_activation", "severe_emotion_gates"]
  });
}

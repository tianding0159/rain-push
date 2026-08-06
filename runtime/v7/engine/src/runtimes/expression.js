import { emit, has, upstream } from "./common.js";

function controls(overrides = {}) {
  return {
    directness: 0.5,
    warmth: 0.35,
    pressure: 0.25,
    playfulness: 0.1,
    irony: 0.05,
    theatricality: 0.05,
    sweetness: 0.1,
    profanityPressure: "none",
    vulnerabilityVisibility: 0.25,
    emotionalTransparency: 0.35,
    selfExposure: 0.2,
    publicness: 0,
    audienceOrientation: 0,
    partnerOrientation: 0.7,
    ...overrides
  };
}

export function runExpression(context) {
  const behavior = upstream(context, "behavior");
  const emotion = upstream(context, "emotion");

  let primarySurface = "neutral_practical";
  let secondarySurface = null;
  let secondaryRatio = 0;
  let register = "practical_neutral";
  let surfaceControls = controls();
  let acts = [];
  let hidden = [];
  let visible = [];
  let masking = [];
  let noSurfaceReason = [];

  if (["wait", "observe_without_engaging", "no_action"].includes(behavior.actionType)) {
    primarySurface = "no_surface";
    register = "no_surface";
    surfaceControls = controls({
      directness: 0,
      warmth: 0,
      pressure: 0,
      partnerOrientation: 0,
      emotionalTransparency: 0,
      selfExposure: 0
    });
    noSurfaceReason = [behavior.silenceState?.reason ?? "no_response_needed"];
  } else if (behavior.actionType === "request_specific_feedback") {
    primarySurface = "ame_private";
    register = "private_direct";
    surfaceControls = controls({
      directness: 0.78,
      warmth: 0.28,
      pressure: 0.52,
      vulnerabilityVisibility: 0.42,
      partnerOrientation: 0.92
    });
    acts = ["request_specificity", "mark_unresolved"];
    visible = ["irritation", "vulnerability"];
    hidden = ["abandonment_anxiety"];
    masking = [{ sourceEmotion: "abandonment_anxiety", surfaceReplacement: "irritation" }];
  } else if (behavior.actionType === "ask_question") {
    primarySurface = "ame_private";
    register = "private_direct";
    surfaceControls = controls({
      directness: 0.82,
      warmth: 0.31,
      pressure: 0.58,
      vulnerabilityVisibility: 0.46,
      partnerOrientation: 0.94
    });
    acts = ["request_information", "complain_local"];
    visible = ["irritation", "affection"];
    hidden = ["abandonment_anxiety"];
    masking = [{ sourceEmotion: "abandonment_anxiety", surfaceReplacement: "irritation" }];
  } else if (behavior.actionType === "coordinate_task") {
    primarySurface = "neutral_practical";
    secondarySurface = "ame_private";
    secondaryRatio = behavior.secondaryAction ? 0.25 : 0.1;
    register = "practical_neutral";
    surfaceControls = controls({
      directness: 0.72,
      warmth: 0.38,
      playfulness: behavior.secondaryAction ? 0.45 : 0.12,
      partnerOrientation: 0.82
    });
    acts = ["task_coordination", ...(behavior.secondaryAction ? ["tease"] : [])];
    visible = ["irritation", "absurd_amusement"];
  } else if (behavior.actionType === "provide_update" && has(context, "live_to_private", "body_fatigue")) {
    primarySurface = "ame_private";
    secondarySurface = "kangel_private_echo";
    secondaryRatio = 0.25;
    register = "private_low_demand";
    surfaceControls = controls({
      directness: 0.56,
      warmth: 0.42,
      pressure: 0.08,
      theatricality: 0.18,
      vulnerabilityVisibility: 0.58,
      partnerOrientation: 0.88
    });
    acts = ["reduce_pressure", "practical_update"];
    visible = ["fatigue", "post_stream_crash"];
    hidden = ["audience_euphoria"];
  } else if (behavior.actionType === "acknowledge_audience") {
    primarySurface = "kangel_stage";
    register = "live_high_energy";
    surfaceControls = controls({
      directness: 0.64,
      warmth: 0.78,
      pressure: 0.22,
      playfulness: 0.62,
      theatricality: 0.88,
      sweetness: 0.82,
      vulnerabilityVisibility: 0.18,
      publicness: 1,
      audienceOrientation: 0.96,
      partnerOrientation: 0.12
    });
    acts = ["audience_address", "milestone_frame", "audience_thanks"];
    visible = ["triumph", "audience_euphoria", "pride"];
  } else if (behavior.actionType === "reduce_public_exposure") {
    primarySurface = "kangel_stage";
    secondarySurface = "ame_public_shadow";
    secondaryRatio = 0.2;
    register = "public_defensive";
    surfaceControls = controls({
      directness: 0.78,
      warmth: 0.12,
      pressure: 0.72,
      irony: 0.05,
      theatricality: 0.28,
      sweetness: 0.05,
      vulnerabilityVisibility: 0.08,
      publicness: 1,
      audienceOrientation: 0.82,
      partnerOrientation: 0.05
    });
    acts = ["set_boundary", "public_update"];
    visible = ["anger"];
    hidden = ["fear"];
  } else if (behavior.actionType === "set_boundary") {
    primarySurface = "ame_private";
    register = "private_boundary";
    surfaceControls = controls({
      directness: 0.9,
      warmth: 0.18,
      pressure: 0.7,
      vulnerabilityVisibility: 0.25,
      partnerOrientation: 0.92
    });
    acts = ["set_boundary", "explain_local_reason"];
    visible = ["irritation", "anger"];
  }

  const data = {
    behaviorRefs: [context.packets.behavior.packetId],
    primarySurface,
    secondarySurface,
    personaBlend: {
      primary: primarySurface,
      secondary: secondarySurface,
      secondaryRatio,
      deliberate: Boolean(secondarySurface),
      trigger: secondarySurface ? (has(context, "live_to_private") ? "channel_transition" : "surface_trace") : null
    },
    register,
    surfaceControls,
    emotionalProjection: {
      visible,
      hidden,
      sourceEmotions: emotion.emotions ?? {}
    },
    disclosure: {
      level: primarySurface === "no_surface" ? "none" : behavior.channel === "public_post" || behavior.channel === "live_stream" ? "low" : "moderate",
      redactions: behavior.channel === "public_post" || behavior.channel === "live_stream"
        ? ["private_promise_detail", "location", "intimate_detail", "real_name"]
        : []
    },
    masking,
    leakage: secondarySurface ? [{
      sourceSurface: secondarySurface,
      targetSurface: primarySurface,
      trigger: has(context, "live_to_private") ? "channel_transition" : "controlled_blend",
      intensity: secondaryRatio
    }] : [],
    rhetoricalPlan: {
      primaryActs: acts.slice(0, 2),
      secondaryActs: acts.slice(2),
      blockedActs: [
        ...(has(context, "generic_feedback", "promise_overdue") ? ["global_relationship_accusation"] : []),
        ...(behavior.channel === "public_post" || behavior.channel === "live_stream" ? ["private_relationship_detail"] : [])
      ]
    },
    partnerReferenceMode: behavior.channel === "jine_private"
      ? (behavior.posture === "boundary_forward" ? "boundary" : behavior.posture === "practical" ? "practical" : "intimate")
      : null,
    audienceReferenceMode: behavior.channel === "live_stream" ? "collective_affection" : behavior.channel === "public_post" ? "collective_distance" : null,
    selfReferenceMode: primarySurface === "kangel_stage" ? "kangel_self" : primarySurface === "no_surface" ? null : "ame_self",
    blockedStyles: [
      "generic_assistant_voice",
      "generic_therapy_voice",
      "forced_crisis_language",
      "forced_cuteness",
      "everything_is_content"
    ],
    noSurfaceReason
  };

  return emit(context, "expression", data, {
    confidence: primarySurface === "no_surface" ? 0.96 : 0.88,
    upstream: ["behavior", "decision", "emotion"],
    rules: ["surface_channel_fit", "emotion_mask_preservation", "public_private_separation"]
  });
}

import { emit, has, upstream } from "./common.js";

export function runBehavior(context) {
  const decision = upstream(context, "decision");
  const strategy = decision.selectedStrategyFamilies?.[0] ?? "non_engagement";

  let actionType = "no_action";
  let channel = "no_channel";
  let messageOrActionCount = 0;
  let repetitionLimit = 0;
  let posture = "observational";
  let timing = { class: "no_schedule", expiry: null };
  let sequence = [];
  let stopConditions = ["new_event"];
  let cancelConditions = ["decision_superseded"];
  let fallback = null;
  let escalationLevel = 0;
  let secondaryAction = null;

  if (strategy === "specificity_request") {
    actionType = "request_specific_feedback";
    channel = "jine_private";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "direct";
    timing = { class: "immediate", expiry: "30_minutes", cooldown: "30_minutes" };
    stopConditions = ["specific_feedback_received", "decision_superseded"];
    fallback = "wait_for_more_information";
    escalationLevel = 1;
  } else if (strategy === "information_clarification") {
    actionType = "ask_question";
    channel = "jine_private";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "direct";
    timing = { class: "immediate", expiry: "30_minutes", cooldown: "30_minutes" };
    stopConditions = ["exact_information_received", "decision_superseded"];
    fallback = "bounded_wait";
    escalationLevel = 1;
  } else if (strategy === "wait_for_more_information") {
    actionType = "wait";
    channel = "internal_wait";
    posture = "observational";
    timing = {
      class: "wait_until_event",
      triggerEvent: context.event.context?.promiseDueAt ? "promised_return_time" : "new_information",
      graceWindow: "15_minutes",
      expiry: context.event.context?.promiseDueAt ?? "next_relevant_event"
    };
    stopConditions = ["target_event_arrived", "promise_overdue", "decision_superseded"];
    fallback = "one_private_clarification";
  } else if (strategy === "practical_completion") {
    actionType = "coordinate_task";
    channel = "jine_private";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "practical";
    timing = { class: "immediate", expiry: "current_topic" };
    stopConditions = ["task_completion_confirmed", "decision_superseded"];
    fallback = "collaborative_planning";
    secondaryAction = has(context, "pudding_callback") ? "make_playful_callback" : null;
    escalationLevel = 1;
  } else if (strategy === "rest_priority") {
    actionType = "provide_update";
    channel = "jine_private";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "low_demand";
    timing = { class: "immediate", expiry: "30_minutes" };
    sequence = [
      { index: 1, actionType: "provide_update", channel: "jine_private", status: "ready" },
      { index: 2, actionType: "rest", channel: "physical_world", status: "pending" },
      { index: 3, actionType: "inspect_stream_data", channel: "physical_world", status: "conditional", precondition: "body_state_improved" }
    ];
    stopConditions = ["body_state_improved", "decision_superseded"];
    fallback = "continue_rest";
  } else if (strategy === "audience_engagement") {
    actionType = "acknowledge_audience";
    channel = "live_stream";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "performative";
    timing = { class: "immediate", expiry: "current_stream" };
    stopConditions = ["milestone_acknowledged", "stream_ended"];
    escalationLevel = 1;
  } else if (strategy === "non_engagement") {
    actionType = has(context, "single_troll") ? "observe_without_engaging" : "no_action";
    channel = actionType === "no_action" ? "no_channel" : "internal_wait";
    messageOrActionCount = 0;
    repetitionLimit = 0;
    posture = "observational";
    timing = { class: actionType === "no_action" ? "no_schedule" : "wait_until_event", expiry: "thread_expiry" };
    stopConditions = ["thread_expires", "threat_escalates", "new_event"];
  } else if (strategy === "risk_containment") {
    actionType = "reduce_public_exposure";
    channel = "public_post";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "boundary_forward";
    timing = { class: "immediate", expiry: "current_risk_event" };
    sequence = [
      { index: 1, actionType: "reduce_public_exposure", channel: "public_post", status: "ready" },
      { index: 2, actionType: "request_external_safety_action", channel: "no_channel", status: "not_executed" },
      { index: 3, actionType: "observe_for_new_exposure", channel: "internal_wait", status: "pending" }
    ];
    stopConditions = ["exposure_contained", "decision_superseded"];
    escalationLevel = 4;
  } else if (strategy === "boundary_setting") {
    actionType = "set_boundary";
    channel = "jine_private";
    messageOrActionCount = 1;
    repetitionLimit = 1;
    posture = "boundary_forward";
    timing = { class: "immediate", expiry: "current_topic" };
    stopConditions = ["boundary_acknowledged", "decision_superseded"];
    escalationLevel = 2;
  }

  const data = {
    decisionRefs: [context.packets.decision.packetId],
    actionType,
    strategyFamily: strategy,
    targetOutcome: decision.selectedOutcomes?.[0] ?? "observe_more",
    channel,
    target: context.event.actor === "audience" ? "audience" : "豆豆",
    messageOrActionCount,
    repetitionLimit,
    posture,
    timing,
    sequence,
    secondaryAction,
    waitingState: actionType === "wait" ? timing : null,
    silenceState: ["wait", "observe_without_engaging", "no_action"].includes(actionType)
      ? { reason: actionType === "wait" ? "deliberate_wait" : actionType === "observe_without_engaging" ? "public_non_engagement" : "no_response_needed" }
      : null,
    escalationLevel,
    preconditions: [
      ...(channel === "jine_private" ? ["private_channel_available"] : []),
      ...(has(context, "privacy_risk") ? ["privacy_risk_confirmed"] : [])
    ],
    stopConditions,
    cancelConditions,
    fallback,
    externalActionRequests: actionType === "reduce_public_exposure"
      ? [{
          action: "request_platform_moderation",
          status: "not_executed",
          confirmationRequired: true
        }]
      : [],
    status: actionType === "wait" ? "waiting" : actionType === "no_action" ? "completed" : "ready"
  };

  return emit(context, "behavior", data, {
    confidence: decision.commitment?.score ?? 0.75,
    upstream: ["decision", "thought", "need"],
    rules: ["strategy_to_action_mapping", "bounded_repetition", "stop_condition_required"]
  });
}

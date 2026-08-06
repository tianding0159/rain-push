import { emit, has, scenarioOf, upstream } from "./common.js";

export function runContinuity(context) {
  const knowledge = upstream(context, "knowledge");
  const previous = context.state.history?.at(-1) ?? null;
  const promiseStatus = context.event.context?.promiseStatus ?? (
    has(context, "promise_overdue") ? "overdue" : "none"
  );

  const data = {
    scenario: scenarioOf(context),
    priorNotice: has(context, "prior_notice"),
    promise: {
      status: promiseStatus,
      dueAt: context.event.context?.promiseDueAt ?? null,
      exact: Boolean(context.event.context?.promiseDueAt)
    },
    topic: context.event.context?.topic ?? knowledge.scenario,
    callbacks: has(context, "pudding_callback") ? ["pudding_inventory"] : [],
    channelTransition: has(context, "live_to_private") ? "live_to_private" : null,
    previousEventId: previous?.eventId ?? null,
    repetition: {
      genericFeedback: has(context, "repeated_generic_feedback") ? 2 : 1,
      pudding: has(context, "repeated_pudding") ? 2 : 1
    },
    pendingThreads: previous?.pendingThreads ?? []
  };

  return emit(context, "continuity", data, {
    confidence: 0.9,
    upstream: ["knowledge"],
    rules: ["promise_tracking", "topic_continuity", "callback_resolution"]
  });
}

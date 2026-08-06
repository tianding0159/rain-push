import { RUNTIME_ORDER } from "./constants.js";
import { validatePacketShape } from "./packet.js";

export function validateEvent(event) {
  const errors = [];
  const warnings = [];
  if (!event || typeof event !== "object") errors.push("event_not_object");
  if (!event?.eventId) errors.push("missing_event_id");
  if (!event?.timestamp || Number.isNaN(Date.parse(event.timestamp))) errors.push("invalid_timestamp");
  if (!["canon", "living"].includes(event?.mode)) errors.push("invalid_mode");
  if (!event?.channel) errors.push("missing_channel");
  if (!["partner", "character", "audience", "system"].includes(event?.actor)) errors.push("invalid_actor");
  if (!event?.text && !(event?.signals?.length) && !Object.keys(event?.context ?? {}).length) {
    warnings.push("empty_semantic_event");
  }
  return {
    status: errors.length ? "reject" : "pass",
    errors,
    warnings
  };
}

export function validatePipeline(packets, event) {
  const errors = [];
  const warnings = [];

  for (const kind of RUNTIME_ORDER) {
    const packet = packets[kind];
    const result = validatePacketShape(packet, kind);
    errors.push(...result.errors.map((error) => `${kind}:${error}`));
    if (packet?.eventId !== event.eventId) errors.push(`${kind}:event_id_mismatch`);
  }

  const behavior = packets.behavior?.data;
  const expression = packets.expression?.data;
  const language = packets.language?.data;

  if (behavior?.actionType === "wait" || behavior?.actionType === "no_action" || behavior?.actionType === "observe_without_engaging") {
    if (language?.renderStatus !== "no_output") errors.push("no_surface_behavior_rendered_text");
  }

  if (expression?.primarySurface === "no_surface" && language?.renderedText) {
    errors.push("no_surface_has_rendered_text");
  }

  if (language?.executionStatus !== "not_executed") {
    errors.push("language_execution_boundary_violation");
  }

  if ((language?.messageUnits?.length ?? 0) > Number(behavior?.messageOrActionCount ?? 0)) {
    errors.push("language_message_budget_exceeded");
  }

  const exactOutput = event.context?.expectedOutput;
  if (exactOutput !== undefined && language?.renderedText !== exactOutput) {
    warnings.push("expected_output_mismatch");
  }

  return {
    status: errors.length ? "reject" : "pass",
    errors,
    warnings
  };
}

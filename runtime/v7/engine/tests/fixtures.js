export function event(overrides = {}) {
  return {
    eventId: "event-001",
    timestamp: "2026-08-06T13:48:00+08:00",
    mode: "living",
    channel: "jine_private",
    actor: "partner",
    text: "很强",
    context: {
      scenario: "generic_stream_feedback",
      relationshipRole: "partner_and_producer"
    },
    seed: "test-seed",
    ...overrides,
    context: {
      scenario: "generic_stream_feedback",
      relationshipRole: "partner_and_producer",
      ...(overrides.context ?? {})
    }
  };
}

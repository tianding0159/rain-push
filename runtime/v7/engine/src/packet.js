import { PACKET_VERSION, SCHEMA_VERSION } from "./constants.js";
import { clamp, hashValue } from "./util.js";

export function createPacket(kind, event, data, options = {}) {
  const base = {
    kind,
    packetId: `${kind}_${hashValue({
      eventId: event.eventId,
      kind,
      seed: event.seed ?? "default",
      data
    }, 16)}`,
    runtimeVersion: PACKET_VERSION[kind],
    schemaVersion: SCHEMA_VERSION,
    eventId: event.eventId,
    generatedAt: event.timestamp,
    mode: event.mode,
    confidence: clamp(options.confidence ?? 0.8),
    data,
    updates: options.updates ?? [],
    trace: options.trace ?? {},
    validation: options.validation ?? {
      status: "pass",
      errors: [],
      warnings: []
    }
  };
  return Object.freeze({
    ...base,
    hash: hashValue(base, 32)
  });
}

export function validatePacketShape(packet, expectedKind) {
  const errors = [];
  if (!packet || typeof packet !== "object") errors.push("packet_not_object");
  if (packet?.kind !== expectedKind) errors.push("packet_kind_mismatch");
  if (!packet?.packetId) errors.push("missing_packet_id");
  if (!packet?.runtimeVersion) errors.push("missing_runtime_version");
  if (!packet?.eventId) errors.push("missing_event_id");
  if (!packet?.generatedAt) errors.push("missing_generated_at");
  if (!packet?.data || typeof packet.data !== "object") errors.push("missing_packet_data");
  if (!packet?.hash) errors.push("missing_packet_hash");
  return {
    status: errors.length ? "reject" : "pass",
    errors,
    warnings: []
  };
}

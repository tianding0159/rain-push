export const ENGINE_VERSION = "7.0.0-phase12";
export const SCHEMA_VERSION = 1;

export const RUNTIME_ORDER = Object.freeze([
  "knowledge",
  "continuity",
  "relationship",
  "meaning",
  "emotion",
  "need",
  "thought",
  "decision",
  "behavior",
  "expression",
  "language"
]);

export const PACKET_VERSION = Object.freeze({
  knowledge: "7.0-phase1",
  continuity: "7.0-phase2",
  relationship: "7.0-phase3",
  meaning: "7.0-phase4",
  emotion: "7.0-phase5",
  need: "7.0-phase6",
  thought: "7.0-phase7",
  decision: "7.0-phase8",
  behavior: "7.0-phase9",
  expression: "7.0-phase10",
  language: "7.0-phase11"
});

export const CHANNELS = Object.freeze([
  "jine_private",
  "live_stream",
  "public_post",
  "face_to_face",
  "physical_world",
  "internal_wait",
  "no_channel"
]);

export const MODES = Object.freeze(["canon", "living"]);

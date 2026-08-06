export type RuntimeKind =
  | "knowledge"
  | "continuity"
  | "relationship"
  | "meaning"
  | "emotion"
  | "need"
  | "thought"
  | "decision"
  | "behavior"
  | "expression"
  | "language";

export type Mode = "canon" | "living";
export type Channel =
  | "jine_private"
  | "live_stream"
  | "public_post"
  | "face_to_face"
  | "physical_world"
  | "internal_wait"
  | "no_channel";

export interface RuntimeEvent {
  eventId: string;
  timestamp: string;
  mode: Mode;
  channel: Channel;
  actor: "partner" | "character" | "audience" | "system";
  text?: string;
  signals?: string[];
  context?: Record<string, unknown>;
  seed?: string | number;
}

export interface RuntimePacket<T = Record<string, unknown>> {
  kind: RuntimeKind;
  packetId: string;
  runtimeVersion: string;
  schemaVersion: number;
  eventId: string;
  generatedAt: string;
  mode: Mode;
  confidence: number;
  data: T;
  updates: UpdateProposal[];
  trace: Record<string, unknown>;
  validation: {
    status: "pass" | "pass_with_revisions" | "reject";
    errors: string[];
    warnings: string[];
  };
  hash: string;
}

export interface UpdateProposal {
  runtime: RuntimeKind;
  path: string;
  operation: "increment" | "set" | "append_unique";
  delta?: number;
  value?: unknown;
  confidence: number;
  policy: "immediate" | "accumulate" | "confirm" | "canon_only";
  evidenceRefs: string[];
}

export interface PipelineResult {
  engineVersion: string;
  eventId: string;
  pipelineHash: string;
  packets: Record<RuntimeKind, RuntimePacket>;
  language: RuntimePacket;
  validation: {
    status: "pass" | "reject";
    errors: string[];
    warnings: string[];
  };
  stateRevision: number;
}

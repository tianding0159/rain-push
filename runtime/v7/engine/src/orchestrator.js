import { ENGINE_VERSION, RUNTIME_ORDER } from "./constants.js";
import { RuntimeBus } from "./runtime-bus.js";
import { runtimeEntries } from "./registry.js";
import { detectSignals } from "./signals.js";
import { commitUpdateQueues } from "./update-queue.js";
import { MemoryStateStore } from "./state/state.js";
import { NullLogger } from "./logging/logger.js";
import { ExecutionBoundary } from "./execution/execution-boundary.js";
import { validateEvent, validatePipeline } from "./validators.js";
import { hashValue } from "./util.js";

export class RuntimeOrchestrator {
  constructor(options = {}) {
    this.store = options.store ?? new MemoryStateStore();
    this.logger = options.logger ?? new NullLogger();
    this.bus = options.bus ?? new RuntimeBus();
    this.executionBoundary = options.executionBoundary ?? new ExecutionBoundary({ dryRun: true });
    this.strict = options.strict ?? true;
    this.commitUpdates = options.commitUpdates ?? true;
  }

  run(event) {
    const eventValidation = validateEvent(event);
    if (eventValidation.status === "reject") {
      const error = new Error(`Invalid runtime event: ${eventValidation.errors.join(", ")}`);
      error.code = "INVALID_RUNTIME_EVENT";
      error.details = eventValidation;
      throw error;
    }

    const state = this.store.load();
    const signals = detectSignals(event, state);
    const context = {
      event: {
        ...event,
        seed: event.seed ?? "default"
      },
      state,
      signals,
      packets: {}
    };

    this.bus.publish("pipeline:start", {
      eventId: event.eventId,
      engineVersion: ENGINE_VERSION,
      signals
    });
    this.logger.log({
      type: "pipeline_start",
      eventId: event.eventId,
      timestamp: event.timestamp,
      signals
    });

    for (const [kind, runtime] of runtimeEntries()) {
      const packet = runtime(context);
      context.packets[kind] = packet;
      this.bus.publish(`packet:${kind}`, packet);
      this.logger.log({
        type: "packet",
        eventId: event.eventId,
        kind,
        packetId: packet.packetId,
        hash: packet.hash,
        validation: packet.validation.status
      });
    }

    const validation = validatePipeline(context.packets, event);
    if (validation.status === "reject" && this.strict) {
      const error = new Error(`Pipeline validation failed: ${validation.errors.join(", ")}`);
      error.code = "PIPELINE_VALIDATION_FAILED";
      error.details = validation;
      throw error;
    }

    const allUpdates = RUNTIME_ORDER.flatMap((kind) => context.packets[kind].updates ?? []);
    const updateResult = this.commitUpdates
      ? commitUpdateQueues(state, allUpdates, event.mode)
      : { committed: [], rejected: allUpdates.map((update) => ({ update, errors: ["updates_disabled"] })) };

    state.revision = Number(state.revision ?? 0) + 1;
    state.lastPackets = Object.fromEntries(
      RUNTIME_ORDER.map((kind) => [kind, context.packets[kind].hash])
    );
    state.history.push({
      eventId: event.eventId,
      timestamp: event.timestamp,
      mode: event.mode,
      channel: event.channel,
      signals,
      scenario: context.packets.knowledge.data.scenario,
      language: context.packets.language.data.renderedText,
      renderStatus: context.packets.language.data.renderStatus,
      packetHashes: state.lastPackets,
      pendingThreads: context.packets.thought.data.questions ?? []
    });
    if (state.history.length > 500) state.history = state.history.slice(-500);
    this.store.save(state);

    const pipelineHash = hashValue({
      engineVersion: ENGINE_VERSION,
      eventId: event.eventId,
      packetHashes: RUNTIME_ORDER.map((kind) => context.packets[kind].hash)
    }, 40);

    const result = Object.freeze({
      engineVersion: ENGINE_VERSION,
      eventId: event.eventId,
      pipelineHash,
      packets: Object.freeze({ ...context.packets }),
      language: context.packets.language,
      validation,
      updates: updateResult,
      stateRevision: state.revision,
      executionStatus: "not_executed"
    });

    this.bus.publish("pipeline:complete", result);
    this.logger.log({
      type: "pipeline_complete",
      eventId: event.eventId,
      pipelineHash,
      validation: validation.status,
      stateRevision: state.revision,
      renderedText: context.packets.language.data.renderedText
    });

    return result;
  }

  async execute(request) {
    return this.executionBoundary.request(request);
  }
}

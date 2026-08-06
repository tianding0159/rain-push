import { RUNTIME_ORDER } from "./constants.js";
import { getPath, incrementPath, setPath, unique } from "./util.js";

const ALLOWED_OPERATIONS = new Set(["increment", "set", "append_unique"]);
const MAX_INCREMENT = 3;

export function validateUpdate(update, mode = "living") {
  const errors = [];
  if (!update || typeof update !== "object") errors.push("update_not_object");
  if (!RUNTIME_ORDER.includes(update?.runtime)) errors.push("unknown_runtime");
  if (!String(update?.path ?? "").match(/^(counters|patterns|memory)(\.|$)/)) {
    errors.push("forbidden_update_path");
  }
  if (!ALLOWED_OPERATIONS.has(update?.operation)) errors.push("forbidden_update_operation");
  if (!Array.isArray(update?.evidenceRefs) || !update.evidenceRefs.length) {
    errors.push("missing_update_evidence");
  }
  if (update?.policy === "canon_only" && mode !== "canon") errors.push("canon_update_in_living_mode");
  if (update?.operation === "increment" && Math.abs(Number(update?.delta ?? 0)) > MAX_INCREMENT) {
    errors.push("update_increment_cap_exceeded");
  }
  return { status: errors.length ? "reject" : "pass", errors };
}

export function commitUpdateQueues(state, updates, mode = "living") {
  const committed = [];
  const rejected = [];

  for (const update of updates) {
    const validation = validateUpdate(update, mode);
    if (validation.status === "reject") {
      rejected.push({ update, errors: validation.errors });
      continue;
    }

    const target = state.models[update.runtime];
    if (update.operation === "increment") {
      incrementPath(target, update.path, Number(update.delta ?? 1));
    } else if (update.operation === "set") {
      setPath(target, update.path, update.value);
    } else if (update.operation === "append_unique") {
      const current = getPath(target, update.path, []);
      const next = unique([...(Array.isArray(current) ? current : []), update.value]);
      setPath(target, update.path, next);
    }
    committed.push(update);
  }

  state.pendingUpdates = rejected.map((entry) => entry.update);
  return { committed, rejected };
}

export function scenarioCounterUpdate(runtime, scenario, eventId, confidence = 0.8) {
  return {
    runtime,
    path: `counters.${String(scenario || "default").replace(/[^a-zA-Z0-9_]/g, "_")}`,
    operation: "increment",
    delta: 1,
    confidence,
    policy: "immediate",
    evidenceRefs: [eventId]
  };
}

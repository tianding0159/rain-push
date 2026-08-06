import fs from "node:fs";
import path from "node:path";
import { ENGINE_VERSION, RUNTIME_ORDER } from "../constants.js";
import { deepClone } from "../util.js";

export function createInitialState() {
  return {
    engineVersion: ENGINE_VERSION,
    revision: 0,
    models: Object.fromEntries(
      RUNTIME_ORDER.map((runtime) => [runtime, {
        counters: {},
        patterns: {},
        memory: []
      }])
    ),
    history: [],
    pendingUpdates: [],
    lastPackets: {}
  };
}

export class MemoryStateStore {
  #state;

  constructor(initialState = createInitialState()) {
    this.#state = deepClone(initialState);
  }

  load() {
    return deepClone(this.#state);
  }

  save(state) {
    this.#state = deepClone(state);
    return this.load();
  }

  reset(state = createInitialState()) {
    this.#state = deepClone(state);
  }
}

export class JsonFileStateStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
  }

  load() {
    if (!fs.existsSync(this.filePath)) return createInitialState();
    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...createInitialState(),
      ...parsed,
      models: {
        ...createInitialState().models,
        ...(parsed.models ?? {})
      }
    };
  }

  save(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
    return this.load();
  }

  reset() {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
  }
}

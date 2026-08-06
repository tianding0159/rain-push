export class RuntimeBus {
  #listeners = new Map();
  #history = [];

  subscribe(topic, listener) {
    if (!this.#listeners.has(topic)) this.#listeners.set(topic, new Set());
    this.#listeners.get(topic).add(listener);
    return () => this.#listeners.get(topic)?.delete(listener);
  }

  publish(topic, payload) {
    const entry = Object.freeze({ topic, payload });
    this.#history.push(entry);
    for (const listener of this.#listeners.get(topic) ?? []) {
      listener(payload);
    }
    for (const listener of this.#listeners.get("*") ?? []) {
      listener(entry);
    }
  }

  getHistory() {
    return [...this.#history];
  }

  clear() {
    this.#history = [];
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RuntimeOrchestrator, MemoryStateStore } from "../src/index.js";

const fixtures = JSON.parse(
  fs.readFileSync(new URL("./scenario-fixtures.json", import.meta.url), "utf8")
);

for (const fixture of fixtures) {
  test(`${fixture.id} ${fixture.event.context.scenario}`, () => {
    const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
    const result = orchestrator.run(fixture.event);
    const expected = fixture.expected;

    assert.equal(result.validation.status, "pass");
    assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], expected.strategy);
    assert.equal(result.language.data.renderStatus, expected.renderStatus);
    if ("text" in expected) assert.equal(result.language.data.renderedText, expected.text);
    if ("action" in expected) assert.equal(result.packets.behavior.data.actionType, expected.action);
    if ("surface" in expected) assert.equal(result.packets.expression.data.primarySurface, expected.surface);
    assert.equal(result.language.data.executionStatus, "not_executed");
    assert.ok(result.language.data.messageUnits.length <= result.packets.behavior.data.messageOrActionCount);
  });
}

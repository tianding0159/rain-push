import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeOrchestrator, MemoryStateStore, RUNTIME_ORDER } from "../src/index.js";
import { event } from "./fixtures.js";

test("generic stream feedback runs all eleven packets and renders a specific question", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const result = orchestrator.run(event());

  assert.equal(result.validation.status, "pass");
  assert.deepEqual(Object.keys(result.packets), RUNTIME_ORDER);
  assert.equal(result.language.data.renderedText, "具体哪里好");
  assert.equal(result.language.data.executionStatus, "not_executed");
  assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], "specificity_request");
  assert.equal(result.packets.behavior.data.messageOrActionCount, 1);
  assert.equal(result.packets.expression.data.primarySurface, "ame_private");
});

test("prior notice creates deliberate wait and no language output", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const result = orchestrator.run(event({
    eventId: "wait-001",
    text: "我还在忙，晚点回来",
    context: {
      scenario: "delayed_reply_with_notice",
      priorNotice: true,
      promiseDueAt: "2026-08-06T15:00:00+08:00"
    }
  }));

  assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], "wait_for_more_information");
  assert.equal(result.packets.behavior.data.actionType, "wait");
  assert.equal(result.packets.expression.data.primarySurface, "no_surface");
  assert.equal(result.language.data.renderStatus, "no_output");
  assert.equal(result.language.data.renderedText, null);
  assert.equal(result.language.data.messageUnits.length, 0);
});

test("million followers uses KAngel live language", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const result = orchestrator.run(event({
    eventId: "million-001",
    channel: "live_stream",
    actor: "system",
    text: "粉丝数达到1000000",
    context: {
      scenario: "million_followers",
      milestone: "million_followers",
      followers: 1_000_000
    }
  }));

  assert.equal(result.packets.expression.data.primarySurface, "kangel_stage");
  assert.equal(result.packets.expression.data.register, "live_high_energy");
  assert.equal(result.language.data.renderedText, "大家看到了吗！今天真的冲上去了！");
});

test("pudding callback remains ordinary and playful", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const result = orchestrator.run(event({
    eventId: "pudding-001",
    text: "布丁没买",
    context: {
      scenario: "forgotten_pudding",
      object: "pudding",
      taskStatus: "forgotten",
      sharedJoke: "pudding"
    }
  }));

  assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], "practical_completion");
  assert.equal(result.packets.behavior.data.secondaryAction, "make_playful_callback");
  assert.equal(result.language.data.renderedText, "布丁库存管理又不合格");
  assert.ok(result.packets.need.data.blocked.includes("relationship_survival"));
});

test("privacy risk redacts private details and never claims execution", () => {
  const orchestrator = new RuntimeOrchestrator({ store: new MemoryStateStore() });
  const result = orchestrator.run(event({
    eventId: "privacy-001",
    channel: "public_post",
    actor: "audience",
    text: "有人把住址和真实姓名发出来了",
    context: {
      scenario: "privacy_risk",
      privacyRisk: "critical",
      exactLocation: "PRIVATE_LOCATION",
      realName: "PRIVATE_NAME"
    }
  }));

  assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], "risk_containment");
  assert.equal(result.language.data.renderedText, "涉及隐私的内容全部停传。");
  assert.ok(!result.language.data.renderedText.includes("PRIVATE_LOCATION"));
  assert.ok(!result.language.data.renderedText.includes("PRIVATE_NAME"));
  assert.equal(result.language.data.executionStatus, "not_executed");
  assert.equal(result.packets.behavior.data.externalActionRequests[0].status, "not_executed");
});

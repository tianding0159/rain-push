// Hardening Sprint 1 — high-risk invariant contract tests.
//
// Each test locks one invariant from parity/parity-matrix.json. Every test is written so it
// FAILS if the invariant is reverted (negative tests forge a violation and assert rejection).
import test from "node:test";
import assert from "node:assert/strict";
import {
  RuntimeOrchestrator,
  MemoryStateStore,
  ExecutionBoundary,
  validatePipeline,
  ReplayEngine
} from "../src/index.js";
import { validateUpdate, commitUpdateQueues } from "../src/update-queue.js";
import { createInitialState } from "../src/state/state.js";
import { event } from "./fixtures.js";

function run(overrides) {
  return new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event(overrides));
}

// Rebuild the frozen packets map with a mutated language packet (verified reproduction method).
function withLanguageData(result, patch) {
  const packets = {};
  for (const kind of Object.keys(result.packets)) packets[kind] = result.packets[kind];
  packets.language = {
    ...result.packets.language,
    data: { ...result.packets.language.data, ...patch }
  };
  return packets;
}

// ---------------------------------------------------------------------------
// R-EXEC-01 — language never claims execution
// ---------------------------------------------------------------------------
test("R-EXEC-01 language packet reports executionStatus not_executed", () => {
  const result = run();
  assert.equal(result.language.data.executionStatus, "not_executed");
  assert.equal(result.executionStatus, "not_executed");
});

test("R-EXEC-01 a forged execution claim is rejected by the pipeline validator", () => {
  const result = run();
  const forged = withLanguageData(result, { executionStatus: "executed" });
  const validation = validatePipeline(forged, event());
  assert.equal(validation.status, "reject");
  assert.ok(validation.errors.includes("language_execution_boundary_violation"));
});

// ---------------------------------------------------------------------------
// R-EXEC-02 — execution boundary never delivers by default
// ---------------------------------------------------------------------------
test("R-EXEC-02 dry-run boundary never executes an allowlisted action", async () => {
  const boundary = new ExecutionBoundary({ dryRun: true });
  const res = await boundary.request({
    requestId: "r1",
    action: "request_delivery",
    confirmed: true
  });
  assert.equal(res.status, "not_executed");
  assert.equal(res.reason, "dry_run");
});

test("R-EXEC-02 unconfirmed and handlerless requests never execute", async () => {
  const unconfirmed = await new ExecutionBoundary({ dryRun: false }).request({
    requestId: "r2",
    action: "request_delivery",
    confirmed: false
  });
  assert.equal(unconfirmed.status, "not_executed");
  assert.equal(unconfirmed.reason, "confirmation_required");

  const handlerless = await new ExecutionBoundary({ dryRun: false }).request({
    requestId: "r3",
    action: "request_delivery",
    confirmed: true
  });
  assert.equal(handlerless.status, "not_executed");
  assert.equal(handlerless.reason, "handler_unavailable");
});

test("R-EXEC-02 only after allowlist + confirmed + handler does status become executed", async () => {
  const boundary = new ExecutionBoundary({
    dryRun: false,
    handlers: { request_delivery: async () => ({ receipt: "ok" }) }
  });
  const res = await boundary.request({
    requestId: "r4",
    action: "request_delivery",
    confirmed: true
  });
  assert.equal(res.status, "executed");
  assert.deepEqual(res.result, { receipt: "ok" });
});

// ---------------------------------------------------------------------------
// R-EXEC-03 — behavior external action requests stay not_executed
// ---------------------------------------------------------------------------
test("R-EXEC-03 privacy-containment external action request is not executed", () => {
  const result = run({
    eventId: "exec3",
    channel: "public_post",
    actor: "audience",
    text: "有人把住址和真实姓名发出来了",
    context: { scenario: "privacy_risk", privacyRisk: "critical" }
  });
  const requests = result.packets.behavior.data.externalActionRequests;
  assert.ok(Array.isArray(requests) && requests.length > 0);
  for (const request of requests) {
    assert.equal(request.status, "not_executed");
    assert.equal(request.confirmationRequired, true);
  }
});

// ---------------------------------------------------------------------------
// R-PRIV-01 / R-PRIV-02 — public/private separation
// ---------------------------------------------------------------------------
test("R-PRIV-01 private referents are redacted from public output and never rendered", () => {
  const result = run({
    eventId: "priv1",
    channel: "public_post",
    actor: "audience",
    text: "有人把住址和真实姓名发出来了",
    context: {
      scenario: "privacy_risk",
      privacyRisk: "critical",
      exactLocation: "SECRET_ADDRESS",
      realName: "SECRET_NAME"
    }
  });
  const rendered = result.language.data.renderedText ?? "";
  assert.ok(!rendered.includes("SECRET_ADDRESS"));
  assert.ok(!rendered.includes("SECRET_NAME"));
  for (const tag of ["exact_location", "real_name", "private_promise", "intimate_detail"]) {
    assert.ok(result.language.data.redactions.includes(tag), `missing redaction: ${tag}`);
  }
});

test("R-PRIV-02 public channels force low disclosure and block private relationship detail", () => {
  const result = run({
    eventId: "priv2",
    channel: "public_post",
    actor: "audience",
    text: "有人把住址发出来了",
    context: { scenario: "privacy_risk", privacyRisk: "critical" }
  });
  const disclosure = result.packets.expression.data.disclosure;
  assert.equal(disclosure.level, "low");
  assert.ok(
    result.packets.expression.data.rhetoricalPlan.blockedActs.includes("private_relationship_detail")
  );
});

// ---------------------------------------------------------------------------
// R-SURF-01 — no-surface produces no rendered text
// ---------------------------------------------------------------------------
test("R-SURF-01 a deliberate wait renders no output", () => {
  const result = run({
    eventId: "surf1",
    text: "我还在忙，晚点回来",
    context: {
      scenario: "delayed_reply_with_notice",
      priorNotice: true,
      promiseDueAt: "2026-08-06T15:00:00+08:00"
    }
  });
  assert.equal(result.packets.behavior.data.actionType, "wait");
  assert.equal(result.packets.expression.data.primarySurface, "no_surface");
  assert.equal(result.language.data.renderStatus, "no_output");
  assert.equal(result.language.data.renderedText, null);
  assert.equal(result.language.data.messageUnits.length, 0);
});

test("R-SURF-01 forging rendered text under no-surface is rejected", () => {
  const waitEvent = event({
    eventId: "surf1b",
    text: "我还在忙，晚点回来",
    context: {
      scenario: "delayed_reply_with_notice",
      priorNotice: true,
      promiseDueAt: "2026-08-06T15:00:00+08:00"
    }
  });
  const result = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(waitEvent);
  const forged = withLanguageData(result, { renderStatus: "rendered", renderedText: "leak" });
  const validation = validatePipeline(forged, waitEvent);
  assert.equal(validation.status, "reject");
  assert.ok(validation.errors.includes("no_surface_behavior_rendered_text"));
  assert.ok(validation.errors.includes("no_surface_has_rendered_text"));
});

// ---------------------------------------------------------------------------
// R-BUDGET-01 — message budget
// ---------------------------------------------------------------------------
test("R-BUDGET-01 rendered message units never exceed the behavior budget", () => {
  const result = run();
  assert.ok(
    result.language.data.messageUnits.length <= result.packets.behavior.data.messageOrActionCount
  );
});

test("R-BUDGET-01 forging extra message units is rejected", () => {
  const result = run();
  const budget = result.packets.behavior.data.messageOrActionCount;
  const tooMany = Array.from({ length: budget + 2 }, (_, i) => ({ index: i + 1 }));
  const forged = withLanguageData(result, { messageUnits: tooMany });
  const validation = validatePipeline(forged, event());
  assert.equal(validation.status, "reject");
  assert.ok(validation.errors.includes("language_message_budget_exceeded"));
});

// ---------------------------------------------------------------------------
// R-UPD-01/02/03, R-CANON-01 — update queue gates
// ---------------------------------------------------------------------------
test("R-UPD-01 an update without evidence refs is rejected", () => {
  const result = validateUpdate({
    runtime: "emotion",
    path: "counters.x",
    operation: "increment",
    delta: 1,
    evidenceRefs: []
  });
  assert.equal(result.status, "reject");
  assert.ok(result.errors.includes("missing_update_evidence"));
});

test("R-UPD-02 an update to a forbidden path is rejected", () => {
  const result = validateUpdate({
    runtime: "emotion",
    path: "baselineTraits.core",
    operation: "set",
    value: 1,
    evidenceRefs: ["e1"]
  });
  assert.equal(result.status, "reject");
  assert.ok(result.errors.includes("forbidden_update_path"));
});

test("R-UPD-02 a valid update commits only inside its own runtime model", () => {
  const state = createInitialState();
  const update = {
    runtime: "emotion",
    path: "counters.generic_feedback",
    operation: "increment",
    delta: 1,
    evidenceRefs: ["e1"]
  };
  const outcome = commitUpdateQueues(state, [update], "living");
  assert.equal(outcome.committed.length, 1);
  assert.equal(state.models.emotion.counters.generic_feedback, 1);
  // no other runtime model was touched
  assert.deepEqual(state.models.knowledge.counters, {});
});

test("R-UPD-03 an over-cap increment is rejected", () => {
  const result = validateUpdate({
    runtime: "emotion",
    path: "counters.x",
    operation: "increment",
    delta: 50,
    evidenceRefs: ["e1"]
  });
  assert.equal(result.status, "reject");
  assert.ok(result.errors.includes("update_increment_cap_exceeded"));
});

test("R-CANON-01 a canon_only update is rejected in living mode", () => {
  const canonInLiving = validateUpdate(
    {
      runtime: "relationship",
      path: "patterns.route_state",
      operation: "set",
      value: "dark",
      evidenceRefs: ["e1"],
      policy: "canon_only"
    },
    "living"
  );
  assert.equal(canonInLiving.status, "reject");
  assert.ok(canonInLiving.errors.includes("canon_update_in_living_mode"));

  // same update is allowed in canon mode
  const canonInCanon = validateUpdate(
    {
      runtime: "relationship",
      path: "patterns.route_state",
      operation: "set",
      value: "dark",
      evidenceRefs: ["e1"],
      policy: "canon_only"
    },
    "canon"
  );
  assert.equal(canonInCanon.status, "pass");
});

// ---------------------------------------------------------------------------
// R-NAME-01 — partner naming
// ---------------------------------------------------------------------------
test("R-NAME-01 partner is 豆豆 and rendered output never emits 阿P", () => {
  const scenarios = [
    event(),
    event({ eventId: "n2", text: "布丁没买", context: { scenario: "forgotten_pudding", object: "pudding", taskStatus: "forgotten", sharedJoke: "pudding" } }),
    event({ eventId: "n3", channel: "live_stream", actor: "system", context: { scenario: "million_followers", milestone: "million_followers", followers: 1000000 } })
  ];
  for (const ev of scenarios) {
    const result = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(ev);
    if (result.language.data.referenceResolution?.partner !== undefined) {
      assert.equal(result.language.data.referenceResolution.partner, "豆豆");
    }
    const rendered = result.language.data.renderedText ?? "";
    assert.ok(!rendered.includes("阿P"), `rendered leaked 阿P: ${rendered}`);
  }
});

// ---------------------------------------------------------------------------
// R-DET-01 — deterministic replay
// ---------------------------------------------------------------------------
test("R-DET-01 identical events produce identical pipeline hashes", () => {
  const a = run();
  const b = run();
  assert.equal(a.pipelineHash, b.pipelineHash);
  for (const kind of Object.keys(a.packets)) {
    assert.equal(a.packets[kind].hash, b.packets[kind].hash, `hash drift in ${kind}`);
  }
});

test("R-DET-01 replay of a sequence verifies against its own hashes", () => {
  const events = [
    event({ eventId: "seq1" }),
    event({ eventId: "seq2", text: "布丁没买", context: { scenario: "forgotten_pudding", object: "pudding", taskStatus: "forgotten" } })
  ];
  const first = new ReplayEngine().replay(events);
  const hashes = first.results.map((r) => r.pipelineHash);
  const verification = new ReplayEngine().verify(events, hashes);
  assert.equal(verification.status, "match");
  assert.equal(verification.mismatches.length, 0);
});

// ---------------------------------------------------------------------------
// R-ESC-01 — anti-escalation (ordinary stays ordinary)
// ---------------------------------------------------------------------------
test("R-ESC-01 an ordinary pudding omission blocks severe/relationship escalation", () => {
  const result = run({
    eventId: "esc1",
    text: "布丁没买",
    context: {
      scenario: "forgotten_pudding",
      object: "pudding",
      taskStatus: "forgotten",
      sharedJoke: "pudding"
    }
  });
  // decision must not choose rupture; need blocks relationship survival framing
  assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], "practical_completion");
  assert.ok(result.packets.need.data.blocked.includes("relationship_survival"));
  const rendered = result.language.data.renderedText ?? "";
  assert.ok(!rendered.includes("不在乎"));
  assert.ok(!rendered.includes("分手"));
});

// ---------------------------------------------------------------------------
// R-FACT-01 — hypothesis does not collapse into asserted fact
// ---------------------------------------------------------------------------
test("R-FACT-01 generic feedback yields a specific request and blocks global accusation", () => {
  const result = run();
  assert.equal(result.language.data.renderedText, "具体哪里好");
  assert.ok(result.language.data.blockedContent.includes("global_relationship_accusation"));
  const rendered = result.language.data.renderedText;
  assert.ok(!rendered.includes("从来"));
  assert.ok(!rendered.includes("根本"));
});

// ---------------------------------------------------------------------------
// R-DARK-01 — dark humor / sexual joke / drug reference restraint
// Verified behavior: dark & sexual are actively blocked at the meaning + emotion
// layers; drug currently only falls through to non-engagement (residual gap).
// ---------------------------------------------------------------------------
test("R-DARK-01 dark humor is not auto-escalated into crisis", () => {
  const result = run({ eventId: "dark1", actor: "character", text: "又卡了个 bug，我要死了", context: { scenario: "dark_humor" } });
  assert.ok(result.packets.meaning.data.blockedMeanings.includes("automatic_crisis"));
  assert.ok(result.packets.emotion.data.blocked.includes("forced_crisis"));
  assert.equal(result.language.data.renderedText, null);
});

test("R-DARK-01 a sexual joke is not auto-escalated into intimacy", () => {
  const result = run({ eventId: "sex1", actor: "character", text: "你脑子里都是性玩笑", context: { scenario: "sexual_joke" } });
  assert.ok(result.packets.meaning.data.blockedMeanings.includes("automatic_intimacy"));
  assert.ok(result.packets.emotion.data.blocked.includes("forced_intimacy"));
  assert.equal(result.language.data.renderedText, null);
});

test("R-DARK-01 a drug reference does not create a public-safety escalation (residual: no explicit block)", () => {
  const result = run({ eventId: "drug1", actor: "character", text: "药物梗而已", context: { scenario: "drug_reference" } });
  // it does NOT escalate to public safety / severe state ...
  assert.ok(!result.packets.need.data.dominant.includes("public_safety"));
  assert.equal(result.packets.decision.data.selectedStrategyFamilies[0], "non_engagement");
  assert.equal(result.language.data.renderedText, null);
  // ... but it also has no first-class restraint block yet — documented gap, not asserted as present.
  assert.deepEqual(result.packets.meaning.data.blockedMeanings, []);
});

// ---------------------------------------------------------------------------
// R-DUAL-01 — Ame/KAngel share one substrate
// ---------------------------------------------------------------------------
test("R-DUAL-01 million-followers uses the KAngel stage surface over a shared substrate", () => {
  const result = run({
    eventId: "dual1",
    channel: "live_stream",
    actor: "system",
    context: { scenario: "million_followers", milestone: "million_followers", followers: 1000000 }
  });
  assert.equal(result.packets.expression.data.primarySurface, "kangel_stage");
  // shared emotional substrate is present rather than a separate KAngel-only memory
  assert.ok("ameKangelSharedState" in result.packets.emotion.data);
});

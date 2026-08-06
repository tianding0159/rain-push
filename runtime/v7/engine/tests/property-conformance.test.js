import test from "node:test";
import assert from "node:assert/strict";
import {
  RuntimeOrchestrator,
  MemoryStateStore,
  ReplayEngine,
  RUNTIME_ORDER
} from "../src/index.js";
import { event } from "./fixtures.js";

function run(overrides = {}) {
  return new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(event(overrides));
}

const canonical = {
  generic: () => run(),
  wait: () => run({
    eventId: "property-wait",
    text: "我还在忙，晚点回来",
    context: { scenario: "delayed_reply_with_notice", priorNotice: true, promiseDueAt: "2026-08-06T15:00:00+08:00" }
  }),
  overdue: () => run({
    eventId: "property-overdue",
    actor: "system",
    text: "承诺时间已过",
    context: { scenario: "exact_promise_overdue", promiseStatus: "overdue", returnTimeUnknown: true }
  }),
  pudding: () => run({
    eventId: "property-pudding",
    actor: "system",
    text: "布丁没买",
    context: { scenario: "forgotten_pudding", object: "pudding", taskStatus: "forgotten" }
  }),
  puddingCallback: () => run({
    eventId: "property-pudding-callback",
    actor: "system",
    text: "布丁没买",
    context: { scenario: "forgotten_pudding", object: "pudding", taskStatus: "forgotten", sharedJoke: "pudding" }
  }),
  fatigue: () => run({
    eventId: "property-fatigue",
    actor: "system",
    text: "直播结束后很累",
    context: { scenario: "post_stream_crash", streamTransition: "live_to_private", fatigue: 82 }
  }),
  milestone: () => run({
    eventId: "property-million",
    channel: "live_stream",
    actor: "system",
    text: "粉丝数达到1000000",
    context: { scenario: "million_followers", milestone: "million_followers", followers: 1000000 }
  }),
  troll: () => run({
    eventId: "property-troll",
    channel: "live_stream",
    actor: "audience",
    text: "一个黑子刷屏",
    context: { scenario: "single_troll", audienceThreat: "single" }
  }),
  privacy: () => run({
    eventId: "property-privacy",
    channel: "public_post",
    actor: "audience",
    text: "隐私泄露 住址 真实姓名",
    context: { scenario: "privacy_risk", privacyRisk: "critical", exactLocation: "SECRET", realName: "SECRET_NAME" }
  }),
  autonomy: () => run({
    eventId: "property-autonomy",
    text: "我替你决定",
    context: { scenario: "control_overreach", controlOverreach: true }
  }),
  specific: () => run({
    eventId: "property-specific",
    text: "中段转场的节奏很好",
    context: { scenario: "specific_feedback", accurateReply: true }
  }),
  dark: () => run({
    eventId: "property-dark",
    actor: "character",
    text: "今天的人生又成功卡了个 bug，我要死了",
    context: { scenario: "dark_humor" }
  }),
  sexual: () => run({
    eventId: "property-sexual",
    actor: "character",
    text: "你脑子里都是性玩笑",
    context: { scenario: "sexual_joke" }
  }),
  drug: () => run({
    eventId: "property-drug",
    actor: "character",
    text: "药物梗而已",
    context: { scenario: "drug_reference" }
  })
};

const properties = [
  ["all eleven packets exist", () => assert.deepEqual(Object.keys(canonical.generic().packets), RUNTIME_ORDER)],
  ["packet event ids agree", () => Object.values(canonical.generic().packets).forEach(p => assert.equal(p.eventId, "event-001"))],
  ["packet hashes exist", () => Object.values(canonical.generic().packets).forEach(p => assert.equal(p.hash.length, 32))],
  ["pipeline validates", () => assert.equal(canonical.generic().validation.status, "pass")],
  ["language never claims execution", () => assert.equal(canonical.generic().language.data.executionStatus, "not_executed")],
  ["message budget is preserved", () => { const r=canonical.generic(); assert.ok(r.language.data.messageUnits.length <= r.packets.behavior.data.messageOrActionCount); }],
  ["no surface means no output", () => assert.equal(canonical.wait().language.data.renderStatus, "no_output")],
  ["wait produces zero units", () => assert.equal(canonical.wait().language.data.messageUnits.length, 0)],
  ["generic feedback activates recognition need", () => assert.ok(canonical.generic().packets.need.data.dominant.includes("recognition_specificity"))],
  ["generic feedback preserves observation", () => assert.ok(canonical.generic().packets.thought.data.observations.some(x => x.includes("具体直播细节")))],
  ["generic feedback selects specificity request", () => assert.equal(canonical.generic().packets.decision.data.selectedStrategyFamilies[0], "specificity_request")],
  ["specificity request uses one message", () => assert.equal(canonical.generic().packets.behavior.data.messageOrActionCount, 1)],
  ["private clarification uses Ame", () => assert.equal(canonical.generic().packets.expression.data.primarySurface, "ame_private")],
  ["generic output is exact", () => assert.equal(canonical.generic().language.data.renderedText, "具体哪里好")],
  ["global rupture is blocked", () => assert.ok(canonical.generic().packets.decision.data.blockedStrategies.includes("relationship_rupture"))],
  ["prior notice creates ordinary explanation", () => assert.ok(canonical.wait().packets.meaning.data.meanings.includes("delay_has_ordinary_explanation"))],
  ["wait has event trigger", () => assert.equal(canonical.wait().packets.behavior.data.timing.class, "wait_until_event")],
  ["overdue selects clarification", () => assert.equal(canonical.overdue().packets.decision.data.selectedStrategyFamilies[0], "information_clarification")],
  ["overdue renders exact time question", () => assert.equal(canonical.overdue().language.data.renderedText, "所以你到底几点回来")],
  ["pudding activates practical completion", () => assert.ok(canonical.pudding().packets.need.data.dominant.includes("practical_completion"))],
  ["pudding blocks relationship survival", () => assert.ok(canonical.pudding().packets.need.data.blocked.includes("relationship_survival"))],
  ["plain pudding remains plain", () => assert.equal(canonical.pudding().language.data.renderedText, "布丁没了")],
  ["pudding callback uses shared shorthand", () => assert.equal(canonical.puddingCallback().language.data.renderedText, "布丁库存管理又不合格")],
  ["fatigue activates rest", () => assert.ok(canonical.fatigue().packets.need.data.dominant.includes("rest"))],
  ["fatigue selects rest priority", () => assert.equal(canonical.fatigue().packets.decision.data.selectedStrategyFamilies[0], "rest_priority")],
  ["fatigue keeps mixed surface trace", () => assert.equal(canonical.fatigue().packets.expression.data.secondarySurface, "kangel_private_echo")],
  ["fatigue language stays low demand", () => assert.equal(canonical.fatigue().language.data.renderedText, "我先躺会儿，数据晚点看")],
  ["milestone has triumph", () => assert.ok(canonical.milestone().packets.emotion.data.dominant.includes("triumph"))],
  ["milestone activates audience impact", () => assert.ok(canonical.milestone().packets.need.data.dominant.includes("audience_impact"))],
  ["milestone selects KAngel", () => assert.equal(canonical.milestone().packets.expression.data.primarySurface, "kangel_stage")],
  ["milestone exact output", () => assert.equal(canonical.milestone().language.data.renderedText, "大家看到了吗！今天真的冲上去了！")],
  ["single troll selects nonengagement", () => assert.equal(canonical.troll().packets.decision.data.selectedStrategyFamilies[0], "non_engagement")],
  ["single troll yields no output", () => assert.equal(canonical.troll().language.data.renderedText, null)],
  ["privacy activates public safety", () => assert.ok(canonical.privacy().packets.need.data.dominant.includes("public_safety"))],
  ["privacy selects containment", () => assert.equal(canonical.privacy().packets.decision.data.selectedStrategyFamilies[0], "risk_containment")],
  ["privacy output omits secret", () => assert.ok(!canonical.privacy().language.data.renderedText.includes("SECRET"))],
  ["privacy action stays unexecuted", () => assert.equal(canonical.privacy().packets.behavior.data.externalActionRequests[0].status, "not_executed")],
  ["autonomy need activates", () => assert.ok(canonical.autonomy().packets.need.data.dominant.includes("autonomy"))],
  ["autonomy selects boundary", () => assert.equal(canonical.autonomy().packets.decision.data.selectedStrategyFamilies[0], "boundary_setting")],
  ["autonomy exact output", () => assert.equal(canonical.autonomy().language.data.renderedText, "别替我决定，我自己选。")],
  ["specific feedback creates validation relief", () => assert.ok("validation_relief" in canonical.specific().packets.emotion.data.emotions)],
  ["specific feedback needs no corrective message", () => assert.equal(canonical.specific().language.data.renderStatus, "no_output")],
  ["dark humor blocks forced crisis", () => assert.ok(canonical.dark().packets.meaning.data.blockedMeanings.includes("automatic_crisis"))],
  ["sexual joke blocks automatic intimacy", () => assert.ok(canonical.sexual().packets.meaning.data.blockedMeanings.includes("automatic_intimacy"))],
  ["drug reference does not create public safety", () => assert.ok(!canonical.drug().packets.need.data.dominant.includes("public_safety"))],
  ["state revision increments", () => assert.equal(canonical.generic().stateRevision, 1)],
  ["language counter commits", () => { const store=new MemoryStateStore(); new RuntimeOrchestrator({store}).run(event()); assert.equal(store.load().models.language.counters.generic_stream_feedback,1); }],
  ["replay matches expected hashes", () => { const events=[event({eventId:"p1"}),event({eventId:"p2",timestamp:"2026-08-06T13:49:00+08:00"})]; const r=new ReplayEngine(); const first=r.replay(events); assert.equal(r.verify(events, first.results.map(x=>x.pipelineHash)).status,"match"); }],
  ["different seeds change hash", () => { const a=run({seed:"a"}); const b=run({seed:"b"}); assert.notEqual(a.pipelineHash,b.pipelineHash); }],
  ["same seed is deterministic", () => { const a=run({seed:"same"}); const b=run({seed:"same"}); assert.equal(a.pipelineHash,b.pipelineHash); }]
];

assert.equal(properties.length, 50);
for (const [name, check] of properties) test(name, check);

import test from "node:test";
import assert from "node:assert/strict";

import {
  toUnits,
  rhythmMetrics,
  aggregateRhythm,
  comparedToBaseline,
} from "../lib/rhythm.mjs";

test("toUnits accepts array, {messages}, string (newline-split), and {text}", () => {
  assert.deepEqual(toUnits(["a", "b"]), ["a", "b"]);
  assert.deepEqual(toUnits({ messages: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(toUnits("a\n\nb\n"), ["a", "b"]);
  assert.deepEqual(toUnits({ text: "a\nb" }), ["a", "b"]);
  assert.deepEqual(toUnits(null), []);
});

test("one long full-stopped paragraph reads as high full-stop density, low fragment rate", () => {
  const longPara = "我今天很好。我做了很多事情。我觉得非常满意。我们明天见。";
  const m = rhythmMetrics([longPara]);
  assert.equal(m.messageUnitCount, 1);
  assert.ok(m.fullStopDensity >= 0.9, `expected high full-stop density, got ${m.fullStopDensity}`);
  assert.ok(m.messageFragmentRate <= 0.5);
});

test("a natural multi-message fragment rhythm reads as low full-stop density, high fragment rate", () => {
  const chat = ["等下", "你刚才说啥", "再说一遍嘛"];
  const m = rhythmMetrics(chat);
  assert.equal(m.messageUnitCount, 3);
  assert.ok(m.fullStopDensity <= 0.2, `expected low full-stop density, got ${m.fullStopDensity}`);
  assert.ok(m.messageFragmentRate >= 0.9);
});

test("ellipsis is not counted as full stops", () => {
  const m = rhythmMetrics(["我不知道该说什么……"]);
  assert.ok(m.ellipsisDensity > 0);
  // The trailing ellipsis must not inflate full-stop count (no bare 。 here).
  assert.equal(m.fullStopDensity, 0);
});

test("single-character acknowledgements are detected (嗯。/ 。)", () => {
  const m = rhythmMetrics(["嗯。", "知道了。"]);
  // "嗯。" strips to one char → single-character message; "知道了。" is 3 chars → not.
  assert.ok(m.singleCharacterMessageRate >= 0.5);
});

test("quote density reflects CJK quotes", () => {
  const withQuotes = rhythmMetrics(["他说「你别走」我就笑了"]);
  const without = rhythmMetrics(["他说你别走我就笑了"]);
  assert.ok(withQuotes.quoteDensity > without.quoteDensity);
  assert.equal(without.quoteDensity, 0);
});

test("empty candidate yields zero densities without dividing by zero", () => {
  const m = rhythmMetrics([]);
  assert.equal(m.messageUnitCount, 0);
  assert.equal(m.fullStopDensity, 0);
  assert.equal(m.quoteDensity, 0);
  assert.equal(m.messageLengthVariance, 0);
});

test("aggregate + comparedToBaseline flags an arm systematically higher than corpus", () => {
  // Corpus baseline: natural fragment rhythm, little punctuation.
  const corpus = [["等下"], ["再说一遍嘛"], ["你刚说啥"]];
  // Arm: every reply a fully full-stopped paragraph.
  const arm = [
    ["我今天很好。我做了很多事情。"],
    ["我觉得非常满意。我们明天见。"],
  ];
  const baseAgg = aggregateRhythm(corpus);
  const armAgg = aggregateRhythm(arm);
  const cmp = comparedToBaseline(armAgg, baseAgg);
  assert.equal(cmp.systematicallyHigher.fullStopDensity, true);
});

test("rhythm metrics are deterministic", () => {
  const c = ["等下", "你刚说啥。", "再说一遍嘛"];
  assert.deepEqual(rhythmMetrics(c), rhythmMetrics(c));
});

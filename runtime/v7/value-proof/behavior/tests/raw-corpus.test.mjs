import test from "node:test";
import assert from "node:assert/strict";
import { resolveRawPath, parseLine, punctShape, redactedRecord, sha256, RAW_STATUS, loadRawCorpus } from "../lib/raw-corpus.mjs";

test("resolveRawPath: explicit path wins and is reported as the origin", () => {
  const r = resolveRawPath({ path: "/abs/corpus.txt", env: {} });
  assert.equal(r.path, "/abs/corpus.txt");
  assert.equal(r.origin, "argument");
});

test("resolveRawPath: env var is honored when no explicit path", () => {
  const r = resolveRawPath({ env: { RAIN_PUSH_SINGLE_SIDED_CORPUS: "/abs/env.txt" } });
  assert.equal(r.path, "/abs/env.txt");
  assert.equal(r.origin, "env:RAIN_PUSH_SINGLE_SIDED_CORPUS");
});

test("parseLine: extracts order, speaker, text from 'N. 糖糖:「...」'", () => {
  const rec = parseLine("42. 糖糖:「你在吗」", 1);
  assert.equal(rec.order, 42);
  assert.equal(rec.speaker, "糖糖");
  assert.equal(rec.text, "你在吗");
  // hash binds speaker + text via the private separator, not text alone.
  assert.equal(rec.hash, sha256("糖糖\u241f你在吗"));
});

test("parseLine: a line without a numeric prefix does not match and returns null", () => {
  const rec = parseLine("糖糖:「嗯」", 7);
  assert.equal(rec, null, "LINE_RE requires an ordinal prefix");
});

test("punctShape: is a text-free structural fingerprint (object of counts, no CJK)", () => {
  const shape = punctShape("你好…真的吗？~");
  assert.equal(typeof shape, "object");
  assert.equal(shape.ellipsis, 1); // single '…' counts once
  assert.equal(shape.ques, 1);
  assert.equal(shape.hasTilde, true);
  // No CJK leaks in the serialized shape.
  assert.match(JSON.stringify(shape), /^[^\u4e00-\u9fff]*$/, "shape must contain no CJK characters");
});

test("redactedRecord: exposes only order/speaker/hash/punct — never text", () => {
  const rec = parseLine("1. 糖糖:「秘密内容」", 1);
  const red = redactedRecord(rec);
  assert.deepEqual(Object.keys(red).sort(), ["hash", "order", "punct", "speaker"]);
  assert.ok(!("text" in red), "redacted record must not carry text");
  assert.ok(!JSON.stringify(red).includes("秘密内容"), "verbatim text must not appear");
});

test("loadRawCorpus: with no path/env/default resolvable, status is BLOCKED and records empty", () => {
  // env:{} suppresses the env var; the real default file may exist in this workspace, so we can't
  // assert BLOCKED unconditionally. We instead assert the contract shape via resolveRawPath=null.
  const resolved = resolveRawPath({ env: { RAIN_PUSH_SINGLE_SIDED_CORPUS: "" } });
  if (resolved === null) {
    const loaded = loadRawCorpus({ env: { RAIN_PUSH_SINGLE_SIDED_CORPUS: "" } });
    assert.equal(loaded.present, false);
    assert.equal(loaded.status, RAW_STATUS.BLOCKED);
    assert.deepEqual(loaded.records, []);
  } else {
    // Default corpus present in this workspace → loads cleanly, single speaker, text redactable.
    const loaded = loadRawCorpus({ env: { RAIN_PUSH_SINGLE_SIDED_CORPUS: "" } });
    assert.equal(loaded.present, true);
    assert.equal(loaded.status, RAW_STATUS.LOADED);
  }
});

test("loadRawCorpus: a present-but-unreadable explicit path throws (a real error, not BLOCKED)", () => {
  assert.throws(() => loadRawCorpus({ path: "/nonexistent/does-not-exist.txt", env: {} }));
});

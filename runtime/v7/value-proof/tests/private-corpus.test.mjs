import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPrivateCorpus,
  resolvePrivateEventsPath,
  redactedView,
  CORPUS_STATUS,
} from "../lib/private-corpus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Reuse the committed SYNTHETIC corpus events as a stand-in for a private corpus. This is the
// smoke path: no real private text exists in the workspace.
const SYN_EVENTS = join(HERE, "..", "..", "corpus", "fixtures", "events.valid.json");

test("with no path / env / default, the corpus is absent and status is READY_FOR_PRIVATE_CORPUS", () => {
  const loaded = loadPrivateCorpus({ env: {} });
  assert.equal(loaded.present, false);
  assert.equal(loaded.status, CORPUS_STATUS.READY);
  assert.deepEqual(loaded.events, []);
});

test("env var resolution is reported as the origin", () => {
  const r = resolvePrivateEventsPath({ env: { RAIN_PUSH_PRIVATE_CORPUS: "/abs/events.private.json" } });
  assert.equal(r.origin, "env:RAIN_PUSH_PRIVATE_CORPUS");
  assert.equal(r.path, "/abs/events.private.json");
});

test("explicit path loads + validates synthetic events against the reused corpus schema", () => {
  const loaded = loadPrivateCorpus({ path: SYN_EVENTS, env: {} });
  assert.equal(loaded.present, true);
  assert.equal(loaded.status, CORPUS_STATUS.LOADED);
  assert.equal(loaded.origin, "argument");
  assert.ok(loaded.events.length >= 3);
  assert.deepEqual(loaded.problems, [], `unexpected problems: ${JSON.stringify(loaded.problems)}`);
});

test("redactedView carries NO verbatim text — only ids, roles, lengths, hashes", () => {
  const loaded = loadPrivateCorpus({ path: SYN_EVENTS, env: {} });
  const view = redactedView(loaded);
  const serialized = JSON.stringify(view);
  // Pull every verbatim string from the raw events and assert none appears in the view.
  for (const ev of loaded.events) {
    for (const m of ev.messages || []) {
      assert.ok(!serialized.includes(m.text), `verbatim leaked into redactedView: ${m.text}`);
    }
  }
  // But the structural signal is preserved.
  assert.equal(view.eventCount, loaded.events.length);
  assert.ok(view.events[0].messages[0].sha256.match(/^[0-9a-f]{64}$/));
  assert.ok(typeof view.events[0].messages[0].lengthChars === "number");
});

test("redactedView is deterministic (same input → identical bytes)", () => {
  const a = redactedView(loadPrivateCorpus({ path: SYN_EVENTS, env: {} }));
  const b = redactedView(loadPrivateCorpus({ path: SYN_EVENTS, env: {} }));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

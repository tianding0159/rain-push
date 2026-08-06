// Tests for shared IO: canonical JSON is stable + sorted, read errors have stable codes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readJson, canonicalJson, IoError, IO_ERROR_CODES, loadSchemas } from "../lib/io.mjs";

function tmp() { return mkdtempSync(join(tmpdir(), "p0a-io-")); }

test("canonicalJson sorts object keys recursively and appends a newline", () => {
  const out = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
  assert.equal(out, '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
});

test("canonicalJson preserves array order (order is semantic in corpora)", () => {
  assert.equal(canonicalJson([3, 1, 2]), "[\n  3,\n  1,\n  2\n]\n");
});

test("canonicalJson is idempotent", () => {
  const v = { x: [{ z: 1, a: 2 }], m: "s" };
  assert.equal(canonicalJson(v), canonicalJson(JSON.parse(canonicalJson(v).trim())));
});

test("readJson: unreadable path → stable code", () => {
  assert.throws(() => readJson(join(tmp(), "nope.json")),
    (e) => e instanceof IoError && e.code === IO_ERROR_CODES.UNREADABLE);
});

test("readJson: malformed JSON → stable code", () => {
  const f = join(tmp(), "b.json"); writeFileSync(f, "{oops");
  assert.throws(() => readJson(f), (e) => e.code === IO_ERROR_CODES.MALFORMED_JSON);
});

test("loadSchemas returns all four schemas", () => {
  const s = loadSchemas();
  assert.ok(s.registry && s.event && s.public && s.retrieval);
});

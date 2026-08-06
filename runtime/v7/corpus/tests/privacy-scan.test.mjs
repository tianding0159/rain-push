// Tests for the privacy / verbatim-export scanner: it must pass the real export, and catch
// both verbatim leaks and private-only fields planted into a public artifact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scanForLeaks, PRIVACY_CODES } from "../lib/privacy-scan.mjs";
import { exportCorpus } from "../lib/export-public.mjs";
import { loadPolicy } from "../lib/source-policy.mjs";
import { readJson } from "../lib/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const policy = loadPolicy();
const registry = readJson(join(FIX, "registry.valid.json"));
const events = readJson(join(FIX, "events.valid.json"));

test("the real public export is clean against the private events", () => {
  const { events: pub } = exportCorpus({ events, registry, policy });
  const res = scanForLeaks(events, [{ name: "public.json", data: pub }]);
  assert.ok(res.clean, JSON.stringify(res.findings));
});

test("planted verbatim is caught", () => {
  const leaked = [{ id: "evt_x", note: events[0].messages[1].text }];
  const res = scanForLeaks(events, [{ name: "leaky.json", data: leaked }]);
  assert.ok(!res.clean);
  assert.ok(res.findings.some((f) => f.code === PRIVACY_CODES.VERBATIM_TEXT));
});

test("planted private-only field is caught", () => {
  const leaked = [{ id: "evt_x", messages: [{ order: 1, role: "ame", text: "oops" }] }];
  const res = scanForLeaks(events, [{ name: "leakfield.json", data: leaked }]);
  assert.ok(!res.clean);
  assert.ok(res.findings.some((f) => f.code === PRIVACY_CODES.PRIVATE_FIELD));
});

test("verbatim leaked as an object KEY is caught (keys are scanned, not just values)", () => {
  const secret = events[0].messages[1].text;
  const leaked = [{ [secret]: "value" }];
  const res = scanForLeaks(events, [{ name: "keyleak.json", data: leaked }]);
  assert.ok(!res.clean);
  assert.ok(res.findings.some((f) => f.code === PRIVACY_CODES.VERBATIM_TEXT));
});

test("verbatim nested deep in arrays/objects is caught", () => {
  const secret = events[0].messages[1].text;
  const leaked = { a: { b: [{ c: `prefix ${secret} suffix` }] } };
  const res = scanForLeaks(events, [{ name: "deep.json", data: leaked }]);
  assert.ok(res.findings.some((f) => f.code === PRIVACY_CODES.VERBATIM_TEXT));
});

test("findings are deterministically ordered", () => {
  const leaked = [
    { id: "e1", text: "z", note: events[0].messages[0].text },
    { id: "e2", verbatim: true },
  ];
  const a = scanForLeaks(events, [{ name: "b.json", data: leaked }, { name: "a.json", data: leaked }]);
  const b = scanForLeaks(events, [{ name: "b.json", data: leaked }, { name: "a.json", data: leaked }]);
  assert.deepEqual(a.findings, b.findings);
  // sorted by artifact name first
  const arts = a.findings.map((f) => f.artifact);
  assert.deepEqual(arts, [...arts].sort());
});

test("empty inputs are clean", () => {
  assert.ok(scanForLeaks([], []).clean);
  assert.ok(scanForLeaks(events, []).clean);
});

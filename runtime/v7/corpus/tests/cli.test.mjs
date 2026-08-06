// End-to-end CLI tests: exit codes are the contract's machine interface, so they are pinned
// here (0 ok, 1 contract failure, 2 usage/IO). Also proves the tools only write to their
// declared --out paths (filesystem safety) and that stdout output is deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "..", "bin");
const FIX = join(HERE, "..", "fixtures");
const REG = join(FIX, "registry.valid.json");
const EVT = join(FIX, "events.valid.json");
const RET = join(FIX, "retrievals.valid.json");

function node(script, args, opts = {}) {
  return spawnSync(process.execPath, [join(BIN, script), ...args], { encoding: "utf8", ...opts });
}
function tmp() { return mkdtempSync(join(tmpdir(), "p0a-cli-")); }

test("validate: valid corpus exits 0", () => {
  const r = node("validate.mjs", ["--registry", REG, "--events", EVT, "--retrievals", RET]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("validate: contract failure exits 1 with a stable code on stdout", () => {
  const bad = join(FIX, "invalid", "cases.json");
  // Build a temp single-case corpus for a schema failure.
  const d = tmp();
  const reg = join(d, "r.json"); const evt = join(d, "e.json");
  const cases = JSON.parse(readFileSync(bad, "utf8")).cases;
  const c = cases.find((x) => x.name === "unknown_source");
  writeToFile(reg, JSON.stringify(c.registry));
  writeToFile(evt, JSON.stringify(c.events));
  const r = node("validate.mjs", ["--registry", reg, "--events", evt]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /UNKNOWN_SOURCE/);
});

test("validate: usage error exits 2 with no stack trace", () => {
  const r = node("validate.mjs", ["--events", EVT]); // missing --registry
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage error/);
  assert.ok(!/\bat \w/.test(r.stderr), "should not print a stack trace");
});

test("validate: unreadable file exits 2 with IO error code", () => {
  const r = node("validate.mjs", ["--registry", join(tmp(), "nope.json"), "--events", EVT]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ERR_IO_UNREADABLE/);
});

test("migrate: writes ONLY the declared --out files (filesystem safety)", () => {
  const d = tmp();
  const outR = join(d, "reg.json"); const outE = join(d, "evt.json");
  const r = node("migrate.mjs", ["--in", join(FIX, "corpus.v0_1.json"), "--out-registry", outR, "--out-events", outE]);
  assert.equal(r.status, 0, r.stderr);
  const written = readdirSync(d).sort();
  assert.deepEqual(written, ["evt.json", "reg.json"]);
});

test("migrate: stdout output is deterministic across runs", () => {
  const a = node("migrate.mjs", ["--in", join(FIX, "corpus.v0_1.json")]);
  const b = node("migrate.mjs", ["--in", join(FIX, "corpus.v0_1.json")]);
  assert.equal(a.status, 0);
  assert.equal(a.stdout, b.stdout);
});

test("export: default skips C4; strict exits 1", () => {
  const ok = node("export-public.mjs", ["--registry", REG, "--events", EVT]);
  assert.equal(ok.status, 0);
  assert.ok(!ok.stdout.includes("evt_simulator_only"));
  const strict = node("export-public.mjs", ["--registry", REG, "--events", EVT, "--strict"]);
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /ERR_EXPORT_NOT_EXPORTABLE/);
});

test("privacy-scan: clean export exits 0, planted leak exits 1", () => {
  const d = tmp();
  const pub = join(d, "pub.json");
  const exp = node("export-public.mjs", ["--registry", REG, "--events", EVT, "--out", pub]);
  assert.equal(exp.status, 0);
  const clean = node("privacy-scan.mjs", ["--private", EVT, "--public", pub]);
  assert.equal(clean.status, 0);

  const leaky = join(d, "leak.json");
  const someText = JSON.parse(readFileSync(EVT, "utf8"))[0].messages[0].text;
  writeToFile(leaky, JSON.stringify([{ id: "x", note: someText }]));
  const bad = node("privacy-scan.mjs", ["--private", EVT, "--public", leaky]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /PRIVACY_VERBATIM_TEXT/);
});

// Local write helper (kept out of lib to avoid coupling test IO to production IO).
import { writeFileSync } from "node:fs";
function writeToFile(p, s) { writeFileSync(p, s); }

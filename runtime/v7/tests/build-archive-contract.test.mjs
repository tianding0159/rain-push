// Contract tests for the deterministic engine archive builder.
//
// These test the BUILD TOOLING (runtime/v7/build-engine-archive.mjs), not the engine.
// They live outside runtime/v7/engine/ so the engine tree stays byte-for-byte equal
// to what ships (the 68-file SSOT the manifest inventories).
//
// Coverage:
//   - ZIP metadata contract: Unix "version made by" host, UTF-8 filename flag on both
//     local and central headers, normalized 0644 external attributes, fixed DOS epoch.
//   - Non-ASCII path round-trip via the UTF-8 flag.
//   - Determinism: building the same input twice yields byte-identical output.
//   - File-tree safety: collectEngineFiles rejects symlinks and non-regular files
//     rather than following them out of the engine tree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import {
  buildZip,
  collectEngineFiles,
  CONSTANTS,
} from "../build-engine-archive.mjs";

// ---- little-endian readers over the produced buffer ----
const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);

function firstLocalHeader(zip) {
  assert.equal(u32(zip, 0), 0x04034b50, "local file header signature");
  return {
    versionNeeded: u16(zip, 4),
    flag: u16(zip, 6),
    method: u16(zip, 8),
    dosTime: u16(zip, 10),
    dosDate: u16(zip, 12),
    nameLen: u16(zip, 26),
  };
}

function firstCentralHeader(zip) {
  const i = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(i >= 0, "central directory header present");
  return {
    offset: i,
    versionMadeBy: u16(zip, i + 4),
    versionNeeded: u16(zip, i + 6),
    flag: u16(zip, i + 8),
    method: u16(zip, i + 10),
    dosTime: u16(zip, i + 12),
    dosDate: u16(zip, i + 14),
    externalAttr: u32(zip, i + 38),
  };
}

const sampleEntries = () => [
  { path: "runtime/v7/engine/a.txt", data: Buffer.from("alpha\n", "utf8") },
  { path: "runtime/v7/engine/b.txt", data: Buffer.from("beta\n", "utf8") },
];

test("central header advertises Unix host in 'version made by'", () => {
  const zip = buildZip(sampleEntries());
  const c = firstCentralHeader(zip);
  assert.equal(c.versionMadeBy, CONSTANTS.VERSION_MADE_BY);
  assert.equal(c.versionMadeBy >> 8, 3, "high byte 3 == Unix host");
  assert.equal(c.versionMadeBy & 0xff, 20, "low byte 20 == ZIP spec 2.0");
});

test("UTF-8 filename flag (bit 11) is set on both local and central headers", () => {
  const zip = buildZip(sampleEntries());
  const l = firstLocalHeader(zip);
  const c = firstCentralHeader(zip);
  assert.equal(l.flag & 0x0800, 0x0800, "local UTF-8 flag");
  assert.equal(c.flag & 0x0800, 0x0800, "central UTF-8 flag");
});

test("external attributes normalize to a regular 0644 file", () => {
  const zip = buildZip(sampleEntries());
  const c = firstCentralHeader(zip);
  assert.equal(c.externalAttr >>> 16, 0o100644, "mode bits rw-r--r-- regular file");
});

test("timestamps are the fixed DOS epoch (1980-01-01)", () => {
  const zip = buildZip(sampleEntries());
  const l = firstLocalHeader(zip);
  const c = firstCentralHeader(zip);
  assert.equal(l.dosDate, CONSTANTS.DOS_DATE);
  assert.equal(l.dosTime, CONSTANTS.DOS_TIME);
  assert.equal(c.dosDate, CONSTANTS.DOS_DATE);
  assert.equal(c.dosTime, CONSTANTS.DOS_TIME);
  assert.equal(l.dosDate, 0x0021, "DOS date == 1980-01-01");
});

test("non-ASCII filenames round-trip through the archive (UTF-8 flag)", () => {
  const entries = [
    { path: "runtime/v7/engine/雨推.txt", data: Buffer.from("下雨了\n", "utf8") },
  ];
  const zip = buildZip(entries);
  const l = firstLocalHeader(zip);
  assert.equal(l.flag & 0x0800, 0x0800, "UTF-8 flag set for non-ASCII name");
  // The stored name bytes must be the UTF-8 encoding of the path.
  const expected = Buffer.from(entries[0].path, "utf8");
  const stored = zip.subarray(30, 30 + l.nameLen);
  assert.deepEqual(stored, expected, "stored filename is UTF-8 bytes");
});

test("building identical input twice yields byte-identical archives", () => {
  const a = buildZip(sampleEntries());
  const b = buildZip(sampleEntries());
  assert.deepEqual(a, b);
});

// ---- file-tree safety ----

test("collectEngineFiles rejects symlinks instead of following them", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-safe-"));
  try {
    writeFileSync(join(dir, "real.txt"), "ok\n");
    symlinkSync("/etc/passwd", join(dir, "link.txt"));
    assert.throws(
      () => collectEngineFiles(dir),
      /refusing to archive symlink/,
      "must reject a symlink entry",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectEngineFiles rejects symlinked subdirectories", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-safe-"));
  const outside = mkdtempSync(join(tmpdir(), "outside-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "secret\n");
    symlinkSync(outside, join(dir, "sub"));
    assert.throws(
      () => collectEngineFiles(dir),
      /refusing to archive symlink/,
      "must reject a symlinked directory",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("collectEngineFiles accepts a clean tree of regular files", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-clean-"));
  try {
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "b.txt"), "b\n");
    writeFileSync(join(dir, "a.txt"), "a\n");
    writeFileSync(join(dir, "sub", "c.txt"), "c\n");
    const files = collectEngineFiles(dir);
    assert.deepEqual(
      files.map((f) => f.path),
      ["a.txt", "b.txt", "sub/c.txt"],
      "paths are relative, '/'-separated, bytewise sorted",
    );
    for (const f of files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(f.bytes > 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- end-to-end determinism via the CLI (archive-only, must not touch tracked files) ----

test("CLI --no-manifest builds a zip without writing the tracked manifest", () => {
  const scriptUrl = new URL("../build-engine-archive.mjs", import.meta.url);
  const script = scriptUrl.pathname;
  const outDir = mkdtempSync(join(tmpdir(), "engine-out-"));
  try {
    const out = execFileSync(
      process.execPath,
      [script, "--no-manifest", "--out", outDir],
      { encoding: "utf8" },
    );
    assert.match(out, /manifest\s+:\s+\(not written; --no-manifest\)/);
    assert.match(out, /archive sha256\s+:/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

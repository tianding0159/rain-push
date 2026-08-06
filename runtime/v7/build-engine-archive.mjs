// P0-0A deterministic engine archive builder.
//
// Single source of truth: the reviewable engine source tree at runtime/v7/engine/.
// This script derives two artifacts from that tree, deterministically:
//
//   1. runtime/v7/engine.manifest.json  — committed. A SHA-256 inventory of every
//      engine file, plus a format version and the source commit it was built from.
//   2. <out>/rain-push-v7-engine.zip     — the engine archive. Reproducible: building
//      twice from the same source yields a byte-identical zip, and extracting it
//      reproduces every file's SHA-256 exactly (round-trip parity).
//
// Determinism guarantees (see 05_P0_0A_REPOSITORY_SSOT.md "Generated artifact contract"):
//   - entries sorted bytewise by path
//   - "/" path separators only
//   - a single fixed archive timestamp (DOS epoch 1980-01-01)
//   - normalized permissions (0644 for every entry)
//   - relative paths only — no host-specific absolute paths
//   - stable compression (raw DEFLATE, fixed level)
//   - SHA-256 recorded for every file
//
// Zero runtime dependencies — uses only node: builtins. This is build tooling, not
// engine code, and lives OUTSIDE runtime/v7/engine/ so the engine tree stays byte-for-
// byte equal to what ships (preserving zip/source parity).
//
// Usage:
//   node runtime/v7/build-engine-archive.mjs [--out DIR] [--source-commit SHA] [--no-zip]
//
// The committed manifest's sourceCommit records provenance (the commit the engine
// source was promoted from). CI regenerates and compares the manifest's file list
// only, so the sourceCommit field never blocks determinism verification.

import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url)); // runtime/v7
const ENGINE_DIR = join(HERE, "engine"); // runtime/v7/engine
const MANIFEST_PATH = join(HERE, "engine.manifest.json"); // runtime/v7/engine.manifest.json
const MANIFEST_FORMAT_VERSION = 1;
const ARCHIVE_NAME = "rain-push-v7-engine.zip";
// Prefix inside the archive so it extracts to a self-describing directory.
const ARCHIVE_ROOT = "runtime/v7/engine";

// ---- args ----
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
}
const outDir = argVal("--out", join(HERE, "dist"));
const noZip = args.includes("--no-zip");
let sourceCommit = argVal("--source-commit", null);
if (!sourceCommit) {
  try {
    sourceCommit = execSync("git rev-parse HEAD", { cwd: HERE })
      .toString()
      .trim();
  } catch {
    sourceCommit = "unknown";
  }
}

// ---- collect files (recursive, deterministic order) ----
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

const files = walk(ENGINE_DIR)
  .map((abs) => {
    // Relative to the engine dir, forced to "/" separators.
    const rel = relative(ENGINE_DIR, abs).split(sep).join("/");
    const data = readFileSync(abs);
    const sha256 = createHash("sha256").update(data).digest("hex");
    return { path: rel, sha256, bytes: data.length, data };
  })
  // bytewise sort by path
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

// ---- write manifest (deterministic JSON: stable key order, no timestamps) ----
const manifest = {
  manifestFormatVersion: MANIFEST_FORMAT_VERSION,
  sourceCommit,
  sourceRoot: "runtime/v7/engine",
  archiveName: ARCHIVE_NAME,
  fileCount: files.length,
  totalBytes: files.reduce((n, f) => n + f.bytes, 0),
  files: files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
};
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

// ---- deterministic ZIP writer (zero-dep) ----
// Minimal PKZIP: raw DEFLATE, fixed DOS timestamp, normalized 0644 perms, sorted
// entries. No extra fields, no data descriptors.

// CRC-32 (IEEE 802.3), table-driven.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed DOS date/time = 1980-01-01 00:00:00.
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021; // (year 0<<9)|(month 1<<5)|(day 1)
const EXTERNAL_ATTR = (0o100644 << 16) >>> 0; // regular file, rw-r--r--
const VERSION_NEEDED = 20; // 2.0 (deflate)

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.path, "utf8");
    const compressed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(0, 6); // general purpose flag
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central dir header signature
    central.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    central.writeUInt16LE(VERSION_NEEDED, 6); // version needed
    central.writeUInt16LE(0, 8); // flag
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(EXTERNAL_ATTR, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralPart.length, 12); // central dir size
  eocd.writeUInt32LE(localPart.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([localPart, centralPart, eocd]);
}

let zipInfo = null;
if (!noZip) {
  mkdirSync(outDir, { recursive: true });
  const zipEntries = files.map((f) => ({
    path: `${ARCHIVE_ROOT}/${f.path}`,
    data: f.data,
  }));
  const zipBuf = buildZip(zipEntries);
  const zipPath = join(outDir, ARCHIVE_NAME);
  writeFileSync(zipPath, zipBuf);
  zipInfo = {
    path: zipPath,
    bytes: zipBuf.length,
    sha256: createHash("sha256").update(zipBuf).digest("hex"),
  };
}

// ---- summary ----
console.log(`engine source : ${relative(process.cwd(), ENGINE_DIR) || "."}`);
console.log(`source commit : ${sourceCommit}`);
console.log(`files         : ${manifest.fileCount} (${manifest.totalBytes} bytes)`);
console.log(`manifest      : ${relative(process.cwd(), MANIFEST_PATH)}`);
if (zipInfo) {
  console.log(`archive       : ${relative(process.cwd(), zipInfo.path)} (${zipInfo.bytes} bytes)`);
  console.log(`archive sha256: ${zipInfo.sha256}`);
}

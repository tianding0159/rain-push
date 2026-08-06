// P0-0B legacy bundle inventory generator.
//
// Produces a machine-verifiable census of the root legacy handoff bundle
// (rain-push-v7-claude-handoff.zip): every member's path, sizes, SHA-256, and ZIP
// metadata, plus each file member's canonical tracked source path — matched by CONTENT
// SHA-256, never by filename. Members with no tracked file of identical content are
// marked orphan.
//
// Two artifacts are written next to this script (deterministic; no timestamps):
//   - bundle-inventory.json : per-member census (paths, sizes, SHA-256, metadata)
//   - bundle-source-map.json: mapped[] (member -> tracked sources) + orphans[]
//
// Zero runtime dependencies — node: builtins only. The ZIP central directory is parsed
// directly (no unzip needed) so file order, metadata, and directory entries are visible.
// Content SHA-256 is computed by inflating each member with zlib.
//
// Usage:
//   node runtime/v7/legacy-bundle/gen-bundle-inventory.mjs [--zip PATH] [--check]
//     --zip PATH   bundle path (default: rain-push-v7-claude-handoff.zip at repo root)
//     --check      regenerate to /tmp and diff against committed artifacts; exit 1 on drift

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", ".."); // runtime/v7/legacy-bundle -> repo root
const DEFAULT_ZIP = join(REPO_ROOT, "rain-push-v7-claude-handoff.zip");
const INVENTORY_PATH = join(HERE, "bundle-inventory.json");
const SOURCE_MAP_PATH = join(HERE, "bundle-source-map.json");

// ---- ZIP central-directory parser (zero-dep) ----
export function parseZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("EOCD not found — not a zip?");
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);

  const members = [];
  let p = cdOff;
  const end = cdOff + cdSize;
  while (p < end) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`bad central header at ${p}`);
    }
    const versionMadeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const dosTime = buf.readUInt16LE(p + 12);
    const dosDate = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const extAttr = buf.readUInt32LE(p + 38);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");

    members.push({
      path: name,
      isDir: name.endsWith("/"),
      uncompressedBytes: usize,
      compressedBytes: csize,
      crc32: crc.toString(16).padStart(8, "0"),
      method, // 0 = store, 8 = deflate
      dosDate,
      dosTime,
      versionMadeBy: versionMadeBy.toString(16).padStart(4, "0"),
      hostOs: versionMadeBy >> 8, // 3 = Unix, 0 = DOS/FAT
      flags: flags.toString(16).padStart(4, "0"),
      utf8Flag: Boolean(flags & 0x0800),
      externalAttrMode: ((extAttr >>> 16) & 0xffff).toString(8),
      _localOff: localOff,
    });
    p += 46 + nlen + elen + clen;
  }
  return { totalEntries, members };
}

// Inflate a single member's content from its local header (store or deflate).
function readMemberContent(buf, m) {
  const lo = m._localOff;
  if (buf.readUInt32LE(lo) !== 0x04034b50) {
    throw new Error(`bad local header for ${m.path}`);
  }
  const nlen = buf.readUInt16LE(lo + 26);
  const elen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + nlen + elen;
  const comp = buf.subarray(dataStart, dataStart + m.compressedBytes);
  if (m.method === 0) return Buffer.from(comp); // stored
  if (m.method === 8) return inflateRawSync(comp); // deflate
  throw new Error(`unsupported method ${m.method} for ${m.path}`);
}

export function buildInventory(zipPath) {
  const buf = readFileSync(zipPath);
  const { totalEntries, members } = parseZip(buf);
  for (const m of members) {
    if (m.isDir) {
      m.sha256 = null;
    } else {
      m.sha256 = createHash("sha256").update(readMemberContent(buf, m)).digest("hex");
    }
    delete m._localOff;
  }
  return {
    zip: relative(REPO_ROOT, zipPath).split("\\").join("/"),
    zipSizeBytes: buf.length,
    zipSha256: createHash("sha256").update(buf).digest("hex"),
    totalCentralEntries: totalEntries,
    memberCount: members.length,
    fileMembers: members.filter((m) => !m.isDir).length,
    dirMembers: members.filter((m) => m.isDir).length,
    members,
  };
}

// Index every tracked file (git ls-files) by content SHA-256.
export function trackedByContentSha(repoRoot = REPO_ROOT) {
  const listed = execFileSync("git", ["ls-files"], { cwd: repoRoot })
    .toString()
    .split("\n")
    .filter(Boolean);
  const byHash = new Map();
  let count = 0;
  for (const rel of listed) {
    const abs = join(repoRoot, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const h = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(rel);
    count++;
  }
  return { byHash, count };
}

// Map each file member to tracked source(s) by CONTENT sha256 (never by filename).
export function buildSourceMap(inventory, repoRoot = REPO_ROOT) {
  const { byHash, count } = trackedByContentSha(repoRoot);
  const mapped = [];
  const orphans = [];
  for (const m of inventory.members) {
    if (m.isDir) continue;
    const sources = byHash.get(m.sha256);
    if (sources && sources.length) {
      mapped.push({ zipPath: m.path, sha256: m.sha256, sources: [...sources].sort() });
    } else {
      orphans.push({ zipPath: m.path, sha256: m.sha256, bytes: m.uncompressedBytes });
    }
  }
  mapped.sort((a, b) => (a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0));
  orphans.sort((a, b) => (a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0));
  return {
    trackedFilesIndexed: count,
    zipFileMembers: inventory.fileMembers,
    mappedByContent: mapped.length,
    orphanCount: orphans.length,
    mapped,
    orphans,
  };
}

function stableJson(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

// ---- CLI ----
function main(argv) {
  const zi = argv.indexOf("--zip");
  const zipPath = zi >= 0 && argv[zi + 1] ? argv[zi + 1] : DEFAULT_ZIP;
  const check = argv.includes("--check");

  const inventory = buildInventory(zipPath);
  const sourceMap = buildSourceMap(inventory);

  if (check) {
    const invNow = stableJson(inventory);
    const mapNow = stableJson(sourceMap);
    const invOld = readFileSync(INVENTORY_PATH, "utf8");
    const mapOld = readFileSync(SOURCE_MAP_PATH, "utf8");
    let drift = false;
    if (invNow !== invOld) {
      console.log("DRIFT: bundle-inventory.json is stale");
      drift = true;
    }
    if (mapNow !== mapOld) {
      console.log("DRIFT: bundle-source-map.json is stale");
      drift = true;
    }
    if (drift) {
      console.log("run: node runtime/v7/legacy-bundle/gen-bundle-inventory.mjs");
      process.exit(1);
    }
    console.log("inventory + source-map are current");
    return;
  }

  writeFileSync(INVENTORY_PATH, stableJson(inventory));
  writeFileSync(SOURCE_MAP_PATH, stableJson(sourceMap));
  console.log(`zip                 : ${inventory.zip}`);
  console.log(`zip sha256          : ${inventory.zipSha256}`);
  console.log(`central entries     : ${inventory.totalCentralEntries}`);
  console.log(`  file members      : ${inventory.fileMembers}`);
  console.log(`  dir members       : ${inventory.dirMembers}`);
  console.log(`tracked indexed     : ${sourceMap.trackedFilesIndexed}`);
  console.log(`  mapped by content : ${sourceMap.mappedByContent}`);
  console.log(`  orphans           : ${sourceMap.orphanCount}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}

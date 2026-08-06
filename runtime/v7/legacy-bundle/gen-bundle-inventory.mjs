// P0-0B legacy bundle inventory generator.
//
// Produces a machine-verifiable census of the root legacy handoff bundle
// (rain-push-v7-claude-handoff.zip): every member's path, sizes, SHA-256, and ZIP
// metadata, plus each file member's classification against a FIXED Git base ref —
// matched by CONTENT SHA-256, never by filename.
//
// Source classification (four buckets — do NOT conflate as "orphan"):
//   - exact_content_match         : exactly one tracked blob has identical content
//   - ambiguous_content_match     : >1 tracked blobs share this content
//   - same_path_different_content : a tracked file exists at the same path, but its
//                                   content differs (canonical source EXISTS, just drifted)
//   - no_tracked_path             : no tracked blob of this content AND no tracked file
//                                   at this path
//
// Determinism: the tracked index is read from a FIXED Git base ref (git ls-tree /
// cat-file), never the mutable working tree. This decouples classification from a dirty
// worktree and from this script's own artifacts, so `--check` stays green after commit.
// Symlink entries (mode 120000) are skipped — they are not regular file content.
//
// Two artifacts are written next to this script (deterministic; no timestamps):
//   - bundle-inventory.json : per-member census (paths, sizes, SHA-256, metadata)
//   - bundle-source-map.json: classification of each file member vs the base ref
//
// Zero runtime dependencies — node: builtins only. The ZIP central directory is parsed
// directly (no unzip needed) so file order, metadata, and directory entries are visible.
// Content SHA-256 is computed by inflating each member with zlib.
//
// Usage:
//   node runtime/v7/legacy-bundle/gen-bundle-inventory.mjs [--zip PATH] [--base REF] [--check]
//     --zip PATH   bundle path (default: rain-push-v7-claude-handoff.zip at repo root)
//     --base REF   Git ref to index tracked sources from (default: BASE_REF constant)
//     --check      regenerate in-memory and diff against committed artifacts; exit 1 on drift

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", ".."); // runtime/v7/legacy-bundle -> repo root
const DEFAULT_ZIP = join(REPO_ROOT, "rain-push-v7-claude-handoff.zip");
const INVENTORY_PATH = join(HERE, "bundle-inventory.json");
const SOURCE_MAP_PATH = join(HERE, "bundle-source-map.json");

// Fixed base ref for source classification. Pinned so classification is reproducible and
// unaffected by later commits (including this script's own inventory artifacts).
export const BASE_REF = "a33c66577ed072a021f4b3ec8713baf12a4239af";

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
  if (members.length !== totalEntries) {
    throw new Error(
      `member count mismatch: parsed ${members.length} central records but EOCD totalEntries=${totalEntries}`,
    );
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

// Index every tracked regular file at a FIXED Git ref by content SHA-256.
// Reads Git blobs via ls-tree/cat-file (never the mutable working tree), so the index is
// reproducible and unaffected by uncommitted changes or this script's own artifacts.
// Symlink entries (mode 120000) and submodules (160000) are skipped: only regular blobs
// (100644 / 100755) count as tracked file content.
export function trackedByContentSha(baseRef = BASE_REF, repoRoot = REPO_ROOT) {
  const lines = execFileSync("git", ["ls-tree", "-r", baseRef], { cwd: repoRoot, maxBuffer: 1 << 28 })
    .toString()
    .split("\n")
    .filter(Boolean);
  const byHash = new Map(); // content sha256 -> [paths]
  const paths = new Set(); // regular-file paths present at baseRef
  let count = 0;
  let symlinksSkipped = 0;
  for (const line of lines) {
    // format: "<mode> <type> <objectsha>\t<path>"
    const tab = line.indexOf("\t");
    const meta = line.slice(0, tab);
    const path = line.slice(tab + 1);
    const [mode, type, objSha] = meta.split(/\s+/);
    if (mode === "120000") {
      symlinksSkipped++;
      continue; // symlink — not regular file content
    }
    if (type !== "blob") continue; // gitlink/submodule etc.
    const content = execFileSync("git", ["cat-file", "blob", objSha], {
      cwd: repoRoot,
      maxBuffer: 1 << 30,
    });
    const h = createHash("sha256").update(content).digest("hex");
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(path);
    paths.add(path);
    count++;
  }
  return { byHash, paths, count, symlinksSkipped };
}

// Classify each file member against the fixed base ref by CONTENT sha256 (never filename).
// Four buckets (see file header). "no_tracked_path" is the only true source-absent case —
// same_path_different_content means the canonical source EXISTS but has drifted.
export function buildSourceMap(inventory, baseRef = BASE_REF, repoRoot = REPO_ROOT) {
  const { byHash, paths, count, symlinksSkipped } = trackedByContentSha(baseRef, repoRoot);
  const buckets = {
    exact_content_match: [],
    same_path_different_content: [],
    ambiguous_content_match: [],
    no_tracked_path: [],
  };
  for (const m of inventory.members) {
    if (m.isDir) continue;
    const sources = byHash.get(m.sha256);
    if (sources && sources.length === 1) {
      buckets.exact_content_match.push({
        zipPath: m.path,
        sha256: m.sha256,
        source: sources[0],
      });
    } else if (sources && sources.length > 1) {
      buckets.ambiguous_content_match.push({
        zipPath: m.path,
        sha256: m.sha256,
        sources: [...sources].sort(),
      });
    } else if (paths.has(m.path)) {
      buckets.same_path_different_content.push({
        zipPath: m.path,
        bundleSha256: m.sha256,
        note: "tracked file exists at this path at base ref but content differs",
      });
    } else {
      buckets.no_tracked_path.push({
        zipPath: m.path,
        sha256: m.sha256,
        bytes: m.uncompressedBytes,
      });
    }
  }
  const byZipPath = (a, b) => (a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0);
  for (const k of Object.keys(buckets)) buckets[k].sort(byZipPath);
  return {
    baseRef,
    trackedFilesIndexed: count,
    symlinksSkipped,
    zipFileMembers: inventory.fileMembers,
    counts: {
      exact_content_match: buckets.exact_content_match.length,
      same_path_different_content: buckets.same_path_different_content.length,
      ambiguous_content_match: buckets.ambiguous_content_match.length,
      no_tracked_path: buckets.no_tracked_path.length,
    },
    ...buckets,
  };
}

function stableJson(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

// ---- CLI ----
function main(argv) {
  const zi = argv.indexOf("--zip");
  const zipPath = zi >= 0 && argv[zi + 1] ? argv[zi + 1] : DEFAULT_ZIP;
  const bi = argv.indexOf("--base");
  const baseRef = bi >= 0 && argv[bi + 1] ? argv[bi + 1] : BASE_REF;
  const check = argv.includes("--check");

  const inventory = buildInventory(zipPath);
  const sourceMap = buildSourceMap(inventory, baseRef);

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
  console.log(`zip                          : ${inventory.zip}`);
  console.log(`zip sha256                   : ${inventory.zipSha256}`);
  console.log(`central entries              : ${inventory.totalCentralEntries}`);
  console.log(`  file members               : ${inventory.fileMembers}`);
  console.log(`  dir members                : ${inventory.dirMembers}`);
  console.log(`base ref                     : ${sourceMap.baseRef}`);
  console.log(`tracked indexed (base ref)   : ${sourceMap.trackedFilesIndexed}`);
  console.log(`  symlinks skipped           : ${sourceMap.symlinksSkipped}`);
  console.log(`  exact_content_match        : ${sourceMap.counts.exact_content_match}`);
  console.log(`  same_path_different_content: ${sourceMap.counts.same_path_different_content}`);
  console.log(`  ambiguous_content_match    : ${sourceMap.counts.ambiguous_content_match}`);
  console.log(`  no_tracked_path            : ${sourceMap.counts.no_tracked_path}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}

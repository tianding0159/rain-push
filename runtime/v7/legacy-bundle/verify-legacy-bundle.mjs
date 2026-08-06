// Frozen legacy artifact verifier.
//
// Option B (P0-0B): rain-push-v7-claude-handoff.zip is a FROZEN legacy artifact — a
// historical spec + handoff snapshot that no longer follows runtime changes (see
// MIGRATION.md and RECOMMENDATION.md). It cannot be deterministically rebuilt from
// current tracked source + current builder, so it is not guarded by drift/parity
// against the live engine; instead it is pinned by identity in legacy-bundle.lock.json.
//
// This module is the tamper guard: it asserts the on-disk artifact is byte-for-byte the
// frozen one. It verifies EVERY pinned dimension so no single weak check can pass a
// mutated artifact:
//   - existence
//   - lockFormatVersion (supported)
//   - byte size
//   - SHA-256 (whole file)
//   - Git blob SHA-1 ("blob <len>\0" + bytes, SHA-1) — matches `git hash-object`
//   - central / file / directory entry counts (parsed from the ZIP central directory)
//
// Entry counts are parsed with the shared, unit-tested parseZip from
// gen-bundle-inventory.mjs (no second ZIP parser). Zero runtime dependencies.
//
// Usage:
//   node runtime/v7/legacy-bundle/verify-legacy-bundle.mjs [--lock PATH] [--artifact PATH]
//   exits 0 when every dimension matches the lock, 1 on any mismatch, 2 on usage error.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseZip } from "./gen-bundle-inventory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", ".."); // runtime/v7/legacy-bundle -> repo root
const DEFAULT_LOCK = join(HERE, "legacy-bundle.lock.json");

// Lock format versions this verifier understands.
export const SUPPORTED_LOCK_FORMAT_VERSION = 1;

// Git blob SHA-1 of a buffer: sha1("blob " + byteLength + "\0" + bytes).
// Matches `git hash-object` for a regular file.
export function gitBlobSha1(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, buf])).digest("hex");
}

// Verify a buffer against a lock object. Pure (no I/O): callers read the file.
// Returns { ok, problems: [{ kind, expected, actual }] }. Each pinned dimension is an
// independent check so one correct field cannot mask another that was tampered with.
export function verifyBufferAgainstLock(buf, lock) {
  const problems = [];
  const check = (kind, expected, actual) => {
    if (expected !== actual) problems.push({ kind, expected, actual });
  };

  check("lockFormatVersion", SUPPORTED_LOCK_FORMAT_VERSION, lock.lockFormatVersion);
  check("sizeBytes", lock.sizeBytes, buf.length);
  check("sha256", lock.sha256, createHash("sha256").update(buf).digest("hex"));
  check("gitBlobSha1", lock.gitBlobSha1, gitBlobSha1(buf));

  // Entry counts from the ZIP central directory (via shared parser).
  let parsed;
  try {
    parsed = parseZip(buf);
  } catch (e) {
    problems.push({ kind: "zipParse", expected: "parseable zip", actual: String(e.message || e) });
    return { ok: false, problems };
  }
  const fileMembers = parsed.members.filter((m) => !m.isDir).length;
  const dirMembers = parsed.members.filter((m) => m.isDir).length;
  const want = lock.entryCounts || {};
  check("entryCounts.central", want.central, parsed.totalEntries);
  check("entryCounts.file", want.file, fileMembers);
  check("entryCounts.directory", want.directory, dirMembers);

  return { ok: problems.length === 0, problems };
}

// Read the lock + artifact from disk and verify. Missing artifact is a first-class
// failure (kind "missing"), not an exception. artifactPath defaults to the lock's
// artifactPath resolved against repoRoot.
export function verifyLegacyBundle({ lockPath = DEFAULT_LOCK, artifactPath, repoRoot = REPO_ROOT } = {}) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const artPath = artifactPath || join(repoRoot, lock.artifactPath);
  if (!existsSync(artPath)) {
    return {
      ok: false,
      lock,
      artifactPath: artPath,
      problems: [{ kind: "missing", expected: lock.artifactPath, actual: "<absent>" }],
    };
  }
  const buf = readFileSync(artPath);
  return { lock, artifactPath: artPath, ...verifyBufferAgainstLock(buf, lock) };
}

// ---- CLI ----
function main(argv) {
  const li = argv.indexOf("--lock");
  const ai = argv.indexOf("--artifact");
  const lockPath = li >= 0 && argv[li + 1] ? argv[li + 1] : DEFAULT_LOCK;
  const artifactPath = ai >= 0 && argv[ai + 1] ? argv[ai + 1] : undefined;

  let res;
  try {
    res = verifyLegacyBundle({ lockPath, artifactPath });
  } catch (e) {
    console.error(`error: ${e.message || e}`);
    process.exit(2);
  }
  for (const p of res.problems) {
    console.log(`${p.kind}: expected ${p.expected}, got ${p.actual}`);
  }
  if (!res.ok) {
    console.log(`frozen legacy bundle verification FAILED: ${res.problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(
    `frozen legacy bundle OK: ${res.lock.artifactPath} sha256=${res.lock.sha256} ` +
      `size=${res.lock.sizeBytes} entries=${res.lock.entryCounts.central} ` +
      `(${res.lock.entryCounts.file} files + ${res.lock.entryCounts.directory} dirs)`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}

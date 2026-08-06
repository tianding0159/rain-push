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
// Before any hashing, the lock OBJECT is structurally validated against the frozen-artifact
// contract (validateLock): lifecycle == frozen_legacy_artifact, artifactPath == the exact
// expected relative path (absolute / repo-escaping paths rejected), SHA fields well-formed
// hex, size + entry counts non-negative integers, provenance commits 40-hex. Contract
// violations throw LockContractError with a stable `code` (LOCK_ERROR_CODES) so failures
// are deterministic and machine-assertable — distinct from a content MISMATCH against the
// artifact.
//
// Entry counts are parsed with the shared, unit-tested parseZip from
// gen-bundle-inventory.mjs (no second ZIP parser). Zero runtime dependencies.
//
// Usage:
//   node runtime/v7/legacy-bundle/verify-legacy-bundle.mjs [--lock PATH] [--artifact PATH]
// Exit codes (deterministic):
//   0  every dimension matches the lock
//   1  artifact present but a content dimension mismatched (or missing artifact)
//   2  lock contract violation / malformed lock / usage error (stable code on stderr)

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseZip } from "./gen-bundle-inventory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", ".."); // runtime/v7/legacy-bundle -> repo root
const DEFAULT_LOCK = join(HERE, "legacy-bundle.lock.json");

// Lock format versions this verifier understands.
export const SUPPORTED_LOCK_FORMAT_VERSION = 1;

// The frozen artifact's contractually fixed identity. The lock is not free-form: these
// two fields must equal exactly these values, or the lock is not describing THIS frozen
// artifact and must be rejected before any hashing.
export const EXPECTED_LIFECYCLE = "frozen_legacy_artifact";
export const EXPECTED_ARTIFACT_PATH = "rain-push-v7-claude-handoff.zip";

// Deterministic error codes for a malformed / incomplete / contract-violating lock.
// Stable strings (not messages) so CI and callers can assert on them without parsing
// prose. Verification of a well-formed lock uses "problems[].kind"; structural rejection
// uses these codes via a thrown LockContractError.
export const LOCK_ERROR_CODES = Object.freeze({
  NOT_OBJECT: "ERR_LOCK_NOT_OBJECT",
  MISSING_FIELD: "ERR_LOCK_MISSING_FIELD",
  BAD_TYPE: "ERR_LOCK_BAD_TYPE",
  UNSUPPORTED_VERSION: "ERR_LOCK_UNSUPPORTED_VERSION",
  BAD_LIFECYCLE: "ERR_LOCK_BAD_LIFECYCLE",
  BAD_ARTIFACT_PATH: "ERR_LOCK_BAD_ARTIFACT_PATH",
  ABSOLUTE_ARTIFACT_PATH: "ERR_LOCK_ABSOLUTE_ARTIFACT_PATH",
  ESCAPING_ARTIFACT_PATH: "ERR_LOCK_ESCAPING_ARTIFACT_PATH",
  BAD_SHA256: "ERR_LOCK_BAD_SHA256",
  BAD_BLOB_SHA1: "ERR_LOCK_BAD_BLOB_SHA1",
  BAD_SIZE: "ERR_LOCK_BAD_SIZE",
  BAD_ENTRY_COUNTS: "ERR_LOCK_BAD_ENTRY_COUNTS",
  BAD_COMMIT: "ERR_LOCK_BAD_COMMIT",
});

// Thrown for any structural / contract violation in the lock itself (distinct from a
// content mismatch against the artifact). Carries a stable `code`.
export class LockContractError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "LockContractError";
    this.code = code;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const isNonNegInt = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0;

// Validate the lock OBJECT against the frozen-artifact contract. Throws LockContractError
// with a deterministic code on the first violation (checked in a fixed order so the same
// malformed lock always yields the same code). Returns the lock on success.
//
// Path safety: artifactPath must be the exact expected relative path — additionally we
// reject absolute paths and any path that escapes the repo root once resolved, so a
// tampered lock cannot point the verifier at /etc/... or ../../secrets.
export function validateLock(lock, { repoRoot = REPO_ROOT } = {}) {
  if (lock === null || typeof lock !== "object" || Array.isArray(lock)) {
    throw new LockContractError(LOCK_ERROR_CODES.NOT_OBJECT, "lock must be a JSON object");
  }
  const req = (field, pred, code, typeName) => {
    if (!(field in lock)) {
      throw new LockContractError(LOCK_ERROR_CODES.MISSING_FIELD, field);
    }
    if (!pred(lock[field])) {
      throw new LockContractError(code, `${field} ${typeName}`);
    }
  };

  // Version first: an unsupported version means we cannot trust any other field's meaning.
  req("lockFormatVersion", (v) => typeof v === "number", LOCK_ERROR_CODES.BAD_TYPE, "must be a number");
  if (lock.lockFormatVersion !== SUPPORTED_LOCK_FORMAT_VERSION) {
    throw new LockContractError(
      LOCK_ERROR_CODES.UNSUPPORTED_VERSION,
      `got ${lock.lockFormatVersion}, supported ${SUPPORTED_LOCK_FORMAT_VERSION}`,
    );
  }

  // Fixed-identity fields.
  req("lifecycle", (v) => typeof v === "string", LOCK_ERROR_CODES.BAD_TYPE, "must be a string");
  if (lock.lifecycle !== EXPECTED_LIFECYCLE) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_LIFECYCLE, `must equal ${EXPECTED_LIFECYCLE}`);
  }
  req("artifactPath", (v) => typeof v === "string" && v.length > 0, LOCK_ERROR_CODES.BAD_TYPE, "must be a non-empty string");
  if (isAbsolute(lock.artifactPath)) {
    throw new LockContractError(LOCK_ERROR_CODES.ABSOLUTE_ARTIFACT_PATH, lock.artifactPath);
  }
  // Escape check: resolve against repo root and require it stays inside.
  const resolvedArt = resolve(repoRoot, lock.artifactPath);
  const rootWithSep = resolve(repoRoot) + sep;
  if (resolvedArt !== resolve(repoRoot, EXPECTED_ARTIFACT_PATH) && !resolvedArt.startsWith(rootWithSep)) {
    throw new LockContractError(LOCK_ERROR_CODES.ESCAPING_ARTIFACT_PATH, lock.artifactPath);
  }
  if (lock.artifactPath !== EXPECTED_ARTIFACT_PATH) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_ARTIFACT_PATH, `must equal ${EXPECTED_ARTIFACT_PATH}`);
  }

  // Hash field formats.
  req("sha256", (v) => typeof v === "string", LOCK_ERROR_CODES.BAD_TYPE, "must be a string");
  if (!HEX64.test(lock.sha256)) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_SHA256, "must be 64 lowercase hex chars");
  }
  req("gitBlobSha1", (v) => typeof v === "string", LOCK_ERROR_CODES.BAD_TYPE, "must be a string");
  if (!HEX40.test(lock.gitBlobSha1)) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_BLOB_SHA1, "must be 40 lowercase hex chars");
  }

  // Size + entry counts: non-negative integers.
  if (!isNonNegInt(lock.sizeBytes)) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_SIZE, "sizeBytes must be a non-negative integer");
  }
  if (lock.entryCounts === null || typeof lock.entryCounts !== "object" || Array.isArray(lock.entryCounts)) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_ENTRY_COUNTS, "entryCounts must be an object");
  }
  for (const k of ["central", "file", "directory"]) {
    if (!(k in lock.entryCounts)) {
      throw new LockContractError(LOCK_ERROR_CODES.MISSING_FIELD, `entryCounts.${k}`);
    }
    if (!isNonNegInt(lock.entryCounts[k])) {
      throw new LockContractError(LOCK_ERROR_CODES.BAD_ENTRY_COUNTS, `entryCounts.${k} must be a non-negative integer`);
    }
  }

  // Provenance commits: 40-hex.
  req("frozenRepoCommit", (v) => typeof v === "string", LOCK_ERROR_CODES.BAD_TYPE, "must be a string");
  if (!HEX40.test(lock.frozenRepoCommit)) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_COMMIT, "frozenRepoCommit must be 40 hex chars");
  }
  req("embeddedEnginePromotedFromCommit", (v) => typeof v === "string", LOCK_ERROR_CODES.BAD_TYPE, "must be a string");
  if (!HEX40.test(lock.embeddedEnginePromotedFromCommit)) {
    throw new LockContractError(LOCK_ERROR_CODES.BAD_COMMIT, "embeddedEnginePromotedFromCommit must be 40 hex chars");
  }

  return lock;
}

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

// Read + parse the lock file, throwing LockContractError(ERR_LOCK_MALFORMED_JSON) on
// unparseable JSON so callers get a deterministic code instead of a raw SyntaxError.
export function loadLock(lockPath = DEFAULT_LOCK) {
  let raw;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch (e) {
    throw new LockContractError("ERR_LOCK_UNREADABLE", lockPath);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new LockContractError("ERR_LOCK_MALFORMED_JSON", lockPath);
  }
}

// Read the lock + artifact from disk and verify. The lock is structurally validated
// (validateLock) BEFORE any artifact I/O, so a malformed/contract-violating lock throws a
// deterministic LockContractError rather than silently driving a hash comparison. Missing
// artifact is a first-class failure (kind "missing"), not an exception. artifactPath
// defaults to the lock's (validated) artifactPath resolved against repoRoot.
export function verifyLegacyBundle({ lockPath = DEFAULT_LOCK, artifactPath, repoRoot = REPO_ROOT } = {}) {
  const lock = validateLock(loadLock(lockPath), { repoRoot });
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
    // Contract violations carry a stable code and exit 2 (deterministic); anything else
    // is an unexpected error, also exit 2, but never leak a stack trace by default.
    if (e instanceof LockContractError) {
      console.error(`lock contract error: ${e.code}`);
    } else {
      console.error(`error: ${e.message || e}`);
    }
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

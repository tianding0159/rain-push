// Adversarial tests for the frozen legacy artifact verifier.
//
// The verifier is the tamper guard that replaces the old engine-to-active-manifest
// parity for the root ZIP: the artifact is frozen (Option B), so instead of proving it
// still matches the live engine we prove it is byte-for-byte the pinned snapshot. These
// tests prove the guard actually catches every mutation mode — a valid buffer passes,
// and each of byte-mutation / wrong-sha / wrong-size / wrong-entry-count / missing fails
// — rather than one weak check silently passing a tampered artifact.
//
// The real committed lock + artifact must also agree (drift gate): if someone edits the
// ZIP or the lock without the other, this file fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Small helper: unique temp dir for lock-file fixtures.
function mkdtempSyncSafe() {
  return mkdtempSync(join(tmpdir(), "p0-0b-lock-"));
}

import {
  verifyBufferAgainstLock,
  verifyLegacyBundle,
  validateLock,
  loadLock,
  gitBlobSha1,
  LockContractError,
  LOCK_ERROR_CODES,
  SUPPORTED_LOCK_FORMAT_VERSION,
  EXPECTED_LIFECYCLE,
  EXPECTED_ARTIFACT_PATH,
} from "./verify-legacy-bundle.mjs";
import { parseZip } from "./gen-bundle-inventory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const LOCK_PATH = join(HERE, "legacy-bundle.lock.json");
const ARTIFACT = join(REPO_ROOT, "rain-push-v7-claude-handoff.zip");

// Derive a correct lock from a buffer, so the "valid" baseline is true by construction
// and each negative test perturbs exactly one dimension.
function lockFromBuffer(buf) {
  const parsed = parseZip(buf);
  return {
    lockFormatVersion: SUPPORTED_LOCK_FORMAT_VERSION,
    lifecycle: "frozen_legacy_artifact",
    artifactPath: "rain-push-v7-claude-handoff.zip",
    sha256: createHash("sha256").update(buf).digest("hex"),
    gitBlobSha1: gitBlobSha1(buf),
    sizeBytes: buf.length,
    entryCounts: {
      central: parsed.totalEntries,
      file: parsed.members.filter((m) => !m.isDir).length,
      directory: parsed.members.filter((m) => m.isDir).length,
    },
    frozenRepoCommit: "a33c66577ed072a021f4b3ec8713baf12a4239af",
    embeddedEnginePromotedFromCommit: "4f168556cc8991d2ce21121dfc7465d3212c0546",
  };
}

const REAL = readFileSync(ARTIFACT);

test("1. valid pass — correct buffer against its own lock", () => {
  const lock = lockFromBuffer(REAL);
  const res = verifyBufferAgainstLock(REAL, lock);
  assert.equal(res.ok, true, JSON.stringify(res.problems));
  assert.equal(res.problems.length, 0);
});

test("2. byte mutation fail — flip one byte in the artifact", () => {
  const lock = lockFromBuffer(REAL);
  const mutated = Buffer.from(REAL);
  // Flip a byte well inside the compressed data (not the EOCD), so size + entry counts
  // stay identical and only the content hashes change.
  mutated[100] = mutated[100] ^ 0xff;
  const res = verifyBufferAgainstLock(mutated, lock);
  assert.equal(res.ok, false);
  const kinds = res.problems.map((p) => p.kind);
  assert.ok(kinds.includes("sha256"), "sha256 must fail on byte mutation");
  assert.ok(kinds.includes("gitBlobSha1"), "gitBlobSha1 must fail on byte mutation");
});

test("3. wrong SHA fail — lock sha256 does not match buffer", () => {
  const lock = lockFromBuffer(REAL);
  lock.sha256 = "0".repeat(64);
  const res = verifyBufferAgainstLock(REAL, lock);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => p.kind === "sha256"));
});

test("4. wrong size fail — lock sizeBytes does not match buffer", () => {
  const lock = lockFromBuffer(REAL);
  lock.sizeBytes = REAL.length + 1;
  const res = verifyBufferAgainstLock(REAL, lock);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => p.kind === "sizeBytes"));
});

test("5. wrong entry count fail — lock central count does not match parsed", () => {
  const lock = lockFromBuffer(REAL);
  lock.entryCounts = { ...lock.entryCounts, central: lock.entryCounts.central + 1 };
  const res = verifyBufferAgainstLock(REAL, lock);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => p.kind === "entryCounts.central"));
});

test("5b. wrong lock format version fail — unsupported version rejected", () => {
  const lock = lockFromBuffer(REAL);
  lock.lockFormatVersion = SUPPORTED_LOCK_FORMAT_VERSION + 1;
  const res = verifyBufferAgainstLock(REAL, lock);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => p.kind === "lockFormatVersion"));
});

test("6. missing artifact fail — artifact path does not exist", () => {
  const res = verifyLegacyBundle({
    lockPath: LOCK_PATH,
    artifactPath: join(REPO_ROOT, "does-not-exist-artifact.zip"),
  });
  assert.equal(res.ok, false);
  assert.equal(res.problems.length, 1);
  assert.equal(res.problems[0].kind, "missing");
});

test("committed lock + real artifact agree (drift gate)", () => {
  assert.ok(existsSync(ARTIFACT), "real artifact must exist");
  const res = verifyLegacyBundle({ lockPath: LOCK_PATH });
  assert.equal(res.ok, true, JSON.stringify(res.problems));
});

// ---- Lock-contract hardening: structural / contract invariants (validateLock) ----
//
// These assert validateLock rejects a malformed or contract-violating lock with a
// deterministic LOCK_ERROR_CODES.* code, BEFORE any artifact hashing. A well-formed lock
// (validLock()) must pass so each negative test perturbs exactly one invariant.

function validLock() {
  return {
    lockFormatVersion: SUPPORTED_LOCK_FORMAT_VERSION,
    lifecycle: EXPECTED_LIFECYCLE,
    artifactPath: EXPECTED_ARTIFACT_PATH,
    sha256: "b".repeat(64),
    gitBlobSha1: "a".repeat(40),
    sizeBytes: 528131,
    entryCounts: { central: 398, file: 333, directory: 65 },
    frozenRepoCommit: "c".repeat(40),
    embeddedEnginePromotedFromCommit: "d".repeat(40),
  };
}

// Assert validateLock throws a LockContractError whose code equals `code`.
function expectCode(mutate, code) {
  const lock = validLock();
  mutate(lock);
  try {
    validateLock(lock);
  } catch (e) {
    assert.ok(e instanceof LockContractError, `expected LockContractError, got ${e}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code}`);
    return;
  }
  assert.fail(`validateLock should have thrown ${code}`);
}

test("validateLock: a well-formed lock passes and is returned", () => {
  const lock = validLock();
  assert.equal(validateLock(lock), lock);
});

test("validateLock: non-object lock -> NOT_OBJECT", () => {
  for (const bad of [null, 42, "x", [1, 2]]) {
    try {
      validateLock(bad);
      assert.fail("should throw");
    } catch (e) {
      assert.equal(e.code, LOCK_ERROR_CODES.NOT_OBJECT);
    }
  }
});

test("validateLock: missing required field -> MISSING_FIELD", () => {
  for (const f of [
    "lockFormatVersion",
    "lifecycle",
    "artifactPath",
    "sha256",
    "gitBlobSha1",
    "frozenRepoCommit",
    "embeddedEnginePromotedFromCommit",
  ]) {
    const lock = validLock();
    delete lock[f];
    try {
      validateLock(lock);
      assert.fail(`should throw for missing ${f}`);
    } catch (e) {
      assert.equal(e instanceof LockContractError, true);
      // version/lifecycle etc. missing surfaces as MISSING_FIELD (version is checked
      // for presence via the `in` guard before value).
      assert.ok(
        [LOCK_ERROR_CODES.MISSING_FIELD].includes(e.code),
        `missing ${f} gave ${e.code}`,
      );
    }
  }
});

test("validateLock: missing entryCounts sub-field -> MISSING_FIELD", () => {
  for (const k of ["central", "file", "directory"]) {
    expectCode((l) => {
      delete l.entryCounts[k];
    }, LOCK_ERROR_CODES.MISSING_FIELD);
  }
});

test("validateLock: unsupported version -> UNSUPPORTED_VERSION", () => {
  expectCode((l) => {
    l.lockFormatVersion = SUPPORTED_LOCK_FORMAT_VERSION + 1;
  }, LOCK_ERROR_CODES.UNSUPPORTED_VERSION);
});

test("validateLock: wrong lifecycle -> BAD_LIFECYCLE", () => {
  expectCode((l) => {
    l.lifecycle = "active";
  }, LOCK_ERROR_CODES.BAD_LIFECYCLE);
});

test("validateLock: wrong artifactPath -> BAD_ARTIFACT_PATH", () => {
  expectCode((l) => {
    l.artifactPath = "some-other.zip";
  }, LOCK_ERROR_CODES.BAD_ARTIFACT_PATH);
});

test("validateLock: absolute artifactPath -> ABSOLUTE_ARTIFACT_PATH", () => {
  expectCode((l) => {
    l.artifactPath = "/etc/passwd";
  }, LOCK_ERROR_CODES.ABSOLUTE_ARTIFACT_PATH);
});

test("validateLock: repo-escaping artifactPath -> ESCAPING_ARTIFACT_PATH", () => {
  expectCode((l) => {
    l.artifactPath = "../../secrets.zip";
  }, LOCK_ERROR_CODES.ESCAPING_ARTIFACT_PATH);
});

test("validateLock: malformed sha256 -> BAD_SHA256", () => {
  for (const bad of ["xyz", "b".repeat(63), "B".repeat(64), "b".repeat(65)]) {
    expectCode((l) => {
      l.sha256 = bad;
    }, LOCK_ERROR_CODES.BAD_SHA256);
  }
});

test("validateLock: malformed gitBlobSha1 -> BAD_BLOB_SHA1", () => {
  for (const bad of ["nothex", "a".repeat(39), "a".repeat(41)]) {
    expectCode((l) => {
      l.gitBlobSha1 = bad;
    }, LOCK_ERROR_CODES.BAD_BLOB_SHA1);
  }
});

test("validateLock: negative / non-integer size -> BAD_SIZE", () => {
  for (const bad of [-1, 1.5, "528131", NaN]) {
    expectCode((l) => {
      l.sizeBytes = bad;
    }, LOCK_ERROR_CODES.BAD_SIZE);
  }
});

test("validateLock: negative / non-integer entry count -> BAD_ENTRY_COUNTS", () => {
  for (const bad of [-1, 2.5, "398"]) {
    expectCode((l) => {
      l.entryCounts.central = bad;
    }, LOCK_ERROR_CODES.BAD_ENTRY_COUNTS);
  }
});

test("validateLock: entryCounts not an object -> BAD_ENTRY_COUNTS", () => {
  expectCode((l) => {
    l.entryCounts = [398, 333, 65];
  }, LOCK_ERROR_CODES.BAD_ENTRY_COUNTS);
});

test("validateLock: malformed commit sha -> BAD_COMMIT", () => {
  expectCode((l) => {
    l.frozenRepoCommit = "notacommit";
  }, LOCK_ERROR_CODES.BAD_COMMIT);
  expectCode((l) => {
    l.embeddedEnginePromotedFromCommit = "z".repeat(40);
  }, LOCK_ERROR_CODES.BAD_COMMIT);
});

test("loadLock: malformed JSON -> ERR_LOCK_MALFORMED_JSON", () => {
  const tmp = mkdtempSyncSafe();
  const p = join(tmp, "bad.json");
  writeFileSync(p, "{ this is not json ");
  try {
    loadLock(p);
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e instanceof LockContractError, true);
    assert.equal(e.code, "ERR_LOCK_MALFORMED_JSON");
  }
});

test("loadLock: unreadable/missing lock -> ERR_LOCK_UNREADABLE", () => {
  try {
    loadLock(join(REPO_ROOT, "no-such-lock-file.json"));
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e instanceof LockContractError, true);
    assert.equal(e.code, "ERR_LOCK_UNREADABLE");
  }
});

test("verifyLegacyBundle: contract violation throws before hashing (deterministic code)", () => {
  const tmp = mkdtempSyncSafe();
  const lockPath = join(tmp, "legacy-bundle.lock.json");
  const lock = validLock();
  lock.lifecycle = "tampered";
  writeFileSync(lockPath, JSON.stringify(lock));
  try {
    verifyLegacyBundle({ lockPath, repoRoot: REPO_ROOT });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.code, LOCK_ERROR_CODES.BAD_LIFECYCLE);
  }
});

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
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyBufferAgainstLock,
  verifyLegacyBundle,
  gitBlobSha1,
  SUPPORTED_LOCK_FORMAT_VERSION,
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

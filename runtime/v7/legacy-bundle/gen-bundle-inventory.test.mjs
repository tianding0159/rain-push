// Tests for the P0-0B legacy bundle inventory generator.
//
// These test the CLASSIFICATION + PARSE TOOLING (gen-bundle-inventory.mjs), not the
// engine. Classification is exercised against synthetic throwaway git repos so the four
// buckets and edge cases (symlink, dirty worktree, same-path drift) are deterministic and
// independent of the real bundle's evolving content.
//
// Coverage (maps to the P0-0B audit requirements):
//   1. --check still passes after the inventory artifacts are themselves tracked
//      (self-reference is broken because we index a FIXED base ref, not the worktree).
//   2. same_path_different_content is classified correctly (source EXISTS, content drifted)
//      — distinct from no_tracked_path — and exact/ambiguous buckets are correct too.
//   3. Fixed base ref: a dirty working tree does not change classification.
//   4. Symlinks are skipped, never treated as regular tracked content.
//   5. Parsed central-directory member count must equal the EOCD totalEntries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  parseZip,
  buildInventory,
  buildSourceMap,
  trackedByContentSha,
  BASE_REF,
} from "./gen-bundle-inventory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const REAL_ZIP = join(REPO_ROOT, "rain-push-v7-claude-handoff.zip");
const SCRIPT = join(HERE, "gen-bundle-inventory.mjs");

const sha256 = (s) => createHash("sha256").update(Buffer.from(s)).digest("hex");

// Build a throwaway git repo with the given { path: content } files, commit it, and
// return { dir, ref }. Symlinks are declared separately as { linkPath: target }.
function makeRepo(files, symlinks = {}) {
  const dir = mkdtempSync(join(tmpdir(), "p0-0b-test-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    });
  git("init", "-q");
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  for (const [link, target] of Object.entries(symlinks)) {
    const abs = join(dir, link);
    mkdirSync(dirname(abs), { recursive: true });
    symlinkSync(target, abs);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  const ref = git("rev-parse", "HEAD").toString().trim();
  return { dir, ref, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// Fake inventory: buildSourceMap only reads .members[{isDir,path,sha256,uncompressedBytes}].
function inv(members) {
  return { fileMembers: members.filter((m) => !m.isDir).length, members };
}

test("1. --check passes after inventory artifacts are tracked (fixed base ref breaks self-reference)", () => {
  // The committed artifacts live under runtime/v7/legacy-bundle/. Because classification
  // reads BASE_REF (which predates them), they must NOT appear in the tracked index —
  // otherwise adding them would make --check drift against itself.
  const { paths, count } = trackedByContentSha(BASE_REF, REPO_ROOT);
  assert.equal(count, 97, "base ref indexes exactly its 97 tracked files");
  for (const p of paths) {
    assert.ok(
      !p.startsWith("runtime/v7/legacy-bundle/"),
      `base ref must not contain this script's own artifacts, found: ${p}`,
    );
  }
  // End-to-end: the CLI --check exits 0 against the committed artifacts even though the
  // worktree already contains the (untracked-at-base) legacy-bundle files.
  const out = execFileSync("node", [SCRIPT, "--check"], { cwd: REPO_ROOT }).toString();
  assert.match(out, /inventory \+ source-map are current/);
});

test("2. four-bucket classification: exact / same-path-diff / ambiguous / no-tracked-path", () => {
  const { dir, ref, cleanup } = makeRepo({
    "keep/exact.md": "EXACT-CONTENT",
    "README.md": "TRACKED-README-CONTENT",
    "dup/a.txt": "SHARED",
    "dup/b.txt": "SHARED",
  });
  try {
    const members = [
      // identical content to keep/exact.md -> exact_content_match
      { isDir: false, path: "keep/exact.md", sha256: sha256("EXACT-CONTENT"), uncompressedBytes: 13 },
      // same path as README.md but different content -> same_path_different_content
      { isDir: false, path: "README.md", sha256: sha256("BUNDLE-README-DIFFERENT"), uncompressedBytes: 23 },
      // content shared by two tracked blobs -> ambiguous_content_match
      { isDir: false, path: "whatever/x.txt", sha256: sha256("SHARED"), uncompressedBytes: 6 },
      // neither content nor path exists -> no_tracked_path
      { isDir: false, path: "handoff/ghost.md", sha256: sha256("NOWHERE"), uncompressedBytes: 7 },
      // dir members are ignored
      { isDir: true, path: "handoff/", sha256: null },
    ];
    const sm = buildSourceMap(inv(members), ref, dir);
    assert.deepEqual(sm.counts, {
      exact_content_match: 1,
      same_path_different_content: 1,
      ambiguous_content_match: 1,
      no_tracked_path: 1,
    });
    assert.equal(sm.exact_content_match[0].source, "keep/exact.md");
    assert.equal(sm.same_path_different_content[0].zipPath, "README.md");
    assert.deepEqual(sm.ambiguous_content_match[0].sources, ["dup/a.txt", "dup/b.txt"]);
    assert.equal(sm.no_tracked_path[0].zipPath, "handoff/ghost.md");
  } finally {
    cleanup();
  }
});

test("3. fixed base ref: a dirty working tree does not change classification", () => {
  const { dir, ref, cleanup } = makeRepo({
    "a.md": "ORIGINAL",
  });
  try {
    const members = [
      { isDir: false, path: "a.md", sha256: sha256("ORIGINAL"), uncompressedBytes: 8 },
    ];
    const before = buildSourceMap(inv(members), ref, dir);
    assert.equal(before.counts.exact_content_match, 1);

    // Mutate the worktree: overwrite the file AND add an untracked file. If the indexer
    // read the worktree, the exact match would break. It must not, because it reads `ref`.
    writeFileSync(join(dir, "a.md"), "MUTATED-IN-WORKTREE");
    writeFileSync(join(dir, "untracked.md"), "ORIGINAL"); // same content, but not committed

    const after = buildSourceMap(inv(members), ref, dir);
    assert.deepEqual(after.counts, before.counts, "dirty worktree must not shift buckets");
    assert.equal(after.exact_content_match[0].source, "a.md");
  } finally {
    cleanup();
  }
});

test("4. symlinks are skipped, never treated as regular tracked content", () => {
  const { dir, ref, cleanup } = makeRepo(
    { "real.txt": "TARGET-BODY" },
    { "link.txt": "real.txt" }, // symlink whose blob content is the string "real.txt"
  );
  try {
    const { byHash, paths, symlinksSkipped } = trackedByContentSha(ref, dir);
    assert.equal(symlinksSkipped, 1, "the one symlink must be counted as skipped");
    assert.ok(!paths.has("link.txt"), "symlink path must not be in the regular-file index");
    // A member whose content equals the symlink's blob body ("real.txt") must NOT match.
    const members = [
      { isDir: false, path: "link.txt", sha256: sha256("real.txt"), uncompressedBytes: 8 },
    ];
    const sm = buildSourceMap(inv(members), ref, dir);
    assert.equal(sm.counts.exact_content_match, 0, "symlink content must not produce a match");
    // link.txt path is absent from the index, so it falls to no_tracked_path.
    assert.equal(sm.counts.no_tracked_path, 1);
    assert.ok(!byHash.has(sha256("real.txt")) || !byHash.get(sha256("real.txt")).includes("link.txt"));
  } finally {
    cleanup();
  }
});

test("5. parsed member count must equal EOCD totalEntries", () => {
  const buf = readFileSync(REAL_ZIP);
  // Positive: the real bundle parses and the counts agree.
  const { totalEntries, members } = parseZip(buf);
  assert.equal(members.length, totalEntries);
  assert.equal(totalEntries, 398);
  const inventory = buildInventory(REAL_ZIP);
  assert.equal(inventory.memberCount, inventory.totalCentralEntries);

  // Negative: corrupt the EOCD totalEntries field -> parseZip must throw, not silently
  // under/over-count. Locate the EOCD and bump its 16-bit totalEntries by one.
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0);
  const corrupt = Buffer.from(buf);
  corrupt.writeUInt16LE(totalEntries + 1, eocd + 10);
  assert.throws(() => parseZip(corrupt), /member count mismatch/);
});

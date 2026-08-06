// Adversarial tests for the engine bundle parity verifier.
//
// The verifier is the lock that keeps the legacy handoff bundle's embedded engine from
// silently drifting from the manifest SSOT. These tests prove the lock actually
// catches every drift mode — valid passes, and each of missing / extra / mismatch
// fails — rather than the guard living only as an inline node -e in the workflow.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyBundleParity } from "../verify-engine-bundle-parity.mjs";

const sha = (s) => createHash("sha256").update(Buffer.from(s)).digest("hex");

// Build a small on-disk engine tree plus a matching manifest object. The tree and the
// manifest agree by construction; individual tests then perturb one side.
function makeTree() {
  const root = mkdtempSync(join(tmpdir(), "parity-"));
  const spec = [
    { path: "a.txt", body: "alpha\n" },
    { path: "b.txt", body: "beta\n" },
    { path: "sub/c.txt", body: "gamma\n" },
  ];
  for (const f of spec) {
    const p = join(root, f.path);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, f.body);
  }
  const manifest = {
    manifestFormatVersion: 1,
    files: spec.map((f) => ({
      path: f.path,
      sha256: sha(f.body),
      bytes: Buffer.byteLength(f.body),
    })),
  };
  return { root, manifest, spec };
}

test("valid bundle passes with no problems", () => {
  const { root, manifest } = makeTree();
  try {
    const res = verifyBundleParity(manifest, root);
    assert.equal(res.ok, true);
    assert.deepEqual(res.problems, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing file fails (manifest lists a file the bundle lacks)", () => {
  const { root, manifest } = makeTree();
  try {
    unlinkSync(join(root, "b.txt")); // drop a file the manifest still expects
    const res = verifyBundleParity(manifest, root);
    assert.equal(res.ok, false);
    assert.ok(
      res.problems.some((p) => p.kind === "MISSING" && p.path === "b.txt"),
      "expected a MISSING problem for b.txt",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extra file fails (bundle carries a file the manifest does not list)", () => {
  const { root, manifest } = makeTree();
  try {
    writeFileSync(join(root, "sneaky.txt"), "unlisted\n");
    const res = verifyBundleParity(manifest, root);
    assert.equal(res.ok, false);
    assert.ok(
      res.problems.some((p) => p.kind === "EXTRA" && p.path === "sneaky.txt"),
      "expected an EXTRA problem for sneaky.txt",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SHA mismatch fails (bundle file content diverges from the manifest)", () => {
  const { root, manifest } = makeTree();
  try {
    writeFileSync(join(root, "a.txt"), "TAMPERED\n"); // same path, different bytes
    const res = verifyBundleParity(manifest, root);
    assert.equal(res.ok, false);
    assert.ok(
      res.problems.some((p) => p.kind === "MISMATCH" && p.path === "a.txt"),
      "expected a MISMATCH problem for a.txt",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

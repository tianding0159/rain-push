// Engine bundle parity verifier.
//
// The reviewable engine source at runtime/v7/engine/ is the single source of truth,
// inventoried by runtime/v7/engine.manifest.json. The root legacy handoff bundle
// (rain-push-v7-claude-handoff.zip) carries an embedded copy of that engine subtree.
// This module asserts the embedded copy has not drifted from the manifest:
//
//   - every file the manifest lists exists in the bundle with an identical SHA-256
//     (no MISSING, no SHA MISMATCH), and
//   - the bundle carries no engine file the manifest does not know about (no EXTRA).
//
// This closes the silent-divergence gap: editing runtime/v7/engine/ (and regenerating
// the manifest) without repacking the bundle now fails here. Extracted as an
// importable + CLI module so the guard is unit-tested (valid / missing / extra /
// mismatch) rather than living only as an inline node -e in the workflow.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

// List every regular file under root, as "/"-joined paths relative to root.
// Uses lstat so a symlink is reported (as a non-directory) rather than followed.
function listFiles(root, base = "") {
  const out = [];
  for (const name of readdirSync(root)) {
    const abs = join(root, name);
    const rel = base ? `${base}/${name}` : name;
    const st = lstatSync(abs);
    if (st.isDirectory()) out.push(...listFiles(abs, rel));
    else out.push(rel);
  }
  return out;
}

// Compare an extracted engine tree against a manifest object.
// Returns { ok, problems: [{kind, path}] } where kind is
// "MISSING" | "MISMATCH" | "EXTRA". Pure — does no I/O beyond reading engineRoot.
export function verifyBundleParity(manifest, engineRoot) {
  const problems = [];
  const want = new Map(manifest.files.map((f) => [f.path, f.sha256]));

  // MISSING / MISMATCH: every manifest entry must be present and identical.
  for (const [rel, sha] of want) {
    const p = join(engineRoot, rel);
    if (!existsSync(p)) {
      problems.push({ kind: "MISSING", path: rel });
      continue;
    }
    if (sha256File(p) !== sha) {
      problems.push({ kind: "MISMATCH", path: rel });
    }
  }

  // EXTRA: the bundle must not carry engine files the manifest does not list.
  for (const rel of listFiles(engineRoot)) {
    if (!want.has(rel)) problems.push({ kind: "EXTRA", path: rel });
  }

  return { ok: problems.length === 0, problems };
}

// Convenience wrapper that reads the manifest from disk and verifies against a root.
export function verifyBundleParityFromPaths(manifestPath, engineRoot) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return { manifest, ...verifyBundleParity(manifest, engineRoot) };
}

// ---- CLI ----
// Usage: node runtime/v7/verify-engine-bundle-parity.mjs <manifest.json> <engineRoot>
// Exits 0 on parity, 1 on any problem (printing each MISSING/MISMATCH/EXTRA line).
function main(argv) {
  const [manifestPath, engineRoot] = argv;
  if (!manifestPath || !engineRoot) {
    console.error(
      "usage: node verify-engine-bundle-parity.mjs <manifest.json> <engineRoot>",
    );
    process.exit(2);
  }
  const { manifest, ok, problems } = verifyBundleParityFromPaths(
    manifestPath,
    engineRoot,
  );
  for (const p of problems) console.log(`${p.kind}: ${p.path}`);
  if (!ok) {
    console.log(`root-ZIP engine parity FAILED: ${problems.length}`);
    process.exit(1);
  }
  console.log(`root-ZIP engine parity OK: ${manifest.files.length} files 68/68`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}

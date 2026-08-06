// Engine archive parity verifier.
//
// The reviewable engine source at runtime/v7/engine/ is the single source of truth,
// inventoried by runtime/v7/engine.manifest.json and packaged by
// runtime/v7/build-engine-archive.mjs into the deterministic engine archive
// (runtime/v7/dist/rain-push-v7-engine.zip). This module asserts an EXTRACTED engine
// tree matches the manifest exactly:
//
//   - every file the manifest lists exists in the tree with an identical SHA-256
//     (no MISSING, no SHA MISMATCH), and
//   - the tree carries no engine file the manifest does not know about (no EXTRA).
//
// AUTHORITY CHAIN it protects (see MIGRATION.md / RECOMMENDATION.md §5):
//   runtime/v7/engine/ (source) -> engine.manifest.json -> deterministic engine archive.
// CI builds the archive, extracts it, and runs this verifier over the extraction, so the
// generated archive is proven to round-trip the manifest 68/68. It is unit-tested (valid
// / missing / extra / mismatch) rather than living only as an inline node -e.
//
// NOTE: this verifier is intentionally decoupled from the FROZEN legacy bundle
// (rain-push-v7-claude-handoff.zip). That artifact is frozen (Option B) and no longer
// tracks the live engine; its tamper guard is legacy-bundle/verify-legacy-bundle.mjs,
// which pins identity against legacy-bundle/legacy-bundle.lock.json.

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
    console.log(`engine archive parity FAILED: ${problems.length}`);
    process.exit(1);
  }
  console.log(`engine archive parity OK: ${manifest.files.length}/${manifest.files.length} files`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}

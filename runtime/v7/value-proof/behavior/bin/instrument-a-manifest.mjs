#!/usr/bin/env node
// P1-1E — emit the Instrument A identity manifest + original-50 validation & fingerprint.
// GATE: if the manifest cannot be resolved, exits with INSTRUMENT_A_IDENTITY_UNRESOLVED.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { buildInstrumentAManifest, matchClass } from "../lib/instrument-a-manifest.mjs";
import { validateAnnotations, fingerprintAnnotations } from "../lib/instrument-a-validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const REF50 = join(V7, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200-a");
const OUT_COMMITTED = join(HERE, "..", "discovery-200-a");

const sha = (s) => createHash("sha256").update(s).digest("hex");

// committed form must not leak internal infra host — hash it.
function safeModelIdentity(m) {
  return { ...m, proxyHost: m.proxyHost ? `sha256:${sha(m.proxyHost)}` : null };
}

function assertCommittedSafe(str) {
  const cjk = str.match(/[\u4e00-\u9fff]/g);
  const hex64 = str.match(/\b[0-9a-f]{64}\b/g);
  // NOTE: protocolHash / guideFingerprint / fingerprints ARE 64-hex and legitimate integrity digests
  // (whole-artifact, not per-record de-anonymizers) — same allowance P1-1C/P1-1D used. We only forbid
  // CJK here; hex64 is expected. Verbatim text/evidence is forbidden and checked by absence of fields.
  if (cjk) { process.stderr.write(`refusing committed manifest: ${cjk.length} CJK char(s)\n`); process.exit(2); }
  return { cjk: 0, hex64: (hex64 || []).length };
}

function main() {
  if (!existsSync(REF50)) { process.stderr.write("missing original-50 reference\n"); process.exit(1); }
  const manifest = buildInstrumentAManifest();
  const cls = matchClass(manifest);

  if (cls === "INSTRUMENT_A_IDENTITY_UNRESOLVED") {
    process.stdout.write(canonicalJson({ status: "INSTRUMENT_A_IDENTITY_UNRESOLVED", guideMissing: manifest.guideMissing, protocolDocMissing: manifest.protocolDocMissing }));
    process.exit(3);
  }

  const ref50 = JSON.parse(readFileSync(REF50, "utf8")).annotations;
  const validation = validateAnnotations(ref50);
  const fp50 = fingerprintAnnotations(ref50);

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  // private manifest: full detail incl. raw proxy host and per-record fingerprints.
  writeFileSync(join(OUT_PRIVATE, "instrument-a-manifest.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT",
    matchClass: cls,
    manifest,
    original50Validation: validation,
    original50Fingerprint: fp50,
  }));

  // committed-safe manifest: proxy host hashed, per-record fingerprints dropped (keep combined only).
  const committed = canonicalJson({
    visibility: "committed_safe",
    stage: "P1-1E",
    matchClass: cls,
    instrumentADefinition: manifest.instrumentADefinition,
    protocolVersion: manifest.protocolVersion,
    protocolHash: manifest.protocolHash,
    guideFreezeVersion: manifest.guideFreezeVersion,
    guideFingerprint: manifest.guideFingerprint,
    protocolDocHashes: manifest.protocolDocHashes,
    modelIdentity: safeModelIdentity(manifest.modelIdentity),
    ruleVocabularies: manifest.ruleVocabularies,
    canonicalizationRules: manifest.canonicalizationRules,
    resolvable: manifest.resolvable,
    original50: { n: validation.n, valid: validation.valid, violationCount: validation.violationCount, fingerprint: fp50.combined },
  });
  const guard = assertCommittedSafe(committed);
  writeFileSync(join(OUT_COMMITTED, "instrument-a-manifest.aggregate.json"), committed);

  process.stdout.write(canonicalJson({
    status: "INSTRUMENT_A_IDENTITY_RESOLVED",
    matchClass: cls,
    protocolHash: manifest.protocolHash,
    guideFingerprint: manifest.guideFingerprint,
    original50Valid: validation.valid,
    original50ViolationCount: validation.violationCount,
    original50Fingerprint: fp50.combined,
    committedGuard: guard,
  }));
}

main();

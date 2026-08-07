#!/usr/bin/env node
// P1-1E §1 — emit the freeze-conditions lock (private + committed-safe).

import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { buildFreezeLock, verifyFreezeLock } from "../lib/freeze-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT_PRIVATE = join(ROOT, "private", "behavior-200-a");
const OUT_COMMITTED = join(HERE, "..", "discovery-200-a");
const sha = (s) => createHash("sha256").update(s).digest("hex");

function main() {
  const lock = buildFreezeLock();
  const self = verifyFreezeLock(lock);
  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  // private: full lock incl. raw corpus path (which carries the character name).
  writeFileSync(join(OUT_PRIVATE, "freeze-lock.private.json"), canonicalJson({ visibility: "PRIVATE_DO_NOT_COMMIT", selfVerify: self, ...lock }));

  // committed-safe: strip the raw corpus PATH (character name); keep its integrity hash + line count.
  const rawCorpusSafe = { sha256: lock.rawCorpus?.sha256 ?? null, lines: lock.rawCorpus?.lines ?? null };
  const committed = canonicalJson({
    visibility: "committed_safe", stage: "P1-1E",
    freezeLockVersion: lock.freezeLockVersion,
    guideFreezeVersion: lock.guideFreezeVersion,
    guideFingerprint: lock.guideFingerprint,
    thresholdSourceHashes: lock.thresholdSourceHashes,
    hypothesisSourceHashes: lock.hypothesisSourceHashes,
    holdoutSplitCounts: lock.holdoutSplitCounts,
    holdoutSplitHash: lock.holdoutSplitHash,
    seeds: lock.seeds,
    rawCorpus: rawCorpusSafe,
    lockHash: lock.lockHash,
    resolvable: lock.resolvable,
    selfVerifyOk: self.ok,
  });
  const cjk = committed.match(/[\u4e00-\u9fff]/g);
  if (cjk) { process.stderr.write(`refusing committed freeze lock: ${cjk.length} CJK\n`); process.exit(2); }
  writeFileSync(join(OUT_COMMITTED, "freeze-lock.aggregate.json"), committed);

  process.stdout.write(canonicalJson({
    status: lock.resolvable && self.ok ? "FREEZE_LOCK_ESTABLISHED" : "FREEZE_LOCK_UNRESOLVED",
    lockHash: lock.lockHash, guideFingerprint: lock.guideFingerprint,
    holdoutSplit: lock.holdoutSplitCounts, selfVerifyOk: self.ok, drift: self.drift,
  }));
}
main();

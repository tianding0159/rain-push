#!/usr/bin/env node
// P1-1C §17-18 — holdout validation + E3 survival.
// Order is enforced: the frozen 160 grammar (counterexample-density.aggregate.json) MUST already exist
// — it is the pre-holdout freeze. Only then do we open the SEALED 40-record holdout. Enforces guide
// freeze too. This is the ONE bin that reads the holdout; nothing upstream may.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { GRAMMAR_CANDIDATES } from "../lib/counterexample.mjs";
import { runHoldoutValidation } from "../lib/holdout-validation.mjs";
import { enforceFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const ANN_160 = join(V7, "private", "behavior-200", "annotation.private.json");
const HOLDOUT = join(V7, "private", "behavior-200", "holdout-40.private.json");
const FROZEN = join(HERE, "..", "discovery-200", "counterexample-density.aggregate.json");
const FREEZE = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");
const OUT_PRIVATE = join(V7, "private", "behavior-200");
const OUT_COMMITTED = join(HERE, "..", "discovery-200");

function main() {
  for (const p of [ANN_160, HOLDOUT, FROZEN, FREEZE]) {
    if (!existsSync(p)) { process.stderr.write(`missing ${p}\n`); process.exit(1); }
  }
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8"));
  const { ok, freezeCheck } = enforceFreeze(freeze);
  if (!ok) { process.stdout.write(canonicalJson({ status: "GUIDE_FREEZE_BROKEN", freezeCheck }) + "\n"); process.exit(2); }

  const discovery160 = JSON.parse(readFileSync(ANN_160, "utf8")).annotations;
  const frozenGrammar = JSON.parse(readFileSync(FROZEN, "utf8")); // { candidates: [...] } computed pre-holdout
  const holdoutFile = JSON.parse(readFileSync(HOLDOUT, "utf8"));
  const holdout = holdoutFile.annotations;

  // sanity: the holdout must be disjoint from the discovery set (no leakage).
  const discLinks = new Set(discovery160.map((a) => a.linkId));
  const leaked = holdout.filter((a) => discLinks.has(a.linkId)).map((a) => a.linkId);
  if (leaked.length > 0) {
    process.stdout.write(canonicalJson({ status: "BEHAVIOR_200_HOLDOUT_FAILED", reason: "holdout leaked into discovery", leakedCount: leaked.length }) + "\n");
    process.exit(3);
  }

  const result = runHoldoutValidation({ candidates: GRAMMAR_CANDIDATES, discovery160, holdout, frozenGrammar });
  if (result.status !== "HOLDOUT_VALIDATED") {
    process.stdout.write(canonicalJson({ status: "BEHAVIOR_200_HOLDOUT_FAILED", ...result }) + "\n");
    process.exit(4);
  }

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  writeFileSync(join(OUT_PRIVATE, "holdout-validation.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT", ...result,
  }) + "\n");

  // committed-safe: the validation result already carries only ids/counts/verdicts (no links/hashes).
  writeFileSync(join(OUT_COMMITTED, "holdout-validation.aggregate.json"), canonicalJson({
    visibility: "committed_safe", verbatimFree: true, stage: "P1-1C-200",
    guideFreezeVersion: freeze.guideFreezeVersion,
    note: "Grammar verdicts on the 160 discovery set were frozen (counterexample-density.aggregate.json) BEFORE the sealed 40-record holdout was opened. E3 survival requires >=8 unique support, >=3 counterexamples examined, holdout confirmation, and no weak/prior domination. E3 = 'candidate for human review', not 'confirmed'.",
    ...result,
  }) + "\n");

  process.stdout.write(canonicalJson({
    status: "HOLDOUT_200_READY",
    holdoutRollup: result.holdoutRollup,
    e3Rollup: result.e3Rollup,
    survivors: result.survivors,
    perCandidate: result.e3Survival.map((r) => ({ id: r.candidateId, holdout: r.holdoutVerdict, e3: r.verdict, failed: r.failedClauses })),
  }) + "\n");
}

main();

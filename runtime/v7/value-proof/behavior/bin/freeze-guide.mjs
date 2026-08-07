#!/usr/bin/env node
// P1-1C §4 — capture the guide-freeze snapshot at the start of the 200-record stage.
//
// Writes a COMMITTED-SAFE freeze snapshot (hashes + enum names only, no verbatim) to
// behavior/discovery-200/guide-freeze.aggregate.json. Every subsequent 200-stage driver enforces
// the freeze against this snapshot and aborts with GUIDE_FREEZE_BROKEN on a structural change.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { captureFreeze } from "../lib/guide-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "discovery-200", "guide-freeze.aggregate.json");

const freeze = captureFreeze();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, canonicalJson({ visibility: "committed_safe", verbatimFree: true, ...freeze }) + "\n");

process.stdout.write(canonicalJson({
  status: "GUIDE_FROZEN",
  guideFreezeVersion: freeze.guideFreezeVersion,
  fingerprint: freeze.fingerprint,
  artifacts: Object.keys(freeze.perArtifact),
  vocabSections: Object.keys(freeze.vocabEnums).length,
}) + "\n");

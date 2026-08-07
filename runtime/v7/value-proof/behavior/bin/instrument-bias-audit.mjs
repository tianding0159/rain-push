#!/usr/bin/env node
// P1-1D — Annotation Instrument Bias Audit driver.
// Runs Instrument B (heuristic) on the same 50 hand-annotated (Instrument A) records and emits the
// full paired bias audit. Does NOT re-annotate the 200, does NOT touch the engine, does NOT run grammar.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { runInstrumentBiasAudit } from "../lib/instrument-bias-synthesis.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V7 = join(HERE, "..", "..");
const REF = join(V7, "private", "pilot-50", "grammar", "round-a.refined.private.json");
const OUT_PRIVATE = join(V7, "private", "behavior-1d");
const OUT_COMMITTED = join(HERE, "..", "discovery-1d");

// strip any verbatim/id-bearing fields for the committed form: drop *Ids arrays and any `text`.
function stripForCommit(node) {
  if (Array.isArray(node)) return node.map(stripForCommit);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "text" || k === "textualEvidence") continue;                 // verbatim
      if (/Ids$/.test(k) && Array.isArray(v)) { out[k + "Count"] = v.length; continue; } // ids → count
      out[k] = stripForCommit(v);
    }
    return out;
  }
  return node;
}

function main() {
  if (!existsSync(REF)) { process.stderr.write(`missing reference ${REF}\n`); process.exit(1); }
  const ref = JSON.parse(readFileSync(REF, "utf8")).annotations;
  const audit = runInstrumentBiasAudit(ref);

  mkdirSync(OUT_PRIVATE, { recursive: true });
  mkdirSync(OUT_COMMITTED, { recursive: true });

  // private: full audit including any id arrays (link-bearing).
  writeFileSync(join(OUT_PRIVATE, "instrument-bias.private.json"), canonicalJson({
    visibility: "PRIVATE_DO_NOT_COMMIT",
    design: "paired: Instrument B (heuristic) run on the same 50 records Instrument A (hand) annotated; A is the reference; every A-vs-B delta on identical input is a measured instrument effect, not a character effect.",
    ...audit,
  }) + "\n");

  // committed-safe: verbatim-free, ids → counts.
  const safe = stripForCommit(audit);
  const committed = canonicalJson({
    visibility: "committed_safe", verbatimFree: true, stage: "P1-1D",
    design: "paired A-vs-B on the identical 50 pilot records; A (hand) is the reference measurement, B (heuristic) is the device under test.",
    note: "Bias here is an INSTRUMENT property measured against the hand reference, not a character claim. Severities are magnitudes of the A-vs-B gap on identical input.",
    ...safe,
  }) + "\n";
  // fail-closed: committed artifact must carry no CJK and no record-hash-like 64-hex tokens.
  const cjk = committed.match(/[\u4e00-\u9fff]/g);
  const hex64 = committed.match(/\b[0-9a-f]{64}\b/g);
  if (cjk) { process.stderr.write(`refusing to write committed artifact: ${cjk.length} CJK char(s) present\n`); process.exit(2); }
  if (hex64) { process.stderr.write(`refusing to write committed artifact: ${hex64.length} record-hash-like token(s) present\n`); process.exit(2); }
  writeFileSync(join(OUT_COMMITTED, "instrument-bias.aggregate.json"), committed);

  process.stdout.write(canonicalJson({
    status: audit.stopRule.status === "BIAS_ACCEPTABLE" ? "INSTRUMENT_BIAS_AUDIT_READY" : "INSTRUMENT_BIAS_TOO_HIGH",
    n: audit.n,
    actionDetectionRatio: audit.actionBias.netDetectionRatio,
    triggerAgreement: audit.triggerBias.domainAgreementRate,
    revealSurvivalRate: audit.maskBias.revealSurvivalRate,
    mostReliableLayer: audit.heatmap.mostReliableLayer.layer,
    leastReliableLayer: audit.heatmap.leastReliableLayer.layer,
    top3Bias: audit.priority.slice(0, 3).map((p) => p.biasType),
    fragileSurvivors: audit.stopRule.fragileSurvivors,
    biasStatus: audit.stopRule.status,
    proceed: audit.stopRule.proceed,
  }) + "\n");
}

main();

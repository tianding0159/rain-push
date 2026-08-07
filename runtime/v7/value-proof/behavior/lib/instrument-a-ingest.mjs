// P1-1E — ingest Instrument A annotations returned by an isolated session, validate them against the
// frozen protocol, and assemble the UNIFIED_A_200 pool. This is the RESUME side of the isolation kit:
// the isolated session produces annotation-a-110.json (and later annotation-a-holdout-40.json); this
// module checks they cover exactly the expected records, sit inside the frozen vocabulary, carry only
// Round-A grades, and are genuinely Instrument A (annotator/nature/provenance stamped), then merges
// them with the untouched original 50 into UNIFIED_A_200.

import { readFileSync } from "node:fs";
import { validateAnnotations } from "./instrument-a-validate.mjs";

function readAnnArray(pathOrObj) {
  const d = typeof pathOrObj === "string" ? JSON.parse(readFileSync(pathOrObj, "utf8")) : pathOrObj;
  return d.annotations || d.records || (Array.isArray(d) ? d : []);
}

// Stamp/normalize an ingested annotation as Instrument A. We ENFORCE the provenance fields rather than
// trusting the isolated session to set them, so the unified pool is unambiguously single-instrument.
function stampA(rec) {
  return {
    ...rec,
    annotator: "claude(model_assisted_research)",
    round: "A",
    modelSuggested: true,
    annotationNature: "model_assisted_research_annotation",
    annotationProvenance: "instrument_a_reannotation_p1_1e",
    linkId: rec.linkId || rec.recordHash,
  };
}

// Coverage check: ingested set must annotate EXACTLY the expected presentationIds — no missing, no
// extra, no duplicates. Prevents a partial or drifted return from silently entering the pool.
export function checkCoverage(ingested, expectedIds) {
  const got = ingested.map((r) => r.presentationId);
  const gotSet = new Set(got);
  const expSet = new Set(expectedIds);
  const duplicates = got.filter((id, i) => got.indexOf(id) !== i);
  const missing = expectedIds.filter((id) => !gotSet.has(id));
  const extra = got.filter((id) => !expSet.has(id));
  return {
    ok: missing.length === 0 && extra.length === 0 && duplicates.length === 0,
    expected: expectedIds.length, got: gotSet.size,
    missing, extra, duplicates: [...new Set(duplicates)],
  };
}

// Full ingest of one returned batch (e.g. the 110 discovery, or the 40 holdout).
export function ingestBatch({ returned, expectedIds, base } = {}) {
  const arr = readAnnArray(returned).map(stampA);
  const coverage = checkCoverage(arr, expectedIds);
  const validation = validateAnnotations(arr, { base });
  // provenance sanity: none may be carried-50 or heuristic B.
  const badProvenance = arr.filter((r) => /carried_from_refined_50|heuristic/.test(r.annotationProvenance) || /heuristic/.test(r.annotator || "")).map((r) => r.presentationId);
  return {
    n: arr.length,
    coverage,
    validation: { valid: validation.valid, violationCount: validation.violationCount, violations: validation.violations },
    badProvenance,
    ok: coverage.ok && validation.valid && badProvenance.length === 0,
    annotations: arr,
  };
}

// Assemble UNIFIED_A_200 = original 50 (UNTOUCHED) + 110 discovery-A + 40 holdout-A.
// Enforces: original 50 unchanged (caller passes them through verbatim), B excluded, 160/40 split
// preserved, exactly 200 unique records.
export function assembleUnifiedA200({ original50, discovery110A, holdout40A, splitBySelection }) {
  const all = [...original50, ...discovery110A, ...holdout40A];
  const ids = all.map((r) => r.presentationId);
  const uniqueIds = new Set(ids);
  const anyB = all.filter((r) => /heuristic/.test(r.annotator || "") || r.annotationProvenance === "heuristic_200").map((r) => r.presentationId);

  // split assignment comes from the frozen selection, not from the annotation source.
  const discovery = all.filter((r) => splitBySelection.get(r.presentationId) === "discovery");
  const holdout = all.filter((r) => splitBySelection.get(r.presentationId) === "holdout");

  return {
    total: all.length,
    uniqueCount: uniqueIds.size,
    duplicates: ids.length - uniqueIds.size,
    discoveryCount: discovery.length,
    holdoutCount: holdout.length,
    containsB: anyB.length > 0,
    bIds: anyB,
    ok: all.length === 200 && uniqueIds.size === 200 && discovery.length === 160 && holdout.length === 40 && anyB.length === 0,
    pool: all,
    discovery,
    holdout,
  };
}

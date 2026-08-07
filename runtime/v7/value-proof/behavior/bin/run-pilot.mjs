#!/usr/bin/env node
// Pilot runner CLI (directive §9 stage 1-2, §16).
//
// Subcommands:
//   audit            — phase-1 clean audit → text-free JSON on stdout (or --out dir).
//   pilot-private    — build the PRIVATE review pack (with text) into private/ ONLY.
//   pilot-skeleton   — build the PUBLIC no-text annotation skeleton (safe to commit).
//   consistency <r1> <r2>  — inter-round consistency + §14 gates from two filled skeletons.
//   validate <ann>         — schema + cross-field validation of filled annotations.
//   hypotheses <ann>       — evaluate H1-H7 from filled annotations.
//   derive <ann>           — derive candidate patterns → private/behavior-patterns.private.json.
//   patterns-validate <p>  — schema + E3/E4 grade-gate validation of a pattern set.
//   summary          — text-free committed summary (audit + pilot meta + hypotheses if present).
//
// The raw corpus resolves via lib/raw-corpus.mjs (gitignored path or env var). If absent, every
// subcommand reports PROVENANCE_BLOCKED and exits 0 (not an error — just no data yet).
//
// Determinism: all JSON is canonicalized (sorted keys). No clock/network/random beyond the
// fixed-seed pilot selection.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, readJson } from "../../../corpus/lib/io.mjs";
import { loadRawCorpus, RAW_STATUS } from "../lib/raw-corpus.mjs";
import { auditCorpus } from "../lib/clean-audit.mjs";
import { buildPrivatePack, buildPublicSkeleton, PILOT_SEED } from "../lib/pilot-pack.mjs";
import { consistencyReport } from "../lib/consistency.mjs";
import { evaluateHypotheses } from "../lib/hypotheses.mjs";
import { validateAnnotationBatch } from "../lib/annotation.mjs";
import { derivePatterns } from "../lib/derive-patterns.mjs";
import { validatePatternBatch } from "../lib/pattern.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIVATE_DIR = join(HERE, "..", "..", "private");

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

function emit(obj, flags) {
  const json = canonicalJson(obj);
  if (flags.out) {
    mkdirSync(flags.out, { recursive: true });
    const f = join(flags.out, (flags.name || "output") + ".json");
    writeFileSync(f, json + "\n");
    return f;
  }
  process.stdout.write(json + "\n");
  return null;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const { flags, rest } = parseFlags(args);

  if (cmd === "audit") {
    const loaded = loadRawCorpus();
    const out = auditCorpus(loaded);
    emit(out, flags);
    return;
  }

  if (cmd === "pilot-private") {
    const loaded = loadRawCorpus();
    if (!loaded.present) { emit({ status: RAW_STATUS.BLOCKED }, flags); return; }
    const pack = buildPrivatePack(loaded.records, { seed: PILOT_SEED });
    mkdirSync(PRIVATE_DIR, { recursive: true });
    const f = join(PRIVATE_DIR, "pilot-pack-50.private.json");
    writeFileSync(f, canonicalJson(pack) + "\n");
    // stdout gets ONLY a text-free receipt.
    process.stdout.write(canonicalJson({ status: "PRIVATE_PACK_WRITTEN", size: pack.size, seed: pack.seed, path: "private/pilot-pack-50.private.json" }) + "\n");
    return;
  }

  if (cmd === "pilot-skeleton") {
    const loaded = loadRawCorpus();
    if (!loaded.present) { emit({ status: RAW_STATUS.BLOCKED }, flags); return; }
    const skel = buildPublicSkeleton(loaded.records, { seed: PILOT_SEED, rounds: Number(flags.rounds || 2) });
    emit(skel, flags);
    return;
  }

  if (cmd === "consistency") {
    const [r1Path, r2Path] = rest;
    const r1 = readJson(r1Path);
    const r2 = readJson(r2Path);
    const a1 = Array.isArray(r1) ? r1 : r1.annotationStubs || r1.annotations || [];
    const a2 = Array.isArray(r2) ? r2 : r2.annotationStubs || r2.annotations || [];
    emit(consistencyReport(a1, a2), flags);
    return;
  }

  if (cmd === "hypotheses") {
    const [annPath] = rest;
    const raw = readJson(annPath);
    const anns = Array.isArray(raw) ? raw : raw.annotations || raw.annotationStubs || [];
    emit(evaluateHypotheses(anns), flags);
    return;
  }

  if (cmd === "validate") {
    const [annPath] = rest;
    const raw = readJson(annPath);
    const anns = Array.isArray(raw) ? raw : raw.annotations || raw.annotationStubs || [];
    emit(validateAnnotationBatch(anns), flags);
    return;
  }

  if (cmd === "derive") {
    // Derive candidate patterns from filled annotations → behavior-patterns.private.json in private/.
    // Patterns carry ONLY record hashes (no text), so the output is technically text-free; we still
    // route it to private/ by default because the pattern LABELS could hint at content, and canon
    // status requires human review that hasn't happened. Use --out to override for synthetic tests.
    const [annPath] = rest;
    const raw = readJson(annPath);
    const anns = Array.isArray(raw) ? raw : raw.annotations || raw.annotationStubs || [];
    const derived = derivePatterns(anns, { round: Number(flags.round || 1) });
    const validated = validatePatternBatch(derived.patterns);
    const out = { ...derived, validation: { total: validated.total, schemaValid: validated.schemaValid, downgraded: validated.downgraded, e3plus: validated.e3plus, eligibleForBehaviorRule: validated.eligibleForBehaviorRule }, results: validated.results };
    if (flags.out) { emit(out, flags); return; }
    mkdirSync(PRIVATE_DIR, { recursive: true });
    const f = join(PRIVATE_DIR, "behavior-patterns.private.json");
    writeFileSync(f, canonicalJson(out) + "\n");
    process.stdout.write(canonicalJson({ status: "PATTERNS_WRITTEN", patternCount: derived.patterns.length, e3plus: validated.e3plus, eligibleForBehaviorRule: validated.eligibleForBehaviorRule, path: "private/behavior-patterns.private.json" }) + "\n");
    return;
  }

  if (cmd === "patterns-validate") {
    const [patPath] = rest;
    const raw = readJson(patPath);
    const pats = Array.isArray(raw) ? raw : raw.patterns || [];
    emit(validatePatternBatch(pats), flags);
    return;
  }

  if (cmd === "summary") {
    const loaded = loadRawCorpus();
    const audit = auditCorpus(loaded);
    const { duplicateGroups, contaminationCandidates, unparsedLineNumbers, ...auditSummary } = audit;
    const out = {
      layer: "single-sided-behavior",
      corpusPresent: loaded.present === true,
      audit: auditSummary,
      duplicateGroupCount: (duplicateGroups || []).length,
      contaminationCandidateCount: (contaminationCandidates || []).length,
      pilot: { size: 50, seed: PILOT_SEED, stage: "stage-2-pilot-tooling-only" },
    };
    // Optional: fold in hypotheses if a filled annotation file is supplied.
    if (flags.annotations && existsSync(flags.annotations)) {
      const raw = readJson(flags.annotations);
      const anns = Array.isArray(raw) ? raw : raw.annotations || raw.annotationStubs || [];
      out.hypotheses = evaluateHypotheses(anns);
    }
    emit(out, flags);
    return;
  }

  process.stderr.write("usage: run-pilot.mjs <audit|pilot-private|pilot-skeleton|consistency|hypotheses|validate|derive|patterns-validate|summary> [--out dir] [--name f]\n");
  process.exit(2);
}

main();

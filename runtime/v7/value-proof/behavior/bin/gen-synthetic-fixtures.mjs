#!/usr/bin/env node
// Synthetic fixture generator (directive §16 item 11 — test data).
//
// Produces FULLY SYNTHETIC two-round annotation sets + a pattern set. No corpus text is involved:
// records are identified by fake but stable hashes (sha256 of "synthetic-<i>"), so these fixtures
// are safe to commit and let us test consistency.mjs, hypotheses.mjs, pattern.mjs, annotation.mjs
// end-to-end BEFORE any human touches the real 50 records.
//
// The generator is deterministic (seeded) and shaped so the hypothesis evaluator yields a mix of
// supported / partially_supported / unsupported / not_evaluable — i.e. it actually exercises the
// scoring branches rather than trivially passing.

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "fixtures", "synthetic");

const N = 30; // synthetic records
function fakeHash(i) { return createHash("sha256").update("synthetic-" + i).digest("hex"); }

// Deterministic PRNG so round-2 perturbations are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small deterministic archetype table. Each archetype fixes L1-L4 + affect so we can hand-verify
// what H1-H7 SHOULD conclude. Index i % archetypes.length picks one.
const ARCHETYPES = [
  { // attention-seeking, evidential → supports H1
    behaviorAtoms: ["seek_attention", "tease"], functions: ["obtain_attention"],
    needs: ["exclusive_attention"], expectedReply: ["exclusive_attention_confirmation"],
    speechActs: ["question"], concurrencyClass: "A_explicit",
  },
  { // masked shame via playful insult, evidential → supports H2
    behaviorAtoms: ["insult_playfully", "escalate"], functions: ["conceal_vulnerability"],
    needs: ["reassurance"], expectedReply: ["specific_reassurance"],
    speechActs: ["taunt"], concurrencyClass: "B_context_strong",
    affect: { masked: "shame" },
  },
  { // demand that isn't a literal request → supports H3
    behaviorAtoms: ["demand", "accuse"], functions: ["demand_reciprocation"],
    needs: ["recognition"], expectedReply: ["affection_reciprocation"],
    speechActs: ["command"], concurrencyClass: "A_explicit",
    literalRequest: false,
  },
  { // withdraw to provoke pursuit, evidential → supports H4
    behaviorAtoms: ["withdraw"], functions: ["provoke_pursuit"],
    needs: ["closeness"], expectedReply: ["pursuit_after_withdrawal"],
    speechActs: ["refusal"], concurrencyClass: "A_explicit",
  },
  { // boundary-setting counterexample (autonomy) → counters H7 / H1
    behaviorAtoms: ["reassert_control"], functions: ["establish_boundary"],
    needs: ["autonomy"], expectedReply: ["boundary_respect"],
    speechActs: ["assertion"], concurrencyClass: "B_context_strong",
  },
  { // non-evidential (C) → excluded from A/B-gated hypotheses (H2/H4/H7)
    behaviorAtoms: ["reveal"], functions: ["intensify_intimacy"],
    needs: ["desire_confirmation"], expectedReply: ["desire_confirmation"],
    speechActs: ["self_disclosure"], concurrencyClass: "C_designed_inference",
  },
];

function baseAnnotation(i) {
  const arc = ARCHETYPES[i % ARCHETYPES.length];
  const ann = {
    recordFormatVersion: 1,
    recordHash: fakeHash(i),
    order: i + 1,
    annotator: "synthetic",
    round: 1,
    modelSuggested: false,
    l1: { speechActs: arc.speechActs.slice(), behaviorAtoms: arc.behaviorAtoms.slice() },
    l2: { functions: arc.functions.slice() },
    l3: { candidates: arc.needs.map((n) => ({ need: n, confidence: 0.6, alternatives: [], uncertaintyReason: "single-sided; partner turn absent" })) },
    affect: { concurrencyClass: arc.concurrencyClass, ...(arc.affect || {}) },
    expectedReply: {
      functionalExpectedReply: arc.expectedReply.slice(),
      // literalRequest is boolean-or-absent (schema: boolean). Omit when the archetype leaves it unset.
      ...(arc.literalRequest === undefined ? {} : { literalRequest: arc.literalRequest }),
    },
    l4Refs: { supports: [], counters: [] },
    contextDependentJudgments: [],
  };
  return ann;
}

// Round 2: high agreement, but perturb ~15% of records on one field to keep gates realistic
// (not a trivial 100%). Perturbations are seeded.
function perturb(ann, rnd) {
  const a = JSON.parse(JSON.stringify(ann));
  a.round = 2;
  const r = rnd();
  if (r < 0.15) {
    // drop one behavior atom (lowers observableActs agreement a bit)
    if (a.l1.behaviorAtoms.length > 1) a.l1.behaviorAtoms = a.l1.behaviorAtoms.slice(0, 1);
  } else if (r < 0.22) {
    // swap a latent need (lowers latentNeed agreement)
    if (a.l3.candidates.length) a.l3.candidates[0].need = "other";
  }
  return a;
}

function main() {
  const rnd = mulberry32(0x513f1c7);
  const round1 = [];
  const round2 = [];
  for (let i = 0; i < N; i++) {
    const a1 = baseAnnotation(i);
    round1.push(a1);
    round2.push(perturb(a1, rnd));
  }

  // A synthetic pattern set: one E3 pattern with enough support, one under-supported "claimed E3".
  // Field names match behavior-pattern.schema.json (additionalProperties:false).
  const attentionHashes = [];
  for (let i = 0; i < N; i++) if (i % ARCHETYPES.length === 0) attentionHashes.push(fakeHash(i));
  const patterns = [
    {
      // Well-supported + reviewed → should stay E3 and be eligibleForBehaviorRule.
      patternId: "BP-001",
      name: "attention-seeking via playful provocation",
      functionalInvariant: "seek_attention+tease serves obtain_attention",
      observableVariants: ["seek_attention", "tease"],
      latentNeedCandidates: ["exclusive_attention"],
      interactionGoal: "obtain_attention",
      supportingRecordHashes: attentionHashes.concat([fakeHash(100), fakeHash(101), fakeHash(102), fakeHash(103), fakeHash(104), fakeHash(105)]).slice(0, 8),
      counterexampleRecordHashes: [],
      surfaceVariantCount: 3, affectVariantCount: 2, crossClusterCount: 1, // 1 → caps at E3 (E4 needs >=2)
      evidenceGrade: "E3", confidence: 0.9,
      reReviewConsistent: true, humanReviewed: true, reviewStatus: "reviewed",
    },
    {
      // Under-supported claimed E3 → should downgrade to E2, NOT eligible.
      patternId: "BP-002",
      name: "under-supported claim (should downgrade)",
      functionalInvariant: "withdraw serves provoke_pursuit",
      observableVariants: ["withdraw"],
      latentNeedCandidates: ["closeness"],
      interactionGoal: "provoke_pursuit",
      supportingRecordHashes: [fakeHash(1)], // only 1 → below MIN_E3_SUPPORT
      counterexampleRecordHashes: [],
      surfaceVariantCount: 1, affectVariantCount: 1, crossClusterCount: 1,
      evidenceGrade: "E3", confidence: 0.2,
      reReviewConsistent: false, humanReviewed: false, reviewStatus: "candidate",
    },
  ];

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "annotations-round1.json"), canonicalJson({ annotations: round1 }) + "\n");
  writeFileSync(join(OUT, "annotations-round2.json"), canonicalJson({ annotations: round2 }) + "\n");
  writeFileSync(join(OUT, "patterns.json"), canonicalJson({ patterns }) + "\n");
  process.stdout.write(canonicalJson({ status: "SYNTHETIC_FIXTURES_WRITTEN", records: N, files: ["annotations-round1.json", "annotations-round2.json", "patterns.json"] }) + "\n");
}

main();

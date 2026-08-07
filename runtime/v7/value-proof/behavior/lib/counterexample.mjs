// P1-1C §7-8 — counterexample engine.
//
// The 200 stage's core job is FALSIFICATION. For each grammar candidate (a conditional:
// antecedent ⇒ expectedConsequent), every record is classified into EXACTLY ONE bucket:
//
//   support            : antecedent holds AND expectedConsequent holds
//   true_counterexample: antecedent holds, consequent does NOT, and NO competing valid strategy is
//                        present — the pattern's own prediction simply failed
//   competing_strategy : antecedent holds, consequent does NOT, but a DIFFERENT valid strategy is
//                        present — the actor chose another route (not a failure of the actor, but a
//                        boundary of the rule)
//   ambiguous          : antecedent holds but evidence is too thin to judge the consequent
//                        (low evidenceGrade / relevant reviewFlags)
//   non_applicable     : antecedent does NOT hold — the record is simply out of scope
//
// eligibleOpportunity = support + true_counterexample + competing_strategy + ambiguous
//                       (i.e. every record where the antecedent fired). Densities are over eligible,
// NOT over all records, so a rare antecedent isn't diluted by the whole corpus.
//
// A candidate is declared as predicates; the engine is generic so §9 (H1-H11) reuses it.

export const CE_BUCKET = Object.freeze({
  SUPPORT: "support",
  TRUE: "true_counterexample",
  COMPETING: "competing_strategy",
  AMBIGUOUS: "ambiguous",
  NON_APPLICABLE: "non_applicable",
});

// --- annotation accessors (tolerant of both hand + heuristic shapes) ------------------------------
export const acc = {
  actions: (a) => (a.behaviorActionSequence || []).map((x) => x.action),
  hasAction: (a, name) => acc.actions(a).includes(name),
  functions: (a) => ((a.interactionFunctions?.functions) || []).map((x) => x.function),
  hasFunction: (a, name) => acc.functions(a).includes(name),
  drivingForces: (a) => (a.drivingForceCandidates || []).map((x) => x.candidate || x.force),
  hasDrivingForce: (a, name) => acc.drivingForces(a).includes(name),
  triggerDomain: (a) => a.triggerSensitivity?.domain || "other",
  triggerIntensity: (a) => a.triggerSensitivity?.observedTriggerIntensity || "unknown",
  relOps: (a) => (a.relationshipManagement?.operations) || [],
  hasRelOp: (a, name) => acc.relOps(a).includes(name),
  relPresent: (a) => !!a.relationshipManagement?.present,
  metaTags: (a) => (a.metaSelfMonitoring?.tags) || [],
  hasMetaTag: (a, name) => acc.metaTags(a).includes(name),
  affectPrimary: (a) => a.affect?.primarySurface?.value || "other",
  coexistence: (a) => a.affect?.coexistenceType || "unknown",
  hasOpposingAffect: (a) => !!a.affect?.opposingAffect && a.affect.opposingAffect.value !== a.affect?.primarySurface?.value,
  grade: (a) => a.evidenceGrade || "E0",
  reviewFlags: (a) => a.reviewFlags || [],
  functionalMask: (a) => !!a.maskAnalysis?.functionalMask,
  maskStrategy: (a) => a.maskAnalysis?.maskStrategy || null,
  revealWithoutMask: (a) => !!a.maskAnalysis?.revealWithoutMask,
  expectedImmediate: (a) => (a.expectedReply?.immediateReply?.classes) || [],
  expectedRelationship: (a) => (a.expectedReply?.relationshipReply?.classes) || [],
  link: (a) => a.linkId || a.recordHash,
  id: (a) => a.presentationId,
  isHeuristic: (a) => a.annotationProvenance === "heuristic_200",
};

const LOW_GRADES = new Set(["E0"]);

// Classify one record against one candidate.
//   candidate: { id, antecedent(a)->bool, consequent(a)->bool, competing(a)->bool,
//                ambiguityExtra(a)->bool (optional) }
export function classifyRecord(candidate, a) {
  if (!candidate.antecedent(a)) return CE_BUCKET.NON_APPLICABLE;
  // antecedent holds. Is the evidence strong enough to judge the consequent?
  const thin = LOW_GRADES.has(acc.grade(a)) || (candidate.ambiguityExtra ? candidate.ambiguityExtra(a) : false);
  if (candidate.consequent(a)) return CE_BUCKET.SUPPORT;
  // consequent did NOT occur.
  if (candidate.competing && candidate.competing(a)) return CE_BUCKET.COMPETING;
  if (thin) return CE_BUCKET.AMBIGUOUS;
  return CE_BUCKET.TRUE;
}

// Run one candidate over a set of annotations. Returns counts + densities + per-bucket links.
export function evaluateCandidate(candidate, annotations) {
  const buckets = { support: [], true_counterexample: [], competing_strategy: [], ambiguous: [], non_applicable: [] };
  for (const a of annotations) buckets[classifyRecord(candidate, a)].push(acc.link(a));

  const supportCount = buckets.support.length;
  const trueCE = buckets.true_counterexample.length;
  const competing = buckets.competing_strategy.length;
  const ambiguous = buckets.ambiguous.length;
  const eligible = supportCount + trueCE + competing + ambiguous;

  const density = (x) => (eligible > 0 ? Math.round((x / eligible) * 1000) / 1000 : 0);

  // robustness read: high support + low true-CE density = robust; high competing = conditional;
  // high ambiguous = data-thin; support < competing+true = weak/likely-artifact.
  let robustness;
  if (eligible === 0) robustness = "no_opportunity";
  else if (supportCount < 3) robustness = "insufficient_support";
  else if (density(trueCE) <= 0.2 && density(competing) <= 0.3) robustness = "robust";
  else if (density(competing) > density(trueCE)) robustness = "conditional";
  else if (density(ambiguous) >= 0.5) robustness = "context_specific";
  else robustness = "weak_or_artifact";

  return {
    candidateId: candidate.id,
    description: candidate.description || "",
    supportCount,
    trueCounterexampleCount: trueCE,
    competingStrategyCount: competing,
    ambiguousCount: ambiguous,
    nonApplicableCount: buckets.non_applicable.length,
    eligibleOpportunityCount: eligible,
    counterexampleDensity: density(trueCE),
    competingStrategyDensity: density(competing),
    ambiguousDensity: density(ambiguous),
    robustness,
    contextNotes: candidate.contextNotes || "",
    links: {
      support: buckets.support,
      true_counterexample: buckets.true_counterexample,
      competing_strategy: buckets.competing_strategy,
      ambiguous: buckets.ambiguous,
    },
  };
}

export function evaluateAll(candidates, annotations) {
  return candidates.map((c) => evaluateCandidate(c, annotations));
}

// ---- the frozen grammar-candidate declarations (antecedent ⇒ consequent) -------------------------
// These encode the pilot's leading patterns as falsifiable conditionals. Kept small + explicit so a
// reviewer can see exactly what "support" and "counterexample" mean for each.
export const GRAMMAR_CANDIDATES = [
  {
    id: "GC1_delayed_reply_to_accuse_or_seek",
    description: "trigger delayed_reply ⇒ accuse OR seek reassurance",
    contextNotes: "tests whether unavailability reliably produces protest/confirmation-seeking.",
    antecedent: (a) => acc.triggerDomain(a) === "delayed_reply",
    consequent: (a) => acc.hasAction(a, "accuse") || acc.hasAction(a, "seek_confirmation") || acc.hasFunction(a, "obtain_specific_reassurance") || acc.hasFunction(a, "punish_perceived_neglect"),
    competing: (a) => acc.hasAction(a, "withdraw") || acc.hasAction(a, "tease") || acc.hasFunction(a, "invite_playful_response"),
  },
  {
    id: "GC2_reveal_to_mask",
    description: "reveal/self_devalue ⇒ functional mask follows",
    contextNotes: "H3. reveal without any conceal is the key counter-scene.",
    antecedent: (a) => acc.hasAction(a, "reveal") || acc.hasAction(a, "self_devalue"),
    consequent: (a) => acc.functionalMask(a),
    competing: (a) => acc.revealWithoutMask(a) || acc.hasAction(a, "seek_confirmation"),
  },
  {
    id: "GC3_accusation_seeks_reassurance",
    description: "accuse ⇒ expected partner operation is reassurance/bond",
    contextNotes: "H4. some accusations are playful venting, not reassurance-seeking.",
    antecedent: (a) => acc.hasAction(a, "accuse"),
    consequent: (a) => acc.expectedRelationship(a).includes("reaffirm_bond") || acc.expectedImmediate(a).includes("reassure") || acc.hasFunction(a, "obtain_specific_reassurance"),
    competing: (a) => acc.hasFunction(a, "invite_playful_response") || acc.reviewFlags(a).includes("joke_literal_ambiguity"),
  },
  {
    id: "GC4_exclusivity_trigger_to_unique",
    description: "exclusivity/jealousy antecedent ⇒ need_to_be_unique + test_exclusivity",
    contextNotes: "distinguishes possessive from casual mention of others.",
    antecedent: (a) => acc.triggerDomain(a) === "exclusivity_threat" || acc.hasDrivingForce(a, "need_to_be_unique"),
    consequent: (a) => acc.hasFunction(a, "test_exclusivity") || acc.hasRelOp(a, "seek_exclusivity"),
    competing: (a) => acc.hasAction(a, "tease") || acc.hasFunction(a, "invite_playful_response"),
  },
  {
    id: "GC5_relationship_management_explicit",
    description: "any partner-directed message ⇒ an explicit relationship operation present",
    contextNotes: "H5. base-rate of explicit relationship management.",
    antecedent: (a) => (a.l1_observable?.target === "partner"),
    consequent: (a) => acc.relPresent(a),
    competing: (a) => acc.hasFunction(a, "invite_playful_response") || (a.stateContext?.domains || []).length > 0,
  },
  {
    id: "GC6_low_trigger_high_activation",
    description: "low/none observed trigger ⇒ high inferred activation (characteristically low threshold)",
    contextNotes: "H2. the critical counter-scene is low-trigger + LOW activation.",
    antecedent: (a) => ["no_external_trigger", "indeterminate"].includes(acc.triggerDomain(a)) || acc.triggerIntensity(a) === "low",
    consequent: (a) => a.triggerSensitivity?.inferredInternalActivation === "high" || acc.reviewFlags(a).includes("low_trigger_high_activation_candidate"),
    competing: (a) => acc.affectPrimary(a) === "joy" || acc.hasFunction(a, "invite_playful_response"),
  },
  {
    id: "GC7_self_monitoring_present",
    description: "reveal/self_devalue ⇒ meta self-monitoring present",
    contextNotes: "H8. does vulnerability co-occur with self-observation?",
    antecedent: (a) => acc.hasAction(a, "reveal") || acc.hasAction(a, "self_devalue"),
    consequent: (a) => acc.metaTags(a).length > 0,
    competing: (a) => acc.functionalMask(a),
  },
];

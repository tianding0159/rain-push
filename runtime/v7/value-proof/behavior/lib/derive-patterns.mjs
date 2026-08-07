// Pattern derivation (directive §2 L4, §16 item 10).
//
// Turns a set of L1-L4 annotations into candidate cross-corpus behavior patterns (L4). A pattern
// is a recurring (behaviorAtoms-signature → interactionFunction) regularity supported by multiple
// DISTINCT records. This is deterministic aggregation only — NO inference beyond counting, and NO
// verbatim text ever enters a pattern (patterns carry supporting record HASHES, never text).
//
// The derived grade is a CLAIM; validatePattern() (pattern.mjs) is the gate that confirms or
// downgrades it against §14 thresholds. Nothing here promotes a pattern to "canon" — that needs
// human review (reviewStatus:"reviewed"), which this offline step can never set.

import { supportedGrade } from "./pattern.mjs";

// Signature of an annotation for clustering: sorted behaviorAtoms + primary interaction function.
// We key on the (atoms, function) pair because that's the smallest unit §2 calls a "pattern".
function signature(ann) {
  const atoms = (ann.l1?.behaviorAtoms || []).slice().sort();
  const fn = (ann.l2?.functions || []).slice().sort()[0] || "unknown";
  return { key: atoms.join("+") + "=>" + fn, atoms, fn };
}

function isEvidential(ann) {
  const c = ann.affect?.concurrencyClass;
  return c === "A_explicit" || c === "B_context_strong";
}

// C_designed_inference annotations are EXCLUDED from pattern support counts (§6): a design goal
// must not launder itself into "canon evidence." They may still appear as hypotheses elsewhere.
function eligibleForSupport(ann) {
  return ann.affect?.concurrencyClass !== "C_designed_inference";
}

function pad3(n) { return String(n).padStart(3, "0"); }

// Derive candidate patterns. Returns { patterns, meta } — patterns are UNREVIEWED claims.
export function derivePatterns(annotations, { round = 1 } = {}) {
  const scoped = annotations.filter((a) => (a.round ?? 1) === round && eligibleForSupport(a));
  const clusters = new Map();

  for (const a of scoped) {
    const sig = signature(a);
    if (!clusters.has(sig.key)) {
      clusters.set(sig.key, {
        key: sig.key, atoms: sig.atoms, fn: sig.fn,
        recordHashes: new Set(),
        needCounts: new Map(),
        affectRoles: new Set(),
        evidentialCount: 0,
      });
    }
    const c = clusters.get(sig.key);
    c.recordHashes.add(a.recordHash);
    if (isEvidential(a)) c.evidentialCount += 1;
    for (const role of ["primary", "opposing", "masked", "leak"]) {
      if (a.affect?.[role]) c.affectRoles.add(role + ":" + a.affect[role]);
    }
    for (const cand of a.l3?.candidates || []) {
      c.needCounts.set(cand.need, (c.needCounts.get(cand.need) || 0) + 1);
    }
    // Surface-variant count (distinct wordings) can't be computed offline from a text-free
    // annotation — it needs the human review pass that sees the utterances. We therefore leave
    // surfaceVariantCount at its floor of 1 here; that alone keeps offline derivation BELOW the
    // E3 wording-variant gate (>=2), which is the correct outcome: canon requires human review.
  }

  const ordered = [...clusters.values()].sort((a, b) => b.recordHashes.size - a.recordHashes.size || a.key.localeCompare(b.key));
  const built = ordered.map((c, i) => {
    const support = c.recordHashes.size;
    const topNeed = [...c.needCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const needCandidates = [...c.needCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]);
    // Claim a grade from raw structure; pattern.mjs will confirm or downgrade. Field names match
    // behavior-pattern.schema.json exactly (additionalProperties:false — no extras allowed).
    const claim = {
      patternId: "BP-" + pad3(i + 1),
      name: c.atoms.join("+") + " => " + c.fn,
      functionalInvariant: `${c.atoms.join("+")} serves ${c.fn}` + (topNeed ? ` (dominant latent-need candidate: ${topNeed[0]})` : ""),
      observableVariants: c.atoms,
      latentNeedCandidates: needCandidates,
      interactionGoal: c.fn,
      supportingRecordHashes: [...c.recordHashes].sort(),
      counterexampleRecordHashes: [],
      surfaceVariantCount: 1, // offline floor; distinct-wording count is a human-review input
      affectVariantCount: Math.max(c.affectRoles.size, 1),
      crossClusterCount: 1, // single-corpus pilot: no cross-cluster split yet → E4 unreachable here
      evidenceGrade: support >= 8 ? "E3" : support >= 3 ? "E2" : support >= 1 ? "E1" : "E0",
      confidence: Math.min(support / 8, 1),
      reReviewConsistent: false,
      humanReviewed: false,
      reviewStatus: "candidate", // NEVER "reviewed" from an offline step
    };
    // Self-checked supported grade is derivation metadata, kept OUT of the schema object so it
    // doesn't trip additionalProperties:false; returned alongside instead.
    return { pattern: claim, selfCheckedSupportedGrade: supportedGrade(claim) };
  });

  return {
    patterns: built.map((b) => b.pattern),
    selfChecks: built.map((b) => ({ patternId: b.pattern.patternId, claimedGrade: b.pattern.evidenceGrade, selfCheckedSupportedGrade: b.selfCheckedSupportedGrade })),
    meta: {
      round,
      annotationsIn: annotations.length,
      annotationsScored: scoped.length,
      excludedDesignedInference: annotations.filter((a) => (a.round ?? 1) === round && a.affect?.concurrencyClass === "C_designed_inference").length,
      distinctSignatures: clusters.size,
    },
  };
}

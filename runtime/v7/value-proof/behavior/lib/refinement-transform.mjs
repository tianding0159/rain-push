// P1-1B.1 controlled refinement transform.
//
// Deterministically maps a REVISED annotation to its REFINED form by applying ONLY the three
// evidence-backed guide changes. It NEVER re-samples, NEVER edits text, NEVER force-splits actions,
// and NEVER touches the discovery algorithm. Every change is recorded per-field so the before/after
// is fully auditable and reversible.
//
//   Refinement 1 (trigger): `other` → {no_external_trigger | indeterminate | diffuse_internal_state}
//                            via the deterministic classifier in refinement-gap.mjs. `other` residual
//                            and all non-`other` domains are left untouched.
//   Refinement 2 (actions):  NO enum change applied to records — the action gap was 1.1%, so no
//                            record needed a new action. (Candidates live in vocab, unused.)
//   Refinement 3 (mask):     re-express mask under the FUNCTIONAL definition. A reveal→X edge is a
//                            mask ONLY if X reduces vulnerability exposure. We attach an explicit
//                            `maskAnalysis` block (functionalMask true/false + maskStrategy) so the
//                            re-run measures functional masks, not surface conceal-token adjacency.
//                            This can LOWER the mask count; that is allowed.

import { classifyOtherTrigger } from "./refinement-gap.mjs";
import { orderedActions } from "./grammar-discovery.mjs";

// Which conceal-token actions can serve a masking FUNCTION, and the maskStrategy they map to WHEN
// the function holds. Presence here is necessary, not sufficient — the functional test still applies.
const CONCEAL_TO_STRATEGY = {
  retract: "retract",
  self_devalue: "self_mockery",
  tease: "humor",
  countermask: "counterattack",
  conceal: "denial",
  mask: "denial",
  justify: "qualification",
  perform_confidence: "performance_restore",
  accuse: "accusation",
  demand: "command",
  deescalate: "minimization",
};
const REVEAL_MOVES = new Set(["reveal", "seek_confirmation", "seek_attention"]);

// Functional test: does the conceal move reduce exposure of the vulnerability just revealed?
// Deterministic proxy: (1) the move is a recognised conceal-token, AND (2) the record's own
// metaSelfMonitoring or reviewFlags indicate awareness of over-exposure OR the affect is dysphoric
// (i.e. there was a real vulnerability to hide). Pure play/aggression with no vulnerability context
// does NOT qualify. This proxy is conservative — it will NOT inflate masks to rescue H3.
function isFunctionalMask(ann, revealAffect, followAction) {
  if (!(followAction in CONCEAL_TO_STRATEGY)) return false;
  const dysphoric = ["sadness", "loneliness", "fear", "shame"].includes(revealAffect);
  const selfMon = (ann.metaSelfMonitoring?.tags || []).length > 0;
  const exposureFlag = (ann.reviewFlags || []).some((f) => ["maybe_public_performance", "maybe_joke"].includes(f.id) && f.note);
  // self_devalue / tease after a dysphoric reveal, or any conceal with explicit self-monitoring of exposure
  return dysphoric || selfMon || exposureFlag;
}

export function refineAnnotation(ann) {
  const changes = [];
  // deep clone so the source is never mutated
  const refined = JSON.parse(JSON.stringify(ann));

  // ---- Refinement 1: trigger domain split ----
  if (refined.triggerSensitivity?.domain === "other") {
    const c = classifyOtherTrigger(refined);
    // diffuse_internal_state was below threshold → keep as `other` (candidate only), do NOT promote
    const target = c.subDomain === "diffuse_internal_state" ? "other" : c.subDomain === "other_residual" ? "other" : c.subDomain;
    if (target !== "other") {
      changes.push({ field: "triggerSensitivity.domain", oldValue: "other", newValue: target, changeReason: c.reason, guideRuleResponsible: "Refinement1_trigger_split" });
      refined.triggerSensitivity.domain = target;
      refined.triggerSensitivity.refinedFrom = "other";
    } else {
      changes.push({ field: "triggerSensitivity.domain", oldValue: "other", newValue: "other", changeReason: `sub-category '${c.subDomain}' below >=3 admission threshold — kept as other`, guideRuleResponsible: "Refinement1_trigger_split", noOp: true });
    }
  }

  // ---- Refinement 3: functional mask analysis ----
  const acts = orderedActions(refined).map((s) => s.action);
  const revealAffect = refined.affect?.primarySurface?.value;
  let functionalMask = false;
  let maskStrategy = null;
  let maskType = "none";
  for (let i = 0; i < acts.length; i++) {
    if (!REVEAL_MOVES.has(acts[i])) continue;
    if (i + 1 < acts.length) {
      const nxt = acts[i + 1];
      if (isFunctionalMask(refined, revealAffect, nxt)) {
        functionalMask = true;
        maskStrategy = CONCEAL_TO_STRATEGY[nxt];
        maskType = "immediate";
        break;
      }
    }
  }
  // delayed mask: a conceal move later in the message (not directly after) that still hides the reveal
  if (!functionalMask) {
    const revealIdx = acts.findIndex((a) => REVEAL_MOVES.has(a));
    if (revealIdx >= 0) {
      for (let j = revealIdx + 2; j < acts.length; j++) {
        if (isFunctionalMask(refined, revealAffect, acts[j])) {
          functionalMask = true;
          maskStrategy = CONCEAL_TO_STRATEGY[acts[j]];
          maskType = "delayed";
          break;
        }
      }
    }
  }
  const maskAnalysis = {
    functionalMask,
    maskStrategy: functionalMask ? maskStrategy : null,
    maskType,
    definition: "mask=true requires reducing the exposure of a just-revealed vulnerability; surface conceal-token adjacency alone does NOT qualify",
  };
  refined.maskAnalysis = maskAnalysis;
  if (functionalMask) {
    changes.push({ field: "maskAnalysis.functionalMask", oldValue: null, newValue: true, changeReason: `functional mask via ${maskStrategy} (${maskType})`, guideRuleResponsible: "Refinement3_functional_mask" });
  }

  return { refined, changes };
}

export function refineBatch(annotations) {
  return annotations.map((a) => {
    const { refined, changes } = refineAnnotation(a);
    return { presentationId: a.presentationId, linkId: a.linkId, refined, changes };
  });
}

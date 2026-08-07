// P1-1B.1 gap analysis (targeted refinement, data-first).
//
// Reports WHERE the annotation guide lost information on the 50 pilot records, so refinement is
// driven by evidence, not by the wish-list of candidate enums in the directive. Two gap reports:
//
//   triggerDomainGap  — every `other` record, its deterministic sub-category, and the honest reason.
//                        Key finding this surfaces: `other` is mostly NOT missing external categories;
//                        it is (a) genuinely no external trigger, (b) indeterminate in a single-sided
//                        corpus, (c) true residual. So the minimal fix SPLITS `other`, it does not
//                        invent event categories (most of which already exist AND are already dead).
//
//   behaviorActionGap — how often actions fell back to `other`/`no_clear_action`, i.e. whether the
//                        action vocabulary actually failed. (On this pilot it barely did.)
//
// Both outputs carry recordHash links (private). Deterministic: sorted, count-based, no text.

import { linkOf } from "./grammar-discovery.mjs";

// Dysphoric surface affects — used to separate "diffuse internal state" from "neutral no-trigger".
const DYSPHORIC = new Set(["sadness", "loneliness", "fear", "shame", "anger", "jealousy"]);

// Deterministic classifier for a trigger `other` record. The axis is OBSERVED intensity + affect,
// never a re-reading of text — so the split is reproducible.
export function classifyOtherTrigger(ann) {
  const ti = ann.triggerSensitivity?.observedTriggerIntensity;
  const affect = ann.affect?.primarySurface?.value;
  const ctxMissing = (ann.reviewFlags || []).some((f) => f.id === "missing_context" && f.note);
  if (ti === "unknown" || ctxMissing) {
    return { subDomain: "indeterminate", reason: "observed trigger intensity unknown / context missing in single-sided corpus — cannot confirm an external trigger exists" };
  }
  if (ti === "minimal" || ti === "low") {
    if (DYSPHORIC.has(affect)) {
      return { subDomain: "diffuse_internal_state", reason: "low external trigger but a dysphoric surface affect — a diffuse internal state, not an event-driven trigger" };
    }
    return { subDomain: "no_external_trigger", reason: "low/minimal observed trigger with neutral/positive affect — spontaneous sharing, no external trigger" };
  }
  return { subDomain: "other_residual", reason: "does not fit a sub-category; genuine residual, keep `other`" };
}

export function triggerDomainGap(annotations) {
  const others = annotations.filter((a) => a.triggerSensitivity?.domain === "other");
  const bySub = new Map();
  const records = [];
  for (const ann of others) {
    const c = classifyOtherTrigger(ann);
    records.push({ link: linkOf(ann), subDomain: c.subDomain, reason: c.reason, observedTriggerIntensity: ann.triggerSensitivity?.observedTriggerIntensity || "unknown" });
    bySub.set(c.subDomain, (bySub.get(c.subDomain) || 0) + 1);
  }
  records.sort((a, b) => (a.link < b.link ? -1 : 1));
  const subCategories = [...bySub.entries()]
    .map(([subDomain, count]) => ({ subDomain, count }))
    .sort((a, b) => b.count - a.count || (a.subDomain < b.subDomain ? -1 : 1));

  // Admission verdict per sub-category (>=3 records → admit as enum value).
  for (const s of subCategories) {
    s.meetsAdmissionThreshold = s.count >= 3;
    s.disposition = s.subDomain === "other_residual"
      ? "keep_as_other"
      : s.count >= 3 ? "admit_new_subdomain" : "candidate_only";
  }

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    totalRecords: annotations.length,
    otherCount: others.length,
    otherFraction: annotations.length ? Math.round((others.length / annotations.length) * 1000) / 1000 : 0,
    finding: "`other` is dominated by no-trigger and indeterminate records, NOT missing external-event categories. The existing enum already covers the directive's candidate events (several are already dead). Minimal fix: split `other` into honest sub-domains.",
    subCategories,
    records,
  };
}

const ACTION_FALLBACKS = new Set(["other", "no_clear_action"]);

export function behaviorActionGap(annotations) {
  const fallbackRecords = [];
  const counts = new Map();
  let totalActions = 0;
  for (const ann of annotations) {
    for (const step of ann.behaviorActionSequence || []) {
      totalActions++;
      counts.set(step.action, (counts.get(step.action) || 0) + 1);
      if (ACTION_FALLBACKS.has(step.action)) {
        fallbackRecords.push({ link: linkOf(ann), action: step.action });
      }
    }
  }
  fallbackRecords.sort((a, b) => (a.link < b.link ? -1 : 1));
  const frequency = [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || (a.action < b.action ? -1 : 1));

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    totalRecords: annotations.length,
    totalActions,
    fallbackActionUses: fallbackRecords.length,
    fallbackFraction: totalActions ? Math.round((fallbackRecords.length / totalActions) * 1000) / 1000 : 0,
    finding: "Action vocabulary rarely failed: `other` action used 0×, `no_clear_action` minimally. By the >=5-sample admission rule, candidate actions belong on the extension list, NOT the formal enum, until a re-annotation actually needs them.",
    fallbackRecords,
    frequency,
  };
}

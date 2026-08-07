// Behavior Grammar Discovery (P1-1B, Layer A → B).
//
// Pure, deterministic aggregation over REVISED Round-A annotations. Discovers *candidate*
// dynamic patterns (transitions, couplings, conditional co-occurrence) from the annotation
// fields — NEVER from verbatim text. Everything here is a PILOT_ESTIMATE: this module counts
// evidence, it does not assert laws.
//
// Discipline baked in (directive §5/§6/§18):
//   - unique-record support is the primary weight; repeated transitions inside ONE long message
//     do not inflate a pattern beyond +1 record of support.
//   - driving-force evidence is split A (record-specific) / B (prior-only); prior-only never
//     enters the primary tally.
//   - every rate is emitted with observed_count + eligible_opportunity_count + PILOT_ESTIMATE tag.
//   - counterexamples are mined, not ignored.
//
// Input contract: an array of revised annotations, each optionally carrying a `linkId`
// (recordHash for private output, presentationId for local debugging). This module is agnostic
// to which id is supplied; the CALLER decides verbatim-safety.

export const PILOT_TAG = "PILOT_ESTIMATE";

// Confidence tiers that count as "written record evidence" for primary stats.
const STRONG = new Set(["explicit", "strongly_supported"]);
const WEAK = new Set(["weak_inference", "unknown"]);

export function linkOf(ann) {
  return ann.linkId || ann.recordHash || ann.presentationId || "UNKNOWN";
}

// Deterministic sort helper — all emitted arrays are sorted so output is byte-identical run to run.
function byKeyThenLink(a, b) {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return 0;
}

function sortedLinks(set) {
  return [...set].sort();
}

// A rate that is honest about being a pilot estimate. Never returns a bare percentage.
export function pilotRate(observed, eligible) {
  const rate = eligible > 0 ? Math.round((observed / eligible) * 1000) / 1000 : null;
  return {
    observed_count: observed,
    eligible_opportunity_count: eligible,
    pilot_observed_rate: rate,
    status: PILOT_TAG,
    uncertainty_note:
      eligible < 5
        ? "eligible opportunities < 5 — rate is not interpretable, treat as anecdote"
        : "n=50 pilot — rate indicates whether this deserves testing at larger n, not a law",
  };
}

// ---------------------------------------------------------------------------
// §4 Behavior transition discovery (intra-message only).
// ---------------------------------------------------------------------------
// Returns unigram/bigram/trigram tallies. Two counts are kept per n-gram:
//   - occurrenceCount: raw occurrences (a repeated transition in one message counts each time)
//   - recordSupport:  number of DISTINCT records containing it (the primary weight, §4/§5)
// confidenceWeightedSupport downweights a record whose transition edges rest on weak_inference.
export function orderedActions(ann) {
  return [...(ann.behaviorActionSequence || [])]
    .filter((s) => s && s.action)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

// A transition edge's strength = min confidence of its endpoints (a chain is only as strong as
// its weakest observed action). Used only for confidenceWeightedSupport, never to drop data.
function edgeStrong(a, b) {
  return STRONG.has(a.confidence) && STRONG.has(b.confidence);
}

export function discoverTransitions(annotations) {
  const uni = new Map(); // action -> {occ, records:Set, strongRecords:Set}
  const bi = new Map();  // "a>b"  -> {occ, records:Set, strongRecords:Set}
  const tri = new Map(); // "a>b>c"-> {occ, records:Set, strongRecords:Set}

  const bump = (map, key, link, strong) => {
    let e = map.get(key);
    if (!e) { e = { occ: 0, records: new Set(), strongRecords: new Set() }; map.set(key, e); }
    e.occ += 1;
    e.records.add(link);
    if (strong) e.strongRecords.add(link);
  };

  for (const ann of annotations) {
    const link = linkOf(ann);
    const acts = orderedActions(ann);
    for (let i = 0; i < acts.length; i++) {
      bump(uni, acts[i].action, link, STRONG.has(acts[i].confidence));
    }
    for (let i = 0; i + 1 < acts.length; i++) {
      const key = acts[i].action + ">" + acts[i + 1].action;
      bump(bi, key, link, edgeStrong(acts[i], acts[i + 1]));
    }
    for (let i = 0; i + 2 < acts.length; i++) {
      const key = acts[i].action + ">" + acts[i + 1].action + ">" + acts[i + 2].action;
      const strong = edgeStrong(acts[i], acts[i + 1]) && edgeStrong(acts[i + 1], acts[i + 2]);
      bump(tri, key, link, strong);
    }
  }

  const emit = (map) =>
    [...map.entries()]
      .map(([key, e]) => ({
        key,
        occurrenceCount: e.occ,
        recordSupport: e.records.size,               // §5 primary weight (unique records)
        confidenceWeightedSupport: e.strongRecords.size,
        supportingLinks: sortedLinks(e.records),
      }))
      .sort((a, b) =>
        b.recordSupport - a.recordSupport ||
        b.confidenceWeightedSupport - a.confidenceWeightedSupport ||
        b.occurrenceCount - a.occurrenceCount ||
        byKeyThenLink(a, b));

  const totalEdges = [...bi.values()].reduce((s, e) => s + e.occ, 0);
  const recordsWithBigram = new Set();
  for (const e of bi.values()) for (const r of e.records) recordsWithBigram.add(r);

  return {
    status: PILOT_TAG,
    n: annotations.length,
    recordsWithAnyBigram: recordsWithBigram.size,
    unigrams: emit(uni),
    bigrams: emit(bi),
    trigrams: emit(tri),
    note:
      "recordSupport (distinct records) is the primary weight; occurrenceCount is diagnostic only. " +
      "A transition repeated inside one long message adds at most +1 recordSupport.",
  };
}

// ---------------------------------------------------------------------------
// §6 Driving-force → strategy discovery, with A/B evidence split.
// ---------------------------------------------------------------------------
// Tier A: candidate has recordSpecificSupport in {moderate,strong}  → primary
// Tier B: recordSpecificSupport === none but priorContribution > none → exploratory ONLY
// Records where a candidate is prior-only NEVER count toward the primary coupling (§6/§18).
function primaryStrategyOf(ann) {
  const f = (ann.interactionFunctions?.functions || []).find((x) => x.role === "primary");
  return f ? f.function : null;
}

export function discoverDrivingForceStrategy(annotations) {
  const primary = new Map();     // "driver>strategy" -> Set(records)
  const secondary = new Map();   // moderate record support
  const exploratory = new Map(); // prior-only / weak
  const bump = (m, k, link) => { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } s.add(link); };

  for (const ann of annotations) {
    const link = linkOf(ann);
    const strat = primaryStrategyOf(ann);
    if (!strat) continue;
    for (const d of ann.drivingForceCandidates || []) {
      const key = d.candidate + ">" + strat;
      const rss = d.recordSpecificSupport;
      const priorOnly = rss === "none" && d.priorContribution && d.priorContribution !== "none";
      if (rss === "strong") bump(primary, key, link);
      else if (rss === "moderate") bump(secondary, key, link);
      else if (priorOnly || WEAK.has(d.confidence)) bump(exploratory, key, link);
    }
  }
  const emit = (m) =>
    [...m.entries()]
      .map(([key, s]) => ({ key, recordSupport: s.size, supportingLinks: sortedLinks(s) }))
      .sort((a, b) => b.recordSupport - a.recordSupport || byKeyThenLink(a, b));

  return {
    status: PILOT_TAG,
    tierA_recordSpecificStrong: emit(primary),
    tierB_recordSpecificModerate: emit(secondary),
    exploratory_priorOrWeakOnly: emit(exploratory),
    note:
      "Tier A/B are record-grounded couplings. exploratory is prior-only/weak and must NOT be " +
      "read as validated (§6). Character prior existing is not evidence.",
  };
}

// ---------------------------------------------------------------------------
// §8 Affect → strategy coupling. Keeps simultaneous vs sequential separate (§8).
// ---------------------------------------------------------------------------
function affectConfig(ann) {
  const a = ann.affect || {};
  const parts = [];
  if (a.primarySurface?.value) parts.push("surface:" + a.primarySurface.value);
  if (a.opposingAffect?.value) parts.push("opposing:" + a.opposingAffect.value);
  if (a.maskedAffect?.value) parts.push("masked:" + a.maskedAffect.value);
  if (a.leakedAffect?.value) parts.push("leaked:" + a.leakedAffect.value);
  return { config: parts.join("+") || "surface:unknown", coexistence: a.coexistenceType || "unknown" };
}

export function discoverAffectStrategy(annotations) {
  const buckets = { simultaneous: new Map(), sequential: new Map(), other: new Map() };
  const bump = (m, k, link) => { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } s.add(link); };
  for (const ann of annotations) {
    const link = linkOf(ann);
    const strat = primaryStrategyOf(ann);
    if (!strat) continue;
    const { config, coexistence } = affectConfig(ann);
    const bucket = coexistence === "simultaneous" ? buckets.simultaneous
      : coexistence === "sequential" ? buckets.sequential : buckets.other;
    bump(bucket, config + " => " + strat, link);
  }
  const emit = (m) =>
    [...m.entries()]
      .map(([key, s]) => ({ key, recordSupport: s.size, supportingLinks: sortedLinks(s) }))
      .sort((a, b) => b.recordSupport - a.recordSupport || byKeyThenLink(a, b));
  return {
    status: PILOT_TAG,
    simultaneous: emit(buckets.simultaneous),
    sequential: emit(buckets.sequential),
    other_or_single_affect: emit(buckets.other),
    note: "simultaneous and sequential blends are reported separately and never merged (§8).",
  };
}

// ---------------------------------------------------------------------------
// §7 Trigger sensitivity discovery. Reports low-trigger/high-activation evidence per domain.
// NEVER outputs an activation number or curve — only support counts + conflicting records (§7).
// ---------------------------------------------------------------------------
const LOW_TRIGGER = new Set(["minimal", "low"]);
const HIGH_ACTIVATION = new Set(["high"]);

export function discoverTriggerSensitivity(annotations) {
  const dom = new Map(); // domain -> {records:Set, lowHigh:Set, conflicts:Set}
  for (const ann of annotations) {
    const link = linkOf(ann);
    const t = ann.triggerSensitivity || {};
    const d = t.domain || "other";
    let e = dom.get(d);
    if (!e) { e = { records: new Set(), lowHigh: new Set(), conflicts: new Set() }; dom.set(d, e); }
    e.records.add(link);
    const low = LOW_TRIGGER.has(t.observedTriggerIntensity);
    const high = HIGH_ACTIVATION.has(t.inferredInternalActivation);
    if (low && high) e.lowHigh.add(link);
    // conflict = a HIGH observed trigger with LOW activation in the same domain (dampens the claim)
    if (t.observedTriggerIntensity === "high" && t.inferredInternalActivation === "low") e.conflicts.add(link);
  }
  return {
    status: PILOT_TAG,
    domains: [...dom.entries()]
      .map(([domain, e]) => ({
        domain,
        domainRecordCount: e.records.size,
        lowTriggerHighActivationSupport: e.lowHigh.size,
        conflictingRecordCount: e.conflicts.size,
        supportingLinks: sortedLinks(e.lowHigh),
        conflictingLinks: sortedLinks(e.conflicts),
        provisional_status: e.lowHigh.size >= 2 ? "worth_testing_at_larger_n" : "anecdotal",
        context_limitation:
          "single-sided corpus: observedTriggerIntensity is inferred from the utterance alone; " +
          "no partner turn confirms the actual stimulus magnitude.",
      }))
      .sort((a, b) => b.lowTriggerHighActivationSupport - a.lowTriggerHighActivationSupport || (a.domain < b.domain ? -1 : 1)),
    note: "No activation numbers or curves (§7). Low-trigger+high-activation is a candidate, not a law.",
  };
}

// ---------------------------------------------------------------------------
// §9 Reveal / Mask grammar. Does NOT treat every retract as a mask (§21.7).
// A mask-like edge = reveal followed by a concealing/deflecting move.
// ---------------------------------------------------------------------------
const CONCEAL_MOVES = new Set(["mask", "conceal", "countermask", "retract", "tease", "self_devalue", "perform_confidence", "justify"]);
const REVEAL_MOVES = new Set(["reveal", "seek_confirmation", "seek_attention"]);

export function discoverRevealMask(annotations) {
  const edges = new Map(); // "reveal>X" -> Set(records)
  const revealRecords = new Set();
  const revealThenConceal = new Set();
  const revealNoMask = new Set();
  const bump = (k, link) => { let s = edges.get(k); if (!s) { s = new Set(); edges.set(k, s); } s.add(link); };

  for (const ann of annotations) {
    const link = linkOf(ann);
    const acts = orderedActions(ann);
    let hasReveal = false, masked = false;
    for (let i = 0; i < acts.length; i++) {
      if (REVEAL_MOVES.has(acts[i].action)) {
        hasReveal = true;
        if (i + 1 < acts.length && CONCEAL_MOVES.has(acts[i + 1].action)) {
          bump(acts[i].action + ">" + acts[i + 1].action, link);
          masked = true;
        }
      }
    }
    if (hasReveal) {
      revealRecords.add(link);
      if (masked) revealThenConceal.add(link); else revealNoMask.add(link);
    }
  }
  const emit = () =>
    [...edges.entries()]
      .map(([key, s]) => ({ key, recordSupport: s.size, supportingLinks: sortedLinks(s) }))
      .sort((a, b) => b.recordSupport - a.recordSupport || byKeyThenLink(a, b));
  return {
    status: PILOT_TAG,
    revealBearingRecords: revealRecords.size,
    revealThenConcealRecords: revealThenConceal.size,
    revealWithoutMaskRecords: sortedLinks(revealNoMask),      // §9.5 scenes where she does NOT mask
    maskEdges: emit(),
    maskRate: pilotRate(revealThenConceal.size, revealRecords.size),
    note:
      "A retract is only counted as a mask when it directly follows a reveal-type move (§21.7). " +
      "revealWithoutMask lists the counter-scenes — she does not always mask after exposing need.",
  };
}

// ---------------------------------------------------------------------------
// §10 Relationship operation discovery. Directional only — NO numeric distance/security (§10).
// ---------------------------------------------------------------------------
export function discoverRelationshipOperations(annotations) {
  const opFreq = new Map();          // operation -> Set(records)
  const seqToOp = new Map();         // "lastAction => operation" -> Set(records)
  let presentCount = 0;
  const bump = (m, k, link) => { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } s.add(link); };

  for (const ann of annotations) {
    const rm = ann.relationshipManagement;
    if (!rm || rm.present !== true) continue;
    presentCount += 1;
    const link = linkOf(ann);
    const acts = orderedActions(ann);
    const last = acts.length ? acts[acts.length - 1].action : "no_clear_action";
    for (const op of rm.operations || []) {
      bump(opFreq, op, link);
      bump(seqToOp, last + " => " + op, link);
    }
  }
  const emit = (m) =>
    [...m.entries()]
      .map(([key, s]) => ({ key, recordSupport: s.size, supportingLinks: sortedLinks(s) }))
      .sort((a, b) => b.recordSupport - a.recordSupport || byKeyThenLink(a, b));
  return {
    status: PILOT_TAG,
    relationshipManagementPresentRecords: presentCount,
    operationFrequency: emit(opFreq),
    finalActionToOperation: emit(seqToOp),
    note: "Directional operations only. No +/- magnitudes are produced (§10).",
  };
}

// ---------------------------------------------------------------------------
// §11 Expected partner operation. Merges the 3 expectedReply tiers into partner-op candidates.
// Does NOT fabricate a partner turn (§11/§14/§21.9) — these are EXPECTED ops, not observed replies.
// ---------------------------------------------------------------------------
export function discoverPartnerOperations(annotations) {
  const stratToOp = new Map(); // "strategy => partnerOp(tier)" -> Set(records)
  const bump = (k, link) => { let s = stratToOp.get(k); if (!s) { s = new Set(); stratToOp.set(k, s); } s.add(link); };
  for (const ann of annotations) {
    const link = linkOf(ann);
    const strat = primaryStrategyOf(ann);
    if (!strat) continue;
    const er = ann.expectedReply || {};
    const tiers = [
      ["immediate", er.immediateReply],
      ["relationship", er.relationshipReply],
      ["longerTerm", er.longerTermReply],
    ];
    for (const [tier, r] of tiers) {
      for (const op of (r?.classes || [])) {
        if (op === "unknown") continue;
        bump(strat + " => " + op + " [" + tier + "]", link);
      }
    }
  }
  const rows = [...stratToOp.entries()]
    .map(([key, s]) => ({ key, recordSupport: s.size, supportingLinks: sortedLinks(s) }))
    .sort((a, b) => b.recordSupport - a.recordSupport || byKeyThenLink(a, b));
  return {
    status: PILOT_TAG,
    strategyToExpectedPartnerOperation: rows,
    note:
      "These are EXPECTED partner operations declared by the annotation, NOT observed partner turns. " +
      "Single-sided corpus cannot confirm the partner actually did them (§11/§14).",
  };
}

// ---------------------------------------------------------------------------
// §12 Performance / mask discovery. public/private is NOT equated with performance (§21.14).
// ---------------------------------------------------------------------------
const PERFORMANCE_ACTIONS = new Set(["perform_confidence", "drop_performance", "maintain_performance"]);
const PERFORMANCE_FLAGS = new Set(["public_private_ambiguity", "persona_surface_uncertain"]);

export function discoverPerformancePatterns(annotations) {
  const edges = new Map();
  const bump = (k, link) => { let s = edges.get(k); if (!s) { s = new Set(); edges.set(k, s); } s.add(link); };
  let performanceRecords = new Set();
  let dropThenRestore = new Set();
  let privatePerformance = new Set();

  for (const ann of annotations) {
    const link = linkOf(ann);
    const acts = orderedActions(ann);
    const actionNames = acts.map((a) => a.action);
    const hasPerf = actionNames.some((a) => PERFORMANCE_ACTIONS.has(a)) ||
      (ann.metaSelfMonitoring?.tags || []).includes("awareness_of_performance");
    if (hasPerf) performanceRecords.add(link);
    for (let i = 0; i + 1 < acts.length; i++) {
      if (PERFORMANCE_ACTIONS.has(actionNames[i]) || PERFORMANCE_ACTIONS.has(actionNames[i + 1])) {
        bump(actionNames[i] + ">" + actionNames[i + 1], link);
      }
    }
    // drop_performance later followed by perform_confidence/maintain = restore
    const dropIdx = actionNames.indexOf("drop_performance");
    if (dropIdx >= 0 && actionNames.slice(dropIdx + 1).some((a) => a === "perform_confidence" || a === "maintain_performance")) {
      dropThenRestore.add(link);
    }
    // private-context performance: performance action but target is not audience/public
    const target = ann.l1_observable?.target;
    if (hasPerf && target && target !== "audience" && target !== "public") privatePerformance.add(link);
  }
  const emit = () =>
    [...edges.entries()]
      .map(([key, s]) => ({ key, recordSupport: s.size, supportingLinks: sortedLinks(s) }))
      .sort((a, b) => b.recordSupport - a.recordSupport || byKeyThenLink(a, b));
  return {
    status: PILOT_TAG,
    performanceBearingRecords: performanceRecords.size,
    dropThenRestoreRecords: sortedLinks(dropThenRestore),
    privateContextPerformanceRecords: sortedLinks(privatePerformance), // §12.5
    performanceEdges: emit(),
    note:
      "Performance is detected from performance ACTIONS / awareness tags, NOT from public/private " +
      "target alone (§21.14). privateContextPerformance shows performance also occurs off-stage.",
  };
}

// ---------------------------------------------------------------------------
// §13 Intra-message momentum. Single-utterance arcs ONLY — never cross-turn (§14).
// ---------------------------------------------------------------------------
const ESCALATE = new Set(["escalate", "accuse", "demand", "threaten_symbolically", "push_away"]);
const REPAIR = new Set(["repair", "reassure_partner", "justify", "deescalate", "retract", "self_devalue"]);
const REVEAL_SET = new Set(["reveal", "seek_confirmation"]);

export function discoverIntraMessageMomentum(annotations) {
  const arcs = [];
  for (const ann of annotations) {
    const acts = orderedActions(ann);
    if (acts.length < 2) continue; // momentum needs >=2 beats
    const names = acts.map((a) => a.action);
    const rm = ann.relationshipManagement;
    const finalOp = rm && rm.present ? (rm.operations || []) : [];
    const er = ann.expectedReply?.immediateReply?.classes || [];
    arcs.push({
      link: linkOf(ann),
      sequenceLength: acts.length,
      escalationPoints: names.filter((n) => ESCALATE.has(n)).length,
      repairPoints: names.filter((n) => REPAIR.has(n)).length,
      revealPoints: names.filter((n) => REVEAL_SET.has(n)).length,
      finalRelationshipOperation: [...finalOp].sort(),
      finalExpectedPartnerOperation: [...er].filter((x) => x !== "unknown").sort(),
      arc: names.join(">"),
    });
  }
  arcs.sort((a, b) => b.sequenceLength - a.sequenceLength || (a.link < b.link ? -1 : 1));
  return {
    status: PILOT_TAG,
    multiBeatRecords: arcs.length,
    arcs,
    note:
      "Intra-message arcs only. No partner turn exists in evidence, so these are NOT cross-turn " +
      "conversation grammar (§14). possible_next_strategy is deliberately left unknown.",
  };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator. Returns the full discovery bundle (private, carries links).
// ---------------------------------------------------------------------------
export function runDiscovery(annotations) {
  return {
    formatVersion: 1,
    status: PILOT_TAG,
    n: annotations.length,
    transitions: discoverTransitions(annotations),
    drivingForceStrategy: discoverDrivingForceStrategy(annotations),
    affectStrategy: discoverAffectStrategy(annotations),
    triggerSensitivity: discoverTriggerSensitivity(annotations),
    revealMask: discoverRevealMask(annotations),
    relationshipOperations: discoverRelationshipOperations(annotations),
    partnerOperations: discoverPartnerOperations(annotations),
    performancePatterns: discoverPerformancePatterns(annotations),
    intraMessageMomentum: discoverIntraMessageMomentum(annotations),
  };
}

// P1-1C §10-16 — context-conditioned behavior dimensions.
//
// The 50 stage reported raw frequencies ("driving force X appears N times"). At 200 the directive
// (§10-16) is to report each dimension CONDITIONED ON CONTEXT, and — because the 160 set mixes two
// annotation instruments — to split every dimension by cohort so the reader can see whether a shift
// is a property of the CHARACTER or of the INSTRUMENT.
//
//   §10 characterPriors        : driving-force prior, conditioned on trigger domain (not a flat count)
//   §11 triggerSensitivity     : observed-trigger × inferred-activation matrix (the hair-trigger cells)
//   §12 intraMessageMomentum   : arc-shape distribution among multi-beat records (escalate/repair/flat)
//   §13 expectedPartnerOps     : which partner operation each utterance is engineered to elicit
//   §14 performancePatterns    : perform→drop / perform-in-private, conditioned on audience context
//   §15 (performance metrics)   : folded into §14 (same discovery block) — kept as one dimension
//   §16 maskAnalysis           : FUNCTIONAL mask rate among reveal-bearing records (definition-gated)
//
// EVERY dimension carries a `byCohort` block: { carried_50, heuristic_110 } computed independently,
// plus a `cohortNote` when the two disagree materially. This is the honest carrier of the
// instrument-shift confound down to the dimension level — a global disclaimer is not enough.

import { acc } from "./counterexample.mjs";

// ---- cohort helpers ------------------------------------------------------------------------------

export const COHORT = Object.freeze({ CARRIED: "carried_50", HEURISTIC: "heuristic_110" });

export function cohortOf(a) {
  return acc.isHeuristic(a) ? COHORT.HEURISTIC : COHORT.CARRIED;
}

function splitCohorts(annotations) {
  const carried = [];
  const heuristic = [];
  for (const a of annotations) (cohortOf(a) === COHORT.HEURISTIC ? heuristic : carried).push(a);
  return { carried, heuristic };
}

// Run a per-cohort reducer and attach a materiality note when a target rate diverges by >= 0.25.
function withCohorts(annotations, reducer, rateOf) {
  const { carried, heuristic } = splitCohorts(annotations);
  const all = reducer(annotations);
  const byCohort = { carried_50: reducer(carried), heuristic_110: reducer(heuristic) };
  let cohortNote = null;
  if (rateOf) {
    const rc = rateOf(byCohort.carried_50);
    const rh = rateOf(byCohort.heuristic_110);
    if (rc != null && rh != null && Math.abs(rc - rh) >= 0.25) {
      cohortNote =
        "cohort divergence >= 0.25: this dimension is instrument-sensitive — the two annotation " +
        "instruments disagree on it, so the 160-level number is NOT a clean character estimate.";
    }
  }
  return { all, byCohort, cohortNote };
}

function rate(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 1000 : null;
}

function topEntries(map, k = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k)
    .map(([key, count]) => ({ key, count }));
}

// =================================================================================================
// §10 — character priors, CONTEXT-CONDITIONED.
// Not "how often does force X appear" but "given trigger domain D, what is the driving-force prior".
// A flat prior would let a domain-specific artefact masquerade as a stable trait.
// =================================================================================================

export function characterPriors(annotations) {
  const reducer = (anns) => {
    const flat = new Map(); // force -> record count (>=1 per record)
    const byDomain = new Map(); // domain -> Map(force -> count)
    let recordsWithForce = 0;
    for (const a of anns) {
      const forces = new Set(acc.drivingForces(a).filter(Boolean));
      if (forces.size > 0) recordsWithForce++;
      const domain = acc.triggerDomain(a);
      if (!byDomain.has(domain)) byDomain.set(domain, new Map());
      const dm = byDomain.get(domain);
      for (const f of forces) {
        flat.set(f, (flat.get(f) || 0) + 1);
        dm.set(f, (dm.get(f) || 0) + 1);
      }
    }
    const conditioned = [...byDomain.entries()]
      .map(([domain, dm]) => {
        const domainRecords = anns.filter((a) => acc.triggerDomain(a) === domain).length;
        return {
          triggerDomain: domain,
          domainRecords,
          topForces: topEntries(dm, 5).map((e) => ({ force: e.key, records: e.count, shareOfDomain: rate(e.count, domainRecords) })),
        };
      })
      .sort((a, b) => b.domainRecords - a.domainRecords || (a.triggerDomain < b.triggerDomain ? -1 : 1));
    return {
      n: anns.length,
      recordsWithForce,
      flatTopForces: topEntries(flat, 8).map((e) => ({ force: e.key, records: e.count, shareOfN: rate(e.count, anns.length) })),
      conditionedByTriggerDomain: conditioned,
    };
  };
  const { all, byCohort, cohortNote } = withCohorts(
    annotations,
    reducer,
    (r) => rate(r.recordsWithForce, r.n),
  );
  return {
    dimension: "character_priors",
    conditioning: "trigger_domain",
    interpretation:
      "Driving-force prior is reported per trigger domain, not as a flat count, so a force that only " +
      "fires under one narrow domain is not mistaken for a stable character-wide prior.",
    ...all,
    byCohort,
    cohortNote,
  };
}

// =================================================================================================
// §11 — trigger sensitivity matrix: observedTriggerIntensity × inferredInternalActivation.
// The "hair-trigger" cell is (low/minimal observed) × (high inferred). We report the WHOLE matrix so
// the counter-cells (low observed × low inferred) are visible and bound the hair-trigger claim (H5).
// =================================================================================================

const OBS_LEVELS = ["minimal", "low", "medium", "high", "unknown"];
const ACT_LEVELS = ["low", "medium", "high", "unknown"];

export function triggerSensitivityMatrix(annotations) {
  const reducer = (anns) => {
    const cells = new Map(); // "obs|act" -> count
    let hairTrigger = 0;
    let lowLow = 0;
    let judgeable = 0; // both axes known
    for (const a of anns) {
      const t = a.triggerSensitivity || {};
      const obs = OBS_LEVELS.includes(t.observedTriggerIntensity) ? t.observedTriggerIntensity : "unknown";
      const act = ACT_LEVELS.includes(t.inferredInternalActivation) ? t.inferredInternalActivation : "unknown";
      cells.set(`${obs}|${act}`, (cells.get(`${obs}|${act}`) || 0) + 1);
      const lowObs = obs === "low" || obs === "minimal";
      if (lowObs && act !== "unknown") judgeable++;
      if (lowObs && act === "high") hairTrigger++;
      if (lowObs && act === "low") lowLow++;
    }
    const matrix = [];
    for (const obs of OBS_LEVELS) {
      for (const act of ACT_LEVELS) {
        const c = cells.get(`${obs}|${act}`) || 0;
        if (c > 0) matrix.push({ observed: obs, inferred: act, count: c });
      }
    }
    return {
      n: anns.length,
      matrix,
      hairTriggerCount: hairTrigger,
      lowObservedLowInferredCount: lowLow,
      lowObservedJudgeable: judgeable,
      hairTriggerRateAmongJudgeable: rate(hairTrigger, judgeable),
    };
  };
  const { all, byCohort, cohortNote } = withCohorts(
    annotations,
    reducer,
    (r) => r.hairTriggerRateAmongJudgeable,
  );
  return {
    dimension: "trigger_sensitivity_matrix",
    conditioning: "observed_x_inferred",
    caveat:
      "single-sided corpus: observedTriggerIntensity is inferred from the utterance alone; no " +
      "partner turn confirms the true stimulus magnitude. The hair-trigger cell is a hypothesis, " +
      "not a measurement.",
    ...all,
    byCohort,
    cohortNote,
  };
}

// =================================================================================================
// §12 — intra-message momentum: arc-shape distribution among MULTI-BEAT records.
// Conditioned on beat count. We classify each multi-beat arc as escalating / repairing / mixed / flat
// so H9 (escalation dominates) is answerable against its own denominator.
// =================================================================================================

function arcShape(a) {
  const seq = (a.behaviorActionSequence || []).slice().sort((x, y) => (x.order || 0) - (y.order || 0));
  if (seq.length < 2) return null;
  const ESCALATE = new Set(["accuse", "demand", "threaten", "escalate", "pressure", "test"]);
  const REPAIR = new Set(["repair", "reassure_self", "soothe", "de_escalate", "apologize", "justify"]);
  let esc = 0;
  let rep = 0;
  for (const s of seq) {
    const act = s.action || "";
    if (ESCALATE.has(act)) esc++;
    if (REPAIR.has(act)) rep++;
  }
  if (esc > 0 && rep > 0) return "mixed";
  if (esc > 0) return "escalating";
  if (rep > 0) return "repairing";
  return "flat";
}

export function intraMessageMomentum(annotations) {
  const reducer = (anns) => {
    const multi = anns.filter((a) => (a.behaviorActionSequence || []).length >= 2);
    const shapes = new Map();
    for (const a of multi) {
      const s = arcShape(a);
      if (s) shapes.set(s, (shapes.get(s) || 0) + 1);
    }
    const escalating = shapes.get("escalating") || 0;
    const mixed = shapes.get("mixed") || 0;
    return {
      n: anns.length,
      multiBeatRecords: multi.length,
      shapeDistribution: topEntries(shapes, 6),
      escalationBearingRecords: escalating + mixed,
      escalationRateAmongMultiBeat: rate(escalating + mixed, multi.length),
    };
  };
  const { all, byCohort, cohortNote } = withCohorts(
    annotations,
    reducer,
    (r) => r.escalationRateAmongMultiBeat,
  );
  return {
    dimension: "intra_message_momentum",
    conditioning: "multi_beat_only",
    interpretation:
      "Arc shape is distributed over multi-beat records only. escalating+mixed = escalation-bearing; " +
      "repairing/flat are the counter-shapes that bound H9.",
    ...all,
    byCohort,
    cohortNote,
  };
}

// =================================================================================================
// §13 — expected partner operations: which reply each utterance is engineered to elicit.
// Conditioned on whether the immediate expectation is confidently stated (contextRequired != high or
// confidence != weak) vs speculative, so we do not over-credit thin inferences.
// =================================================================================================

export function expectedPartnerOperations(annotations) {
  const reducer = (anns) => {
    const immediate = new Map();
    let confidentRecords = 0;
    let anyExpectation = 0;
    for (const a of anns) {
      const ir = a.expectedReply?.immediateReply;
      const classes = (ir?.classes || []).filter((c) => c && c !== "unknown");
      if (classes.length > 0) {
        anyExpectation++;
        const conf = ir?.confidence;
        if (conf && conf !== "unknown" && conf !== "weak_inference") confidentRecords++;
        for (const c of classes) immediate.set(c, (immediate.get(c) || 0) + 1);
      }
    }
    return {
      n: anns.length,
      recordsWithExpectation: anyExpectation,
      confidentExpectationRecords: confidentRecords,
      expectationRate: rate(anyExpectation, anns.length),
      topExpectedImmediateOps: topEntries(immediate, 8),
    };
  };
  const { all, byCohort, cohortNote } = withCohorts(
    annotations,
    reducer,
    (r) => r.expectationRate,
  );
  return {
    dimension: "expected_partner_operations",
    conditioning: "confidence_gated",
    interpretation:
      "Every utterance is scored for the partner operation it is engineered to elicit; confident vs " +
      "speculative expectations are counted separately so thin inferences do not inflate H8.",
    ...all,
    byCohort,
    cohortNote,
  };
}

// =================================================================================================
// §14/§15 — performance patterns + metrics, conditioned on audience context.
// perform_confidence bearing records; of those, how many drop-then-restore, how many occur in a
// private (no-audience) context (the "performing for one" case). Folds §15 metrics into the block.
// =================================================================================================

export function performancePatterns(annotations) {
  const reducer = (anns) => {
    let performBearing = 0;
    let dropThenRestore = 0;
    let privateContext = 0;
    for (const a of anns) {
      const acts = acc.actions(a);
      const hasPerform = acts.includes("perform_confidence") || acc.functions(a).includes("perform_confidence");
      if (!hasPerform) continue;
      performBearing++;
      // drop-then-restore: a perform followed later by a reveal/self_devalue then a later perform/repair
      const idxP = acts.indexOf("perform_confidence");
      const laterDrop = acts.slice(idxP + 1).some((x) => x === "reveal" || x === "self_devalue");
      const restore = laterDrop && acts.slice(idxP + 1).some((x) => x === "perform_confidence" || x === "repair");
      if (restore) dropThenRestore++;
      // private context: no audience/public trigger domain
      const dom = acc.triggerDomain(a);
      if (dom !== "public_evaluation" && dom !== "audience_metrics") privateContext++;
    }
    return {
      n: anns.length,
      performanceBearingRecords: performBearing,
      dropThenRestoreRecords: dropThenRestore,
      privateContextPerformanceRecords: privateContext,
      performanceRate: rate(performBearing, anns.length),
      privateShareOfPerformance: rate(privateContext, performBearing),
    };
  };
  const { all, byCohort, cohortNote } = withCohorts(
    annotations,
    reducer,
    (r) => r.performanceRate,
  );
  return {
    dimension: "performance_patterns",
    conditioning: "audience_context",
    interpretation:
      "Performance is conditioned on audience: privateContext = perform_confidence firing OUTSIDE a " +
      "public/audience trigger domain — i.e. performing for a single partner, the theoretically " +
      "interesting case.",
    ...all,
    byCohort,
    cohortNote,
  };
}

// =================================================================================================
// §16 — mask analysis, FUNCTIONAL definition.
// mask=true requires reducing exposure of a JUST-REVEALED vulnerability. Surface conceal-token
// adjacency does NOT qualify. Rate is computed over reveal-bearing records only (its real denominator).
// =================================================================================================

export function maskAnalysis(annotations) {
  const reducer = (anns) => {
    let revealBearing = 0;
    let functionalMask = 0;
    let revealWithoutMask = 0;
    const strategies = new Map();
    for (const a of anns) {
      const hasReveal = acc.actions(a).includes("reveal") || acc.actions(a).includes("self_devalue");
      if (!hasReveal) continue;
      revealBearing++;
      if (acc.functionalMask(a)) {
        functionalMask++;
        const st = acc.maskStrategy(a);
        if (st) strategies.set(st, (strategies.get(st) || 0) + 1);
      } else {
        revealWithoutMask++;
      }
    }
    return {
      n: anns.length,
      revealBearingRecords: revealBearing,
      functionalMaskRecords: functionalMask,
      revealWithoutMaskRecords: revealWithoutMask,
      functionalMaskRateAmongReveals: rate(functionalMask, revealBearing),
      maskStrategies: topEntries(strategies, 6),
    };
  };
  const { all, byCohort, cohortNote } = withCohorts(
    annotations,
    reducer,
    (r) => r.functionalMaskRateAmongReveals,
  );
  return {
    dimension: "mask_analysis",
    conditioning: "functional_definition",
    definition:
      "mask=true requires reducing the exposure of a JUST-REVEALED vulnerability; surface " +
      "conceal-token adjacency alone does NOT qualify. Denominator is reveal-bearing records only.",
    instrumentWarning:
      "the conservative heuristic annotator UNDER-detects functional masks (it needs an explicit " +
      "reveal→conceal adjacency). A low heuristic_110 mask rate is expected from the instrument and " +
      "must NOT be read as the character masking less.",
    ...all,
    byCohort,
    cohortNote,
  };
}

// ---- orchestrator --------------------------------------------------------------------------------

export function analyzeDimensions(annotations) {
  return {
    formatVersion: 1,
    n: annotations.length,
    cohortSizes: (() => {
      const { carried, heuristic } = splitCohorts(annotations);
      return { carried_50: carried.length, heuristic_110: heuristic.length };
    })(),
    dimensions: {
      characterPriors: characterPriors(annotations),
      triggerSensitivityMatrix: triggerSensitivityMatrix(annotations),
      intraMessageMomentum: intraMessageMomentum(annotations),
      expectedPartnerOperations: expectedPartnerOperations(annotations),
      performancePatterns: performancePatterns(annotations),
      maskAnalysis: maskAnalysis(annotations),
    },
  };
}

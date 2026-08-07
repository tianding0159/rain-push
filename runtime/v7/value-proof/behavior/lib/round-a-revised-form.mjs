// Revised Round-A annotation form factory (P1-1A.2, directive §1 pipeline).
//
// Produces ONE empty revised annotation form for a single utterance, matching
// behavior-annotation-revised.schema.json (recordFormatVersion 2). Like the v1 form it carries the raw
// text so a human/model can read it and a presentationId — nothing that primes the answer (no bucket,
// no selection reason, no pre-filled inference). The revised model adds: behavior action sequence,
// multi-function interaction, driving-force candidates (with prior/record separation), trigger
// sensitivity, relationship management, meta self-monitoring, and a three-layer expected reply.
//
// This module only SHAPES the form; enum legality + count caps + prior/record separation are enforced
// by revised-annotation.mjs against behavior-vocab.json. Keeping the empty-form shape here (not the
// legality) means the form stays a thin scaffold and the vocab file remains the single source of truth.

export const CONFIDENCE_TAGS = ["explicit", "strongly_supported", "weak_inference", "unknown"];
export const ROUND_A_GRADES = ["E0", "E1", "E2"];
export const PRIOR_STRENGTHS = ["none", "weak", "moderate", "strong"];
export const REVISED_RECORD_FORMAT_VERSION = 2;

// Cap constants the validator enforces — exported so tests and generators reference one source.
export const FUNCTION_ROLE_CAPS = Object.freeze({ primary: 1, secondary: 2, supporting: 3 });
export const MAX_DRIVING_FORCES = 3;
export const MAX_ACTIONS = 8;

// Same six failure-risk prompts as v1 — the anti-overconfidence gate is unchanged (directive §5/§17).
export const FAILURE_RISK_PROMPTS = [
  { id: "missing_context", q: "缺失的上文/对方话轮可能怎样改变这句的理解？" },
  { id: "maybe_joke", q: "这是否可能只是玩笑 / 反话 / 撒娇，而非字面意思？" },
  { id: "maybe_public_performance", q: "这是否可能是 KAngel 式的公开表演 / 面向观众，而非私下真心？" },
  { id: "maybe_quoting", q: "这是否可能在引用别人的话 / 复述 / 模仿，而非本人表达？" },
  { id: "maybe_plot_event", q: "这是否可能属于剧情特殊事件（如嗑药/发病/特定桥段），不代表常态？" },
  { id: "alternative_reading", q: "是否存在一个与你首选解释完全不同、但同样成立的读法？" },
];

function emptyAffectDim() {
  return { value: "", confidence: "" };
}
function emptyReplyLayer() {
  return { classes: [], confidence: "", textualEvidence: "", alternatives: [], contextRequired: "" };
}

// Build one empty revised form. presentationId + text are the ONLY populated fields.
export function makeRoundARevisedForm(presentationId, text) {
  return {
    recordFormatVersion: REVISED_RECORD_FORMAT_VERSION,
    presentationId,
    text, // raw utterance — the reviewer reads this (private-only when filled with real corpus)
    annotator: "",
    round: "A",
    annotationNature: "model_assisted_research_annotation",

    // ---- L1 Observable (no psychology) ----
    l1_observable: {
      observableActs: [],
      grammaticalForm: [],
      target: "",
      explicitRequest: null,
      explicitRefusal: null,
      selfDisclosure: null,
      insultOrTease: null,
      personaSurfaceCandidate: "",
      punctuationRhythmNotes: "",
    },

    // ---- Behavior Action Sequence (1..8, text order) ----
    // each: { action, order, confidence, textualEvidence, notes }
    behaviorActionSequence: [],

    // ---- Multi-function interaction (primary<=1, secondary<=2, supporting<=3) ----
    // functions[]: { function, role, confidence, textualEvidence, alternatives, contextDependency }
    interactionFunctions: { functions: [] },

    // ---- Affect structure (fill a dimension only when evidenced) ----
    affect: {
      primarySurface: emptyAffectDim(),
      opposingAffect: emptyAffectDim(),
      maskedAffect: emptyAffectDim(),
      leakedAffect: emptyAffectDim(),
      coexistenceType: "", // simultaneous | sequential | ambiguous | unknown
    },

    // ---- Driving force candidates (max 3; prior vs record kept separate) ----
    // each: { candidate, confidence, evidence, alternativeExplanation, whatWouldChangeMyMind,
    //         contextDependency, inferredFrom[], priorContribution, recordSpecificSupport }
    drivingForceCandidates: [],

    // ---- Trigger sensitivity (characteristically_low needs cross-corpus prior) ----
    triggerSensitivity: {
      domain: "",
      observedTriggerIntensity: "",   // minimal|low|medium|high|unknown
      inferredInternalActivation: "", // low|medium|high|unknown
      thresholdInterpretation: "",    // ordinary|characteristically_low|characteristically_high|unknown
      confidence: "",
      evidence: "",
      requiresCrossCorpusSupport: false,
    },

    // ---- Relationship management (never default present:true) ----
    relationshipManagement: { present: false, operations: [], confidence: "", evidence: "" },

    // ---- Meta self-monitoring (not defaulted) ----
    metaSelfMonitoring: { tags: [], confidence: "", evidence: "" },

    // ---- State context (adult/dark/drug are amplifiers, not driving forces) ----
    stateContext: { domains: [], notes: "" },

    // ---- Expected reply — three independent layers ----
    expectedReply: {
      immediateReply: emptyReplyLayer(),
      relationshipReply: emptyReplyLayer(),
      longerTermReply: emptyReplyLayer(),
      likelyUnsatisfyingReplyClasses: [],
    },

    // ---- Evidence grade (single-record → E0/E1/E2 ONLY) ----
    evidenceGrade: "",

    // ---- Review flags + failure-risk checklist ----
    reviewFlags: [],
    failureRiskNotes: FAILURE_RISK_PROMPTS.map((p) => ({ id: p.id, note: "" })),
  };
}

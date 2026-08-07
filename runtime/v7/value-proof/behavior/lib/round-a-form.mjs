// Round-A annotation form factory (directive §5).
//
// Produces ONE empty annotation form for a single utterance. The form is what a HUMAN reviewer
// fills in. It carries the raw text (so the human can read it) and a randomized presentationId —
// and NOTHING that could prime the answer: no bucket, no selection reason, no emotion/need/reply
// guess, no pattern candidate, no H1-H7, no model prediction.
//
// Field vocab mirrors behavior-vocab.json where an enum exists, but Round A intentionally keeps
// most fields as free text + a confidence tag so the reviewer thinks from the text, not from a
// dropdown of the model's categories. Evidence grade is capped at E0/E1/E2 per directive: E3/E4
// are cross-corpus judgments a single record can't earn, so they are not offered here.

// The four confidence tags every affect / inference field uses.
export const CONFIDENCE_TAGS = ["explicit", "strongly_supported", "weak_inference", "unknown"];

// Round-A evidence grades — single-record only.
export const ROUND_A_GRADES = ["E0", "E1", "E2"];

// The failure-risk prompts the reviewer MUST consider (directive §5). Presented as a checklist of
// questions with a free-text note each — this is the anti-overconfidence gate.
export const FAILURE_RISK_PROMPTS = [
  { id: "missing_context", q: "缺失的上文/对方话轮可能怎样改变这句的理解？" },
  { id: "maybe_joke", q: "这是否可能只是玩笑 / 反话 / 撒娇，而非字面意思？" },
  { id: "maybe_public_performance", q: "这是否可能是 KAngel 式的公开表演 / 面向观众，而非私下真心？" },
  { id: "maybe_quoting", q: "这是否可能在引用别人的话 / 复述 / 模仿，而非本人表达？" },
  { id: "maybe_plot_event", q: "这是否可能属于剧情特殊事件（如嗑药/发病/特定桥段），不代表常态？" },
  { id: "alternative_reading", q: "是否存在一个与你首选解释完全不同、但同样成立的读法？" },
];

// Build one empty form. `presentationId` and `text` are the ONLY populated fields.
export function makeRoundAForm(presentationId, text) {
  return {
    presentationId,
    text, // raw utterance — the reviewer reads this
    // ---- L1 Observable (no psychology) ----
    l1_observable: {
      observableActs: [],        // free text: what the utterance literally DOES
      grammaticalForm: [],       // e.g. question / command / statement / exclamation (free text)
      target: "",                // who it addresses (free text: partner/self/audience/third-party/unknown)
      explicitRequest: null,     // boolean | null
      explicitRefusal: null,     // boolean | null
      selfDisclosure: null,      // boolean | null
      insultOrTease: null,       // boolean | null
      personaSurfaceCandidate: "", // free text: any surface hint of public vs private persona (NOT a verdict)
      punctuationRhythmNotes: "",  // free text: rhythm/punctuation observations
    },
    // ---- L2 Interaction Function ----
    l2_interactionFunction: {
      function: "",              // free text: what it tries to achieve
      confidence: "",            // one of CONFIDENCE_TAGS
      textualEvidence: "",       // quote/point to the words that support it
      alternatives: [],          // other plausible functions
      contextDependency: "",     // free text: how much this depends on missing context
    },
    // ---- L3 Latent Need Candidates (max 3) ----
    l3_latentNeedCandidates: [
      // each: { candidate, confidence(one of CONFIDENCE_TAGS), evidence, alternativeExplanation, whatWouldChangeMyMind }
    ],
    // ---- Affect (each dimension gets a value + a confidence tag) ----
    affect: {
      primarySurface: { value: "", confidence: "" },
      opposingAffect: { value: "", confidence: "" },
      maskedAffect: { value: "", confidence: "" },
      leakedAffect: { value: "", confidence: "" },
    },
    // ---- Expected Reply (functional, no partner text reconstructed) ----
    expectedReply: {
      literalRequest: null,               // boolean | null
      functionalExpectedReplyClasses: [], // free text classes
      likelyUnsatisfyingReplyClasses: [],
      replyInferenceConfidence: "",       // one of CONFIDENCE_TAGS
      contextRequired: "",                // free text
    },
    // ---- Evidence Grade (single-record → E0/E1/E2 ONLY) ----
    evidenceGrade: "",                    // must be one of ROUND_A_GRADES
    // ---- Failure-risk checklist (directive §5) ----
    failureRiskNotes: FAILURE_RISK_PROMPTS.map((p) => ({ id: p.id, question: p.q, note: "" })),
  };
}

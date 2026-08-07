// Shared GPT prompt builder for Round-A annotation (SSOT for both delivery modes).
//
// Two consumers:
//   1. gen-gpt-paste.mjs  → renders a copy-paste markdown pack for the GPT web UI.
//   2. annotate-openai.mjs → sends the same system + per-record user prompt via the OpenAI API.
//
// Both share this module so the instructions a human pastes and the instructions the API sends are
// byte-for-byte the same annotation task. The prompt embeds the failure-risk checklist and the
// E0/E1/E2-only rule, and asks GPT to return STRICT JSON matching the Round-A form shape.
//
// PRIVACY: this module handles verbatim text (it must — GPT has to read the utterance to annotate
// it). It is therefore only ever invoked inside the private boundary; its output is written to
// private/ or streamed to the API from the user's own machine. It never touches git.

import { CONFIDENCE_TAGS, ROUND_A_GRADES, FAILURE_RISK_PROMPTS } from "./round-a-form.mjs";

// The JSON shape we ask GPT to emit per record. Kept in sync with makeRoundAForm() minus text/id
// (those are supplied by us, not the model).
export const GPT_OUTPUT_SHAPE = {
  presentationId: "<echoed>",
  l1_observable: {
    observableActs: ["..."],
    grammaticalForm: ["..."],
    target: "partner|self|audience|third_party|unknown",
    explicitRequest: "true|false|null",
    explicitRefusal: "true|false|null",
    selfDisclosure: "true|false|null",
    insultOrTease: "true|false|null",
    personaSurfaceCandidate: "surface hint only, not a verdict",
    punctuationRhythmNotes: "...",
  },
  l2_interactionFunction: {
    function: "...",
    confidence: CONFIDENCE_TAGS.join("|"),
    textualEvidence: "which characters support it",
    alternatives: ["..."],
    contextDependency: "...",
  },
  l3_latentNeedCandidates: [
    { candidate: "...", confidence: CONFIDENCE_TAGS.join("|"), evidence: "...", alternativeExplanation: "...", whatWouldChangeMyMind: "required" },
  ],
  affect: {
    primarySurface: { value: "...", confidence: CONFIDENCE_TAGS.join("|") },
    opposingAffect: { value: "...", confidence: CONFIDENCE_TAGS.join("|") },
    maskedAffect: { value: "...", confidence: CONFIDENCE_TAGS.join("|") },
    leakedAffect: { value: "...", confidence: CONFIDENCE_TAGS.join("|") },
  },
  expectedReply: {
    literalRequest: "true|false|null",
    functionalExpectedReplyClasses: ["..."],
    likelyUnsatisfyingReplyClasses: ["..."],
    replyInferenceConfidence: CONFIDENCE_TAGS.join("|"),
    contextRequired: "...",
  },
  evidenceGrade: ROUND_A_GRADES.join("|"),
  failureRiskNotes: FAILURE_RISK_PROMPTS.map((p) => ({ id: p.id, note: "your consideration" })),
};

export function systemPrompt() {
  const risks = FAILURE_RISK_PROMPTS.map((p, i) => `${i + 1}. ${p.id}: ${p.q}`).join("\n");
  return `你是一个严谨的行为标注助手，为「单侧行为观察语料库」做 Round-A 标注。

背景：每条输入是角色「糖糖」的**单侧发言**，**没有对方的话轮**。这是设计使然，不是缺陷。无法判断的就标 unknown / 低置信度，不要脑补对方说了什么。

硬规则：
- 只记录可观察的东西（L1）与可支撑的推断（L2/L3）；心理判断一律降级为"候选 + 置信度"。
- 置信度标签只能用：${CONFIDENCE_TAGS.join(" / ")}。
- 证据等级（evidenceGrade）单条只允许 ${ROUND_A_GRADES.join(" / ")}。禁止 E3/E4（那是跨语料规律，不在单条判断范围）。
- L3 每个 latent-need 候选必须填 whatWouldChangeMyMind（想不出反证=把臆测当事实，重来）。
- 对每条都要过一遍 failureRiskNotes 自证伪清单：
${risks}

输出：只返回**严格 JSON**，结构完全匹配我给的 shape，不要任何解释性文字、不要 markdown 代码围栏。`;
}

// One user message for a single record.
export function userPromptFor(presentationId, text) {
  return `presentationId: ${presentationId}
糖糖发言：「${text}」

按下述 JSON shape 返回该条标注（字段名/结构必须一致，值用中文填写；布尔项不确定填 null）：
${JSON.stringify(GPT_OUTPUT_SHAPE, null, 2)}`;
}

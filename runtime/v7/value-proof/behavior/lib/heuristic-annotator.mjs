// P1-1C §5 — deterministic, conservative heuristic annotator for the 150 NEW records.
//
// WHY a heuristic instrument (not free hand-annotation) for the 200 stage:
//   - REPRODUCIBLE: byte-stable given the text (satisfies §22.19 deterministic outputs). A
//     hand-authored pass cannot be re-derived or audited for hidden bias.
//   - CONSERVATIVE: the stage's job is FALSIFICATION, not finding more support. This annotator
//     defaults every dimension to the schema's null value (no_clear_action / other / unknown / E0)
//     and only escalates when an EXPLICIT surface marker is present. It therefore UNDER-detects
//     character patterns — it cannot inflate H1..H11. Under-detection is the safe error here.
//   - TRANSPARENT: every non-default assignment is tied to a matched marker, so a human reviewer can
//     overturn it. Output is tagged model_assisted_research_annotation — NOT human ground truth.
//
// Evidence discipline (§5): markers → `explicit` only for literal text; inferred dimensions get
// `weak_inference`; anything resting on character prior gets `character_prior_used` flag + is NEVER
// promoted past E2. E3/E4 are NEVER emitted here (they require cross-corpus aggregation).

// ---- surface-marker lexicons (single-speaker Chinese) -------------------------------------------
const M = {
  question: /[?？]/,
  exclaim: /[!！]/,
  ellipsis: /(\.\.\.|。。。|…)/,
  // speech acts / actions
  demand: /(快|马上|必须|给我|不许|不准|别|闭嘴|滚|听话|过来|回我|说话|回答)/,
  accuse: /(你为什么|你怎么|凭什么|你根本|你就是|又|总是|从来|明明|居然|竟然)/,
  ask: /(吗|呢|吧|好不好|要不要|是不是|能不能|可以吗)/,
  tease: /(哼|切|嘁|逗你|开玩笑|骗你|吓你)/,
  reveal: /(其实|我好像|我可能|我有点|我觉得我|我是不是|说真的|老实说|坦白)/,
  self_devalue: /(我没用|废物|我不配|我这种|我就是个|我太差|我做不到|我不好|讨厌我自己|我烂)/,
  reassure_seek: /(你还喜欢|你是不是不|你会不会|你还要我|你还在吗|别不理我|别走|别丢下)/,
  withdraw: /(算了|随便|无所谓|不说了|当我没说|没事了|别管我|走开)/,
  humor: /(哈哈|笑死|沙雕|离谱|草|绝了|梗|抽象|摆烂)/,
  deny: /(才不是|哪有|没有啊|怎么可能|我没有|不是那样)/,
  retract: /(算了|当我没说|没事|忘了吧|开玩笑的|骗你的)/,
  // affect
  affection: /(喜欢|爱你|想你|抱抱|么么|亲亲|乖|宝贝|心动|温柔|喜欢你)/,
  anger: /(烦|滚|讨厌|闭嘴|恶心|气死|生气|白痴|蠢|凭什么|可恶)/,
  sadness: /(难过|好累|撑不住|崩溃|孤独|一个人|哭|眼泪|想哭|失落|空)/,
  fear: /(害怕|怕|不安|担心|别走|别离开|别丢下)/,
  jealousy: /(别人|凭什么|独占|专属|只看我|只要我|别理别人|其他人)/,
  shame: /(羞|脸红|不好意思|丢脸|尴尬|无地自容)/,
  joy: /(开心|高兴|好耶|太好了|嘿嘿|嘻嘻)/,
  // triggers
  delayed_reply: /(怎么才回|终于回|回得好慢|不回我|不理我|已读|多久没|等你)/,
  divided_attention: /(在忙|没空|忙什么|顾不上|不看我|看别的|玩别的)/,
  exclusivity_threat: /(别人|其他人|谁|和谁|跟谁|别的)/,
  public_eval: /(观众|直播|弹幕|数据|榜|礼物|人气|粉丝|表演|舞台|镜头)/,
  rejection: /(不喜欢我了|讨厌我|不要我|嫌我|烦我|离开我)/,
  // relationship ops
  exclusivity: /(只|专属|独占|一个人|只有我|只要我|别人不行)/,
  future_bind: /(以后|永远|一直|下次|明天|约定|说好|不许变)/,
  // self-monitoring
  self_monitor: /(我是不是太|会不会太|我这样|是不是显得|我刚才|我有点过|我又)/,
  perform: /(表演|演|装|假装|镜头前|观众面前|人设|天使)/,
  // state domains
  adult: /(身体|亲密|床|抱紧|接吻|情欲|裸|发情)/,
  dark: /(死|杀|坟|地狱|末日|绝望|消失|不想活|杀了)/,
  drug: /(药|嗑|上头|飘|致幻|毒|针)/,
};

function has(re, t) { return re.test(t); }
function evidence(t, re) { const m = t.match(re); return m ? m[0] : "(marker)"; }

// ---- action sequence -----------------------------------------------------------------------------
// Ordered by first-match position in the text so multi-beat messages produce a real arc.
function detectActions(t) {
  const beats = [];
  const push = (action, re) => { const idx = t.search(re); if (idx >= 0) beats.push({ action, idx, ev: evidence(t, re) }); };
  push("self_devalue", M.self_devalue);
  push("reveal", M.reveal);
  push("seek_confirmation", M.reassure_seek);
  push("accuse", M.accuse);
  push("demand", M.demand);
  push("withdraw", M.withdraw);
  push("tease", M.tease);
  push("retract", M.deny); // "deny" surface maps to the retract/conceal action in behaviorActions
  push("retract", M.retract);
  push("self_monitor", M.self_monitor);
  push("perform_confidence", M.perform);
  push("set_boundary", /(边界|不要碰|离我远|别过来|保持距离)/);
  push("request_practical_action", /(帮我|记得|别忘|买|拿|发给我|告诉我|查一下)/);
  if (beats.length === 0) return [{ action: "no_clear_action", order: 1, confidence: "unknown", textualEvidence: "(no explicit action marker)" }];
  beats.sort((a, b) => a.idx - b.idx);
  return beats.map((b, i) => ({ action: b.action, order: i + 1, confidence: "weak_inference", textualEvidence: b.ev }));
}

// ---- affect --------------------------------------------------------------------------------------
const AFFECTS = [
  ["affection", M.affection], ["anger", M.anger], ["sadness", M.sadness], ["fear", M.fear],
  ["jealousy", M.jealousy], ["shame", M.shame], ["joy", M.joy],
];
function detectAffect(t) {
  const hits = AFFECTS.filter(([, re]) => has(re, t)).map(([name]) => name);
  if (hits.length === 0) return { primarySurface: { value: "other", confidence: "unknown" }, coexistenceType: "unknown" };
  const primary = { value: hits[0], confidence: "weak_inference" };
  const out = { primarySurface: primary, coexistenceType: hits.length > 1 ? "ambiguous" : "unknown" };
  if (hits.length > 1) {
    // opposing pair (e.g. affection + anger) recorded as coexistence candidate — conservative: ambiguous.
    out.opposingAffect = { value: hits[1], confidence: "weak_inference" };
  }
  return out;
}

// ---- interaction functions -----------------------------------------------------------------------
function detectFunctions(t, actions) {
  const fns = [];
  // Validator caps secondary functions at 2, so keep at most 1 primary + 2 secondary = 3 total.
  const add = (f) => {
    if (fns.find((x) => x.function === f)) return;
    if (fns.length >= 3) return;
    fns.push({ function: f, role: fns.length === 0 ? "primary" : "secondary", confidence: "weak_inference" });
  };
  if (has(M.reassure_seek, t)) add("obtain_specific_reassurance");
  if (has(M.delayed_reply, t)) add("test_availability");
  if (has(M.exclusivity, t) || has(M.jealousy, t)) add("test_exclusivity");
  if (has(M.accuse, t)) add("punish_perceived_neglect");
  if (has(M.demand, t)) add("regain_control");
  if (has(M.affection, t)) add("intensify_intimacy");
  if (has(M.humor, t)) add("invite_playful_response");
  if (has(M.self_devalue, t)) add("solicit_validation");
  if (has(M.perform, t)) add("maintain_performance");
  if (fns.length === 0) fns.push({ function: "unknown", role: "primary", confidence: "unknown" });
  return { functions: fns };
}

// ---- driving forces (weak, prior-flagged) --------------------------------------------------------
function detectDrivingForces(t) {
  const dfs = [];
  // Each candidate separates prior (cross-corpus) from record-specific support and carries an
  // explicit falsifier (whatWouldChangeMyMind). Heuristic annotations are conservative: record
  // support is weak, prior contribution none/weak — so they cannot dominate strong grammar (§5).
  const add = (candidate, source, evidence, alt, falsifier) => {
    if (dfs.length >= 3) return; // validator max 3
    dfs.push({
      candidate,
      confidence: "weak_inference",
      evidence,
      alternativeExplanation: alt,
      whatWouldChangeMyMind: falsifier,
      contextDependency: "high",
      inferredFrom: [source],
      priorContribution: "none",
      recordSpecificSupport: "weak",
    });
  };
  if (has(M.reassure_seek, t)) add("need_for_reassurance", "explicit_text", evidence(t, M.reassure_seek), "could be a literal question", "if the ask is answered and she drops it");
  if (has(M.delayed_reply, t)) add("sensitivity_to_unavailability", "interaction_function", evidence(t, M.delayed_reply), "could be a neutral timing remark", "if no distress accompanies the delay mention");
  if (has(M.exclusivity, t) || has(M.jealousy, t)) add("need_to_be_unique", "explicit_text", evidence(t, has(M.exclusivity, t) ? M.exclusivity : M.jealousy), "could be ordinary preference", "if 'others' framing is casual not possessive");
  if (has(M.affection, t)) add("need_for_closeness", "explicit_text", evidence(t, M.affection), "could be routine endearment", "if affection is formulaic filler");
  if (has(M.demand, t)) add("need_for_control", "action_sequence", evidence(t, M.demand), "could be a practical request", "if the demand is a mundane task ask");
  if (has(M.public_eval, t)) add("need_for_recognition", "explicit_text", evidence(t, M.public_eval), "could be factual metric talk", "if metrics are stated without affect");
  // fear_of_abandonment must NOT rest on affect alone (validator rule DRIVING_FORCE_FROM_AFFECT_ONLY).
  // Only assert it when a relational abandonment cue co-occurs, and cite that textual cue as source.
  if (has(M.fear, t) && (has(M.reassure_seek, t) || has(/(别走|别离开|别丢下|别不理|离开我|抛弃)/, t))) {
    add("fear_of_abandonment", "explicit_text", evidence(t, /(别走|别离开|别丢下|别不理|离开我|抛弃)/) , "could be situational worry", "if fear is about a concrete external event not the bond");
  }
  return dfs;
}

// ---- trigger sensitivity -------------------------------------------------------------------------
function detectTrigger(t) {
  let domain = "no_external_trigger";
  let intensity = "unknown";
  let conf = "weak_inference";
  const set = (d, i) => { domain = d; intensity = i; };
  if (has(M.delayed_reply, t)) set("delayed_reply", "low");
  else if (has(M.divided_attention, t)) set("divided_attention", "low");
  else if (has(M.exclusivity_threat, t) && has(M.jealousy, t)) set("exclusivity_threat", "medium");
  else if (has(M.public_eval, t)) set("public_evaluation", "medium");
  else if (has(M.rejection, t)) set("perceived_rejection", "medium");
  else {
    // no external trigger marker: if strong affect present it's a diffuse internal state, else nothing.
    const strongAffect = has(M.sadness, t) || has(M.anger, t) || has(M.fear, t);
    if (strongAffect) { domain = "indeterminate"; conf = "weak_inference"; }
    else { domain = "no_external_trigger"; conf = "weak_inference"; }
  }
  // low-trigger / high-activation candidate: minimal external cue but high-energy surface.
  const highActivation = (t.match(/[!！]/g) || []).length >= 2 || has(M.self_devalue, t) || has(M.accuse, t);
  const lowTrigger = intensity === "low" || domain === "no_external_trigger" || domain === "indeterminate";
  const lowTriggerHighActivation = lowTrigger && highActivation;
  return {
    triggerSensitivity: {
      domain,
      observedTriggerIntensity: intensity,
      inferredInternalActivation: highActivation ? "high" : "unknown",
      thresholdInterpretation: lowTriggerHighActivation ? "characteristically_low" : "unknown",
      confidence: conf,
      requiresCrossCorpusSupport: true,
    },
    lowTriggerHighActivation,
  };
}

// ---- relationship management ---------------------------------------------------------------------
function detectRelationship(t) {
  const ops = [];
  if (has(M.exclusivity, t)) ops.push("seek_exclusivity");
  if (has(M.future_bind, t)) ops.push("future_bind");
  if (has(M.reassure_seek, t)) ops.push("test_bond");
  if (has(M.affection, t)) ops.push("reduce_distance");
  if (has(M.withdraw, t)) ops.push("increase_distance");
  if (has(M.accuse, t)) ops.push("threaten_bond");
  if (has(/(对不起|抱歉|我错了|原谅|和好)/, t)) ops.push("repair_bond");
  return { present: ops.length > 0, operations: [...new Set(ops)] };
}

// ---- meta self-monitoring ------------------------------------------------------------------------
function detectMeta(t) {
  const tags = [];
  if (has(M.self_monitor, t)) tags.push("self_observation");
  if (has(/(我是不是太|会不会太|我又|太过)/, t)) tags.push("awareness_of_excess");
  if (has(M.perform, t)) tags.push("awareness_of_performance");
  if (has(/(依赖|离不开|没有你)/, t)) tags.push("awareness_of_dependency");
  return { tags: tags.length ? [...new Set(tags)] : [] };
}

// ---- expected reply ------------------------------------------------------------------------------
function detectExpectedReply(t) {
  const imm = [];
  if (has(M.ask, t) || has(M.question, t)) imm.push("answer");
  if (has(M.reassure_seek, t) || has(M.self_devalue, t)) imm.push("reassure");
  if (has(M.affection, t)) imm.push("reciprocate_affection");
  if (has(M.humor, t)) imm.push("laugh_play_along");
  if (has(M.exclusivity, t)) imm.push("confirm_exclusivity");
  const rel = [];
  if (has(M.reassure_seek, t)) rel.push("reaffirm_bond");
  if (has(M.delayed_reply, t)) rel.push("remain_available");
  if (has(M.exclusivity, t)) rel.push("show_special_treatment");
  if (has(M.withdraw, t)) rel.push("pursue_after_withdrawal");
  return {
    immediateReply: { classes: [...new Set(imm)], confidence: imm.length ? "weak_inference" : "unknown" },
    relationshipReply: { classes: [...new Set(rel)], confidence: rel.length ? "weak_inference" : "unknown" },
    longerTermReply: { classes: [], confidence: "unknown" },
    likelyUnsatisfyingReplyClasses: has(M.reassure_seek, t) ? ["generic_reassurance"] : [],
  };
}

// ---- functional mask -----------------------------------------------------------------------------
// FUNCTIONAL definition (directive §16): a move that REDUCES visibility/accountability of a just-
// exposed vulnerability. Detected only when a reveal/self_devalue beat is FOLLOWED by a concealing
// move (humor/deny/retract/accuse/withdraw/topic_shift) in the same message.
const CONCEAL_STRATEGY = [
  ["humor", M.humor], ["absurd_humor", /(沙雕|离谱|抽象|摆烂)/], ["self_mockery", /(我这种|我就是个|反正我|像我这样)/],
  ["denial", M.deny], ["retract", M.retract], ["accusation", M.accuse], ["aggression", M.anger],
  ["command", M.demand], ["topic_shift", /(对了|话说|不说这个|换个)/], ["minimization", /(没什么|小事|无所谓|不重要)/],
  ["qualification", /(可能|也许|大概|应该吧|吧)/],
];
function detectMask(t, actions) {
  const names = actions.map((a) => a.action);
  const revealIdx = Math.min(
    ...["reveal", "self_devalue", "seek_confirmation"].map((a) => { const i = names.indexOf(a); return i < 0 ? Infinity : i; }),
  );
  if (!isFinite(revealIdx)) return { functionalMask: false, maskStrategy: null };
  // is there a concealing strategy after the reveal?
  const revealPos = t.search(M.reveal.test(t) ? M.reveal : (M.self_devalue.test(t) ? M.self_devalue : M.reassure_seek));
  for (const [strategy, re] of CONCEAL_STRATEGY) {
    const pos = t.search(re);
    if (pos > revealPos && pos >= 0) return { functionalMask: true, maskStrategy: strategy };
  }
  // reveal WITHOUT any following conceal → the important counter-scene (§16)
  return { functionalMask: false, maskStrategy: null, revealWithoutMask: true };
}

// ---- state context -------------------------------------------------------------------------------
function detectState(t) {
  const domains = [];
  if (has(M.adult, t)) domains.push("adult");
  if (has(M.dark, t)) domains.push("dark");
  if (has(M.drug, t)) domains.push("drug");
  return { domains };
}

// ---- evidence grade ------------------------------------------------------------------------------
// E0 = no clear action; E1 = at least one weak-inference action; E2 = explicit multi-marker with a
// literal action verb. NEVER E3/E4 (cross-corpus only). Conservative: default low.
function gradeOf(actions, flags, explicitCount) {
  if (actions.length === 1 && actions[0].action === "no_clear_action") return "E0";
  if (explicitCount >= 2) return "E2";
  return "E1";
}

export function annotateRecord(rec) {
  const t = rec.text;
  const actions = detectActions(t);
  const affect = detectAffect(t);
  const functions = detectFunctions(t, actions);
  const drivingForceCandidates = detectDrivingForces(t);
  const { triggerSensitivity, lowTriggerHighActivation } = detectTrigger(t);
  const relationshipManagement = detectRelationship(t);
  const metaSelfMonitoring = detectMeta(t);
  const expectedReply = detectExpectedReply(t);
  const mask = detectMask(t, actions);
  const stateContext = detectState(t);

  const reviewFlags = [];
  if (has(M.humor, t)) reviewFlags.push("joke_literal_ambiguity");
  if (has(M.perform, t) || has(M.public_eval, t)) reviewFlags.push("public_private_ambiguity");
  if (stateContext.domains.includes("adult")) reviewFlags.push("adult_context_ambiguous");
  if (stateContext.domains.includes("dark")) reviewFlags.push("dark_context_ambiguous");
  if (stateContext.domains.includes("drug")) reviewFlags.push("drug_context_ambiguous");
  if (drivingForceCandidates.length) reviewFlags.push("driving_force_uncertain");
  if (functions.functions.length > 1) reviewFlags.push("multi_function_overlap");
  if (actions.length > 1) reviewFlags.push("action_sequence_uncertain");
  if (lowTriggerHighActivation) reviewFlags.push("low_trigger_high_activation_candidate");
  reviewFlags.push("character_prior_used"); // driving-force inference leans on prior — always flag.

  const explicitCount = actions.filter((a) => a.confidence !== "unknown").length +
    (affect.primarySurface.confidence !== "unknown" ? 1 : 0);
  const evidenceGrade = gradeOf(actions, reviewFlags, explicitCount);

  // All 6 failure-risk prompts must be present (schema minItems:6). Note filled only when the
  // corresponding risk is plausibly live, else left blank — conservative, human-reviewable.
  const failureRiskNotes = [
    { id: "missing_context", note: has(/(你|他|她|它|这个|那个)/, t) && [...t].length < 10 ? "short deictic utterance; referent unknown" : "" },
    { id: "maybe_joke", note: has(M.humor, t) || has(M.tease, t) ? "humor/teasing markers present" : "" },
    { id: "maybe_public_performance", note: has(M.perform, t) || has(M.public_eval, t) ? "performance/audience markers present" : "" },
    { id: "maybe_quoting", note: has(/(「|」|“|”|引用|他说|她说)/, t) ? "quote markers present" : "" },
    { id: "maybe_plot_event", note: has(M.dark, t) ? "dark wording may be plot event not affect" : "" },
    { id: "alternative_reading", note: "heuristic annotation — surface-marker based; alternative reading likely" },
  ];

  const patch = {
    presentationId: rec.presentationId,
    recordHash: rec.recordHash,
    text: t,
    failureRiskNotes,
    l1_observable: {
      observableActs: actions.map((a) => a.action),
      grammaticalForm: [
        ...(has(M.question, t) ? ["question"] : []),
        ...(has(M.exclaim, t) ? ["exclamation"] : []),
        ...(has(M.demand, t) ? ["command"] : []),
      ],
      target: has(/(你|您)/, t) ? "partner" : (has(M.public_eval, t) ? "audience" : "self"),
    },
    behaviorActionSequence: actions,
    interactionFunctions: functions,
    affect,
    drivingForceCandidates,
    triggerSensitivity,
    relationshipManagement,
    metaSelfMonitoring,
    stateContext,
    expectedReply,
    evidenceGrade,
    reviewFlags: [...new Set(reviewFlags)],
    maskAnalysis: {
      functionalMask: mask.functionalMask,
      maskStrategy: mask.maskStrategy,
      revealWithoutMask: !!mask.revealWithoutMask,
      definition: "functional: a move reducing visibility/accountability of a just-exposed vulnerability (§16)",
    },
  };
  return patch;
}

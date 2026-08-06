import { containsAny, normalizeText, unique } from "./util.js";

const GENERIC_FEEDBACK = /^(很强|很好|不错|可以|挺好|好看|厉害|牛|great|good|nice)[!！。.]*$/i;

function levelAtLeast(value, target) {
  const rank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return (rank[String(value ?? "none")] ?? 0) >= (rank[target] ?? 0);
}

export function detectSignals(event, state = {}) {
  const text = normalizeText(event.text);
  const context = event.context ?? {};
  const explicit = Array.isArray(event.signals) ? event.signals : [];
  const signals = [...explicit];

  if (context.scenario) {
    const scenario = String(context.scenario);
    signals.push(scenario);
    const aliases = {
      generic_stream_feedback: ["generic_feedback"],
      post_stream_crash: ["live_to_private", "body_fatigue"],
      delayed_reply_with_notice: ["prior_notice"],
      exact_promise_overdue: ["promise_overdue", "return_time_unknown"],
      audience_growth_privacy: ["stream_success", "privacy_risk"],
      privacy_visibility: ["stream_success", "privacy_risk"],
      forgotten_pudding: ["pudding", "forgotten_pudding"],
      million_followers: ["million_followers", "stream_success"]
    };
    signals.push(...(aliases[scenario] ?? []));
  }
  if (context.priorNotice === true) signals.push("prior_notice");
  if (context.promiseStatus === "overdue") signals.push("promise_overdue", "return_time_unknown");
  if (context.returnTimeUnknown === true) signals.push("return_time_unknown");
  if (context.object === "pudding" || containsAny(text, ["布丁", "pudding"])) signals.push("pudding");
  if (context.taskStatus === "forgotten" && signals.includes("pudding")) signals.push("forgotten_pudding");
  if (context.streamTransition === "live_to_private") signals.push("live_to_private");
  if (Number(context.fatigue ?? 0) >= 60 || containsAny(text, ["累死", "好累", "困死", "先睡", "躺会"])) signals.push("body_fatigue");
  if (context.milestone === "million_followers" || Number(context.followers ?? 0) >= 1_000_000) {
    signals.push("million_followers", "stream_success");
  }
  if (context.streamResult === "success") signals.push("stream_success");
  if (context.audienceThreat === "single" || context.audienceThreat === "low") signals.push("single_troll");
  if (levelAtLeast(context.audienceThreat, "high")) signals.push("audience_attack");
  if (levelAtLeast(context.privacyRisk, "high")) signals.push("privacy_risk");
  if (context.controlOverreach === true) signals.push("control_overreach");
  if (context.coPresent === true) signals.push("co_present");
  if (context.adultContext === true) signals.push("adult_context");
  if (context.consentCompatible === true) signals.push("consent_compatible");
  if (context.bodyState === "hungry" || containsAny(text, ["我饿了", "没吃的"])) signals.push("hungry");
  if (context.bodyState === "ill" || context.illness === true) signals.push("illness");
  if (context.channelTransition === "live_to_private") signals.push("live_to_private");
  if (context.accurateReply === true) signals.push("accurate_reply");
  if (context.sharedJoke === "pudding") signals.push("pudding_callback");
  if (context.conflictSeverity === "major") signals.push("major_conflict");
  if (context.conflictSeverity === "minor") signals.push("minor_conflict");

  if (event.actor === "partner" && GENERIC_FEEDBACK.test(text)) signals.push("generic_feedback");
  if (event.actor === "partner" && containsAny(text, ["具体", "中段", "转场", "节奏", "设备", "镜头", "段落"])) {
    signals.push("specific_feedback");
  }
  if (containsAny(text, ["隐私泄露", "人肉", "住址", "真实姓名"])) signals.push("privacy_risk");
  if (containsAny(text, ["黑子", "喷子", "骂我"])) signals.push("single_troll");
  if (containsAny(text, ["百万粉", "100万粉", "一百万粉"])) signals.push("million_followers", "stream_success");
  if (containsAny(text, ["设备坏", "硬件故障", "麦克风坏", "采集卡"])) signals.push("hardware_failure");
  if (containsAny(text, ["别替我决定", "你替我决定"])) signals.push("control_overreach");
  if (containsAny(text, ["我要死了", "人生完了", "系统强制降频"])) signals.push("dark_humor");
  if (containsAny(text, ["色色", "坏心思", "性玩笑"])) signals.push("sexual_joke");
  if (containsAny(text, ["药物梗", "嗑药", "药丸"])) signals.push("drug_reference");

  const previous = state.history?.at?.(-1);
  if (previous?.signals?.includes("pudding") && signals.includes("pudding")) signals.push("repeated_pudding");
  if (previous?.signals?.includes("generic_feedback") && signals.includes("generic_feedback")) signals.push("repeated_generic_feedback");

  return unique(signals);
}

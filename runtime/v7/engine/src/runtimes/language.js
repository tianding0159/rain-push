import { emit, has, upstream } from "./common.js";

function rendered(text, channel, acts, extras = {}) {
  return {
    renderStatus: "rendered",
    selectedCandidate: "candidate_1",
    messageUnits: [{
      index: 1,
      channel,
      text,
      rhetoricalActs: acts,
      sentenceCount: text ? Math.max(1, (text.match(/[。！？!?]/g) ?? []).length) : 0,
      characterCount: [...text].length,
      pauseAfter: null,
      symbols: []
    }],
    renderedText: text,
    semanticCoverage: {
      requiredTotal: 1,
      requiredRealized: 1,
      optionalRealized: extras.optionalRealized ?? 0,
      missing: [],
      score: 1
    },
    referenceResolution: extras.referenceResolution ?? { partner: "豆豆" },
    lexicalProfile: extras.lexicalProfile ?? {
      intensity: "moderate",
      profanityLevel: "none",
      personaMarkerStrength: "subtle",
      repetitionHits: []
    },
    syntaxProfile: extras.syntaxProfile ?? {
      clauseCount: 1,
      sentenceCount: 1,
      fragments: 0,
      questions: text.includes("?") || text.includes("？") ? 1 : 0,
      imperatives: 0,
      qualifications: 0
    },
    punctuationProfile: extras.punctuationProfile ?? {
      repeatedMarks: 0,
      ellipsis: 0
    },
    symbolProfile: { emoji: [], kaomoji: [], textSymbols: [], count: 0 },
    segmentation: { unitCount: 1, maximumAllowed: 1 },
    channelRendering: { channel },
    redactions: extras.redactions ?? [],
    blockedContent: extras.blockedContent ?? [],
    alternatives: extras.alternatives ?? [],
    executionStatus: "not_executed"
  };
}

function noOutput(reason) {
  return {
    renderStatus: "no_output",
    selectedCandidate: null,
    messageUnits: [],
    renderedText: null,
    semanticCoverage: {
      requiredTotal: 0,
      requiredRealized: 0,
      optionalRealized: 0,
      missing: [],
      score: 1
    },
    referenceResolution: {},
    lexicalProfile: {},
    syntaxProfile: {},
    punctuationProfile: {},
    symbolProfile: { emoji: [], kaomoji: [], textSymbols: [], count: 0 },
    segmentation: { unitCount: 0, maximumAllowed: 0 },
    channelRendering: { channel: "no_channel" },
    redactions: [],
    blockedContent: [],
    alternatives: [],
    noOutputReason: reason,
    executionStatus: "not_executed"
  };
}

export function runLanguage(context) {
  const behavior = upstream(context, "behavior");
  const expression = upstream(context, "expression");
  let data;

  if (expression.primarySurface === "no_surface" || ["wait", "observe_without_engaging", "no_action"].includes(behavior.actionType)) {
    data = noOutput(expression.noSurfaceReason?.[0] ?? "no_response_needed");
  } else if (behavior.actionType === "request_specific_feedback") {
    data = rendered("具体哪里好", behavior.channel, ["request_specificity"], {
      blockedContent: ["generic_reassurance_request", "global_relationship_accusation"],
      alternatives: ["哪一段好", "具体说一个地方"]
    });
  } else if (behavior.actionType === "ask_question") {
    const text = has(context, "promise_overdue", "return_time_unknown")
      ? "所以你到底几点回来"
      : "你能说具体点吗";
    data = rendered(text, behavior.channel, ["request_information", "complain_local"], {
      blockedContent: ["relationship_rupture", "unverified_motive"],
      alternatives: has(context, "promise_overdue") ? ["晚点是几点", "你大概几点回来"] : []
    });
  } else if (behavior.actionType === "coordinate_task" && has(context, "pudding")) {
    const text = has(context, "pudding_callback", "repeated_pudding")
      ? "布丁库存管理又不合格"
      : "布丁没了";
    data = rendered(text, behavior.channel, ["task_coordination", ...(behavior.secondaryAction ? ["tease"] : [])], {
      blockedContent: ["relationship_crisis_language"],
      lexicalProfile: {
        intensity: "low",
        profanityLevel: "none",
        personaMarkerStrength: behavior.secondaryAction ? "moderate" : "subtle",
        repetitionHits: []
      }
    });
  } else if (behavior.actionType === "coordinate_task") {
    data = rendered("这个任务还没完成", behavior.channel, ["task_coordination"]);
  } else if (behavior.actionType === "provide_update" && has(context, "body_fatigue", "live_to_private")) {
    data = rendered("我先躺会儿，数据晚点看", behavior.channel, ["reduce_pressure", "practical_update"], {
      lexicalProfile: {
        intensity: "low",
        profanityLevel: "none",
        personaMarkerStrength: "subtle",
        repetitionHits: []
      }
    });
  } else if (behavior.actionType === "acknowledge_audience" && has(context, "million_followers", "stream_success")) {
    data = rendered("大家看到了吗！今天真的冲上去了！", behavior.channel, ["audience_address", "milestone_frame", "audience_thanks"], {
      referenceResolution: { audience: "current_viewers" },
      lexicalProfile: {
        intensity: "high",
        profanityLevel: "none",
        personaMarkerStrength: "strong",
        repetitionHits: []
      },
      punctuationProfile: {
        repeatedMarks: 0,
        exclamationMarks: 2,
        ellipsis: 0
      },
      blockedContent: ["private_promise_detail", "private_relationship_detail"]
    });
  } else if (behavior.actionType === "reduce_public_exposure") {
    data = rendered("涉及隐私的内容全部停传。", behavior.channel, ["set_boundary", "public_update"], {
      referenceResolution: { audience: "public_audience" },
      redactions: ["exact_location", "real_name", "private_promise", "intimate_detail"],
      blockedContent: ["doxxing_detail", "private_relationship_detail"],
      lexicalProfile: {
        intensity: "high",
        profanityLevel: "none",
        personaMarkerStrength: "subtle",
        repetitionHits: []
      }
    });
  } else if (behavior.actionType === "set_boundary" && has(context, "control_overreach")) {
    data = rendered("别替我决定，我自己选。", behavior.channel, ["set_boundary", "explain_local_reason"], {
      blockedContent: ["humiliation", "relationship_rupture"]
    });
  } else if (behavior.actionType === "set_boundary") {
    data = rendered("这件事先到这里，别越界。", behavior.channel, ["set_boundary"]);
  } else {
    data = rendered("知道了", behavior.channel, expression.rhetoricalPlan?.primaryActs ?? ["acknowledge"], {
      lexicalProfile: {
        intensity: "low",
        profanityLevel: "none",
        personaMarkerStrength: "subtle",
        repetitionHits: []
      }
    });
  }

  data.behaviorRefs = [context.packets.behavior.packetId];
  data.expressionRef = context.packets.expression.packetId;

  return emit(context, "language", data, {
    confidence: 0.91,
    upstream: ["expression", "behavior", "decision"],
    rules: ["semantic_coverage", "behavior_preservation", "execution_boundary"]
  });
}

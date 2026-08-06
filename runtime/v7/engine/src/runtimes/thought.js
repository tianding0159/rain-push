import { emit, has, upstream } from "./common.js";

export function runThought(context) {
  const need = upstream(context, "need");
  const observations = [];
  const questions = [];
  const hypotheses = [];
  const rebuttals = [];
  const conflicts = [];

  if (has(context, "generic_feedback")) {
    observations.push("豆豆的反馈没有包含具体直播细节");
    questions.push("豆豆是否完整看过直播");
    hypotheses.push(
      { proposition: "豆豆看了但不擅长描述", type: "benign", confidence: 0.55 },
      { proposition: "豆豆只看了一部分", type: "ordinary", confidence: 0.48 },
      { proposition: "豆豆没有认真看", type: "negative", confidence: 0.38 }
    );
    rebuttals.push("现有证据不足以支持豆豆永远不认真看");
  }
  if (has(context, "promise_overdue", "return_time_unknown")) {
    observations.push("当前回归时间仍然没有明确边界");
    questions.push("豆豆到底几点回来");
    hypotheses.push(
      { proposition: "豆豆低估了需要的时间", type: "ordinary", confidence: 0.56 },
      { proposition: "豆豆仍在忙", type: "benign", confidence: 0.5 }
    );
  } else if (has(context, "prior_notice")) {
    observations.push("豆豆提前说明了忙碌");
    hypotheses.push({ proposition: "等待可能比立即追问更合适", type: "ordinary", confidence: 0.78 });
  }
  if (has(context, "pudding")) {
    observations.push("布丁库存为空");
    hypotheses.push({ proposition: "这是共同生活中的普通遗漏", type: "ordinary", confidence: 0.86 });
    if (has(context, "pudding_callback")) {
      hypotheses.push({ proposition: "布丁库存可以被当成家庭合规系统", type: "absurd_rule", confidence: 0.62 });
    }
  }
  if (has(context, "body_fatigue", "live_to_private")) {
    observations.push("直播结束后身体容量明显下降");
    conflicts.push({
      thoughtA: "直播结果值得分析",
      thoughtB: "身体需要先休息",
      synthesis: "休息可以保护后续分析和成长"
    });
  }
  if (has(context, "million_followers", "stream_success")) {
    observations.push("当前里程碑和观众影响都是真实的");
    questions.push("这个增长能否稳定成为新基线");
    conflicts.push({
      thoughtA: "成功是真实的",
      thoughtB: "成功很快会变成新的起点",
      synthesis: "庆祝里程碑不妨碍形成下一个目标"
    });
  }
  if (has(context, "single_troll")) {
    observations.push("当前证据只支持一个低价值负面账号");
    rebuttals.push("一个账号不能代表所有观众");
  }
  if (has(context, "privacy_risk")) {
    observations.push("公开传播可能扩大隐私暴露");
    questions.push("当前暴露是否已经得到控制");
  }
  if (has(context, "control_overreach")) {
    observations.push("豆豆正在替糖糖做本应共同决定的选择");
    questions.push("如何保留协作同时恢复糖糖的选择权");
  }
  if (!observations.length) observations.push("当前事件没有形成严重认知结论");

  const dominantThoughts = [
    ...observations.slice(0, 2).map((proposition) => ({ form: "observation", proposition })),
    ...questions.slice(0, 1).map((proposition) => ({ form: "question", proposition }))
  ].slice(0, 3);

  const data = {
    focalAttention: need.dominant ?? [],
    observations,
    questions,
    hypotheses,
    rebuttals,
    conflicts,
    dominantThoughts,
    rumination: has(context, "repeated_generic_feedback")
      ? [{ thread: "generic_feedback", depth: 2, unresolved: true }]
      : [],
    blocked: [
      ...(has(context, "generic_feedback", "pudding", "prior_notice") ? ["global_relationship_rejection"] : []),
      ...(has(context, "dark_humor") ? ["automatic_crisis_thought"] : [])
    ]
  };

  return emit(context, "thought", data, {
    confidence: 0.86,
    upstream: ["need", "emotion", "meaning"],
    rules: ["observation_hypothesis_separation", "multiple_hypotheses", "locality"]
  });
}

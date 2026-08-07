// Extended sampling heuristics for the P1-1C 200-record stage (directive §2).
//
// The 50-record stage (heuristics.mjs) is FROZEN — its COVERAGE_BUCKETS drove the original
// selection and must not change (that selection is pinned by hash). This module ADDS the buckets
// the 200-stage directive calls out that the crude 50-stage set under-covered:
//   - practical_mundane / low_information — "ordinary, no personality drama" 糖糖 text. The directive
//     warns that omitting these SEVERELY OVER-ESTIMATES character-pattern prevalence.
//   - high_energy / low_energy — activation level, so trigger↔activation isn't only sampled hot.
//   - absurd_humor — 沙雕/离谱/笑死 style, distinct from dark_humor.
//   - audience_metrics — 数据/榜/礼物/在线, the KAngel public-performance surface.
//   - self_monitoring — 我是不是/显得/我这样 self-observation markers.
//
// CRITICAL BOUNDARY (unchanged from heuristics.mjs): buckets are SAMPLING HINTS ONLY. They never
// enter annotation truth and are never shown to a reviewer. This module reuses the frozen
// bucketsFor() and only appends the new signals, so a record's original buckets are a strict subset
// of its extended buckets — the pinned-50 provenance is preserved.

import { bucketsFor as baseBucketsFor, COVERAGE_BUCKETS as BASE_COVERAGE } from "./heuristics.mjs";

// Broad "personality-drama" signal families already covered by the base set. A record is a
// mundane/low-information candidate when it hits NONE of these and carries no strong punctuation.
const DRAMA_RE = /(喜欢|爱|想你|抱|亲|么么|乖|宝贝|心动|温柔|烦|滚|讨厌|闭嘴|恶心|吵|生气|气死|白痴|蠢|废物|没用|不配|对不起|害怕|好累|撑不住|崩溃|孤独|一个人|哭|眼泪|只|别人|凭什么|独|专属|不许|羞|脸红|不好意思|敢|大胆|死|杀|坟|地狱|末日|绝望|身体|亲密|床|抱紧|药|嗑|飘|上头|观众|直播|表演|舞台|镜头|粉丝|天使|拯救|悄悄|秘密|真实的我|其实我)/;

const EXT_SIGNALS = [
  // absurd / silly humor (distinct from dark_humor's death imagery)
  ["absurd_humor_candidate", /(沙雕|离谱|笑死|哈哈哈|草|绝了|神经|无语|裂开|摆烂|抽象|梗|狗屁|逗)/],
  // audience / metrics / stream economy (KAngel public surface)
  ["audience_metrics_candidate", /(数据|榜|排行|礼物|打赏|在线|人数|涨粉|掉粉|热度|流量|观看|弹幕|SC|superchat|充值|下播|开播)/i],
  // explicit self-observation / self-monitoring markers
  ["self_monitoring_candidate", /(我是不是|是不是显得|我这样|我刚才|会不会太|显得|我有点|我怎么|我为什么|我是不是太)/],
  // high activation: dense exclamation / repetition / caps
  ["high_energy_candidate", /([!！]{2,}|[?？!！]{3,}|哈哈哈哈|啊啊啊|呜呜呜|[A-Z]{4,})/],
];

// low energy: long-ish, flat, no exclamation/question, ellipsis or period endings — "tired" register.
function isLowEnergy(text) {
  const len = [...text].length;
  const excl = (text.match(/[!！]/g) || []).length;
  const ques = (text.match(/[?？]/g) || []).length;
  const strong = (text.match(/[!！?？]/g) || []).length;
  return len >= 12 && strong === 0 && excl === 0 && ques === 0;
}

// practical / mundane / low-information: no drama signal, not question-heavy, not imperative-heavy.
function isPracticalMundane(text) {
  if (DRAMA_RE.test(text)) return false;
  const excl = (text.match(/[!！]/g) || []).length;
  return excl <= 1;
}

// Extended buckets = base buckets ∪ new signal buckets. Base subset preserved exactly.
export function bucketsFor200(text) {
  const set = new Set(baseBucketsFor(text));
  for (const [name, re] of EXT_SIGNALS) if (re.test(text)) set.add(name);
  if (isLowEnergy(text)) set.add("low_energy_candidate");
  if (isPracticalMundane(text)) set.add("practical_mundane_candidate");
  return [...set].sort();
}

// New buckets FIRST (rare/under-covered → prioritized in round-robin), then the base set. Deduped.
export const EXTENDED_COVERAGE_BUCKETS = [
  "practical_mundane_candidate",
  "low_energy_candidate",
  "high_energy_candidate",
  "absurd_humor_candidate",
  "audience_metrics_candidate",
  "self_monitoring_candidate",
  ...BASE_COVERAGE,
];

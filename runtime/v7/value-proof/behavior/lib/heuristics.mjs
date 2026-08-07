// Sampling heuristics for Stage-2 pilot selection (directive §2 buckets).
//
// CRITICAL BOUNDARY: these buckets are SAMPLING HINTS ONLY. They exist so the 50-record pilot
// spans a range of surface shapes and content signals rather than clustering on one style. They
// are DELIBERATELY crude keyword/shape matches and MUST NEVER be treated as annotation truth or
// shown to a Round-A reviewer (they would prime the answer). The sampler writes them ONLY to the
// private selection-key file; Round A never sees them.
//
// Every bucket is derived from the utterance text, so this module runs inside the private
// boundary. It never logs text; callers pass records in and get bucket labels out.

// Length strata calibrated from the real corpus length distribution (p25=15, p50=21, p75=30).
export function lengthBucket(text) {
  const n = [...text].length;
  if (n <= 15) return "very_short";
  if (n <= 30) return "medium";
  return "long";
}

// Structural / rhythm buckets — punctuation shape only.
function structuralBuckets(text) {
  const out = [];
  const ques = (text.match(/[?？]/g) || []).length;
  const excl = (text.match(/[!！]/g) || []).length;
  const ellipsis = (text.match(/\.\.\.|…/g) || []).length;
  const tilde = (text.match(/[~～]/g) || []).length;
  const marks = (text.match(/[?？!！…、，。~～]/g) || []).length;
  const len = [...text].length;

  if (ques >= 2 || (ques >= 1 && len <= 20)) out.push("question_heavy");
  // chaotic: many mixed marks or long tilde/ellipsis runs.
  if (marks >= 4 || ellipsis >= 2 || tilde >= 2 || excl >= 3) out.push("chaotic_punctuation");
  // flat: essentially no expressive punctuation.
  if (marks === 0 || (len >= 18 && marks <= 1 && ques === 0 && excl === 0)) out.push("low_punctuation_flat");
  return out;
}

// Content-signal buckets. Each is a coarse keyword family. A record can match several; it can also
// match none (→ falls into "unbucketed", still eligible for sampling). Keyword lists are
// intentionally short and NON-exhaustive — they only need to surface *candidates* for coverage,
// not to label emotions.
const SIGNALS = [
  ["imperative_demand", /(快|给我|不许|不准|必须|滚|闭嘴|过来|回答我|听话|不要|别|马上|立刻)/],
  ["self_reference", /(我|人家|老娘|本|自己)/],
  ["partner_directed", /(你|你们|哥|宝|亲爱|老公|主人)/],
  ["affection_candidate", /(喜欢|爱|想你|抱|亲|么么|乖|宝贝|心动|温柔)/],
  ["irritation_aggression_candidate", /(烦|滚|讨厌|闭嘴|恶心|吵|生气|气死|白痴|蠢|废物)/],
  ["vulnerability_self_devaluation_candidate", /(没用|废物|不配|对不起|害怕|好累|撑不住|崩溃|孤独|一个人|哭|眼泪)/],
  ["jealousy_exclusivity_candidate", /(只|别人|谁|凭什么|独|专属|一个人的|不许看|不许找)/],
  ["shame_boldness_candidate", /(羞|脸红|不好意思|敢|大胆|无所谓|随便|豁出去)/],
  ["dark_humor_candidate", /(死|杀|坟|地狱|下辈子|完蛋|末日|黑暗|绝望.*哈哈|笑死)/],
  ["adult_intimacy_candidate", /(身体|亲密|床|抱紧|贴|喘|湿|脱|裸|情欲|发骚|欲望)/],
  ["drug_related_candidate", /(药|嗑|飘|上头|致幻|针|嗨了|飞了|成瘾|戒断)/],
  ["public_kangel_like_candidate", /(大家|观众|直播|表演|舞台|镜头|粉丝|谢谢你们|天使|拯救)/],
  ["private_ame_like_candidate", /(悄悄|只有你|私下|秘密|不要告诉|真实的我|其实我)/],
];

function contentBuckets(text) {
  const out = [];
  for (const [name, re] of SIGNALS) if (re.test(text)) out.push(name);
  return out;
}

// Ambiguity / context-dependence heuristic: short + no strong signal, OR references an unnamed
// third party / prior context the single-sided line can't resolve.
function ambiguityBucket(text, contentHits) {
  const len = [...text].length;
  const refsContext = /(那个|这个|刚才|上次|之前|他|她|它|那件事|那时候)/.test(text);
  if ((len <= 14 && contentHits.length === 0) || refsContext) return ["ambiguous_context_dependent"];
  return [];
}

// Full bucket set for one record. Returns a sorted, de-duplicated array. ALWAYS includes exactly
// one length bucket so every record has at least one stratum.
export function bucketsFor(text) {
  const set = new Set();
  set.add(lengthBucket(text));
  for (const b of structuralBuckets(text)) set.add(b);
  const content = contentBuckets(text);
  for (const b of content) set.add(b);
  for (const b of ambiguityBucket(text, content)) set.add(b);
  return [...set].sort();
}

// The canonical ordered list of buckets the sampler tries to cover (directive §2). Order matters
// for deterministic round-robin coverage: rarer/more-specific buckets first so they aren't
// starved by common length buckets.
export const COVERAGE_BUCKETS = [
  "drug_related_candidate",
  "adult_intimacy_candidate",
  "dark_humor_candidate",
  "jealousy_exclusivity_candidate",
  "shame_boldness_candidate",
  "vulnerability_self_devaluation_candidate",
  "public_kangel_like_candidate",
  "private_ame_like_candidate",
  "irritation_aggression_candidate",
  "affection_candidate",
  "ambiguous_context_dependent",
  "chaotic_punctuation",
  "low_punctuation_flat",
  "question_heavy",
  "imperative_demand",
  "self_reference",
  "partner_directed",
  "very_short",
  "medium",
  "long",
];

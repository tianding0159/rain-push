// ═══ 每日播报引擎 ═══
// 数据 → 显著性评分 → 挑今日话题 → 拼成她连发的几条消息
// 「365天不重复」有两层：①话题组合每天不同（主要）②每槽位文案变体（次要）
import { scoreTopics, pickTopics } from './salience.mjs';
import { TOPIC_LEX, FRAME_LEX } from './lex/topics.mjs';
import { RAIN_LEX } from './lex/rain.mjs';

const p2 = n => String(n).padStart(2, '0');
function seed(day, salt = 0) {
  let h = salt >>> 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
const pick = (a, s) => (a && a.length) ? a[s % a.length] : null;

// 占位符替换：未知键留空而不是留 {xxx}，避免花括号漏到通知里
function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k];
    // 挡 undefined/null/NaN，也挡 ±Infinity —— (-Infinity).toFixed(1) 会渲染成 "-Infinity"
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
  });
}

// 一条模板里的占位符是否都有可用值（防线③配套）：
// 温度缺失时若仍选中 "{tmax}度啦" 会渲染成孤零零 "度啦"，不如避开、优先选不依赖它的句子
function hasAllVars(tpl, vars) {
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) {
    const v = vars[m[1]];
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) return false;
  }
  return true;
}
// 优先返回"占位符都有值"的句子；若全都缺值则退回原集（至少还能说话，fill 会清掉空洞）
function renderable(lines, vars) {
  const ok = (lines || []).filter(l => hasAllVars(l, vars));
  return ok.length ? ok : (lines || []);
}

/** 把归一化数据摊平成占位符可用的变量表 */
function varsOf(w, topicData, sites) {
  const d = topicData || {};
  const home = sites?.[0], office = sites?.[1];
  return {
    start: d.start, end: d.end, peak: d.peak,
    maxMm: d.rainMax, grade: d.grade,
    tmax: d.tmax ?? w.daily?.tmax, tmin: d.tmin ?? w.daily?.tmin,
    swing: d.swing, feelsGap: d.feelsGap, chillGap: d.chillGap != null ? Math.abs(d.chillGap) : undefined,
    humid: d.humid != null ? Math.round(d.humid) : undefined,
    windMax: d.windMax, gustMax: d.gustMax, uvMax: d.uvMax,
    visMin: d.visMin != null ? Math.round(d.visMin) : undefined,
    cloudAvg: d.cloudAvg != null ? Math.round(d.cloudAvg) : undefined,
    homeMm: home?.totalMm, officeMm: office?.totalMm,
  };
}

// 每条消息的通知级别：只有「必说且严重」的才升级，其余保持 passive 像闲聊
function levelFor(topic, isLead) {
  if (!isLead) return 'passive';
  if (topic.key === 'rain') {
    const mm = topic.data?.rainMax ?? 0;
    if (mm >= 8) return 'critical';
    if (mm >= 3 || topic.data?.thunder) return 'timeSensitive';
    if (topic.score >= 70) return 'active';
  }
  return topic.score >= 82 ? 'timeSensitive' : (topic.score >= 70 ? 'active' : 'passive');
}

export function buildDaily(w, sites, opts = {}) {
  // maxTopics 3→4：话题多一个，消息自然多一轮，比硬塞废话自然
  const { day, isWeekend = false, noon = false, maxTopics = 4 } = opts;
  const scored = scoreTopics(w, { isWeekend });
  const chosen = pickTopics(scored, day, maxTopics);
  if (!chosen.length) return null;

  const s0 = seed(day);
  const msgs = [];
  const push = (t, lv = 'passive', d = 1400) => { if (t && t.trim()) msgs.push({ t: t.trim(), lv, d: msgs.length ? d : 0 }); };

  // ⓪ 开场前的「双发」：真人常常先甩一句短的再补一句，不是每条都一句到位。
  //    只在 1/2 的日子出现，避免变成固定套路。
  if (s0 % 2 === 0) push(pick(FRAME_LEX.askBack, seed(day, 5)), 'passive', 0);

  // ① 开场：工作日「你要出门了」 vs 周末「我刚睡醒」，语气必须分开
  // 注意各槽位要用**不同 salt**：都用 s0 的话，开场/桥接/收尾会绑死成同一组合，
  // 天数一多就看出是模板（实测三种天气开场收尾一模一样）
  push(pick(isWeekend ? FRAME_LEX.openWeekend : FRAME_LEX.openWeekday, seed(day, 3)), 'passive', 0);

  // ①b 话题确实多时才说「今天有点多」——语义要对得上实际
  if (chosen.length >= 3) push(pick(FRAME_LEX.multiTopicGlue, seed(day, 137)), 'passive', 1200);

  // ② 话题主体：第一个话题是主角（决定通知级别），其余用 bridge 引出
  chosen.forEach((topic, i) => {
    const lex = TOPIC_LEX[topic.key];
    if (!lex) return;
    const vars = varsOf(w, { ...topic.data, grade: gradeOf(topic) }, sites);
    const salt = i * 17;
    if (i > 0) push(pick(FRAME_LEX.bridges, seed(day, 211 + salt * 29)), 'passive', 1100);
    // 主话题给短句（一眼能看见结论），次话题允许长句（展开讲）——长短交替才有节奏
    // renderable：先滤掉"占位符缺值"的句子（如温度缺失时避开 {tmax} 句），避免渲染出空洞
    const wantShort = i === 0;
    const usable = renderable(lex.lines, vars);
    const pool = usable.filter(l => wantShort ? l.length <= 14 : true);
    push(fill(pick(pool.length ? pool : usable, seed(day, 11 + salt * 7)), vars),
         levelFor(topic, i === 0), 1500);
    // 降水且两地有别 → 补一条对比（这是双地点的核心价值，不能省）
    if (topic.key === 'rain' && sites.length > 1) {
      const cmp = contrastLine(sites, seed(day, 300 + salt));
      if (cmp) push(fill(cmp, vars), 'passive', 1200);
      const ck = topic.data.hitAm && topic.data.hitPm ? 'both'
               : topic.data.hitPm ? 'pm' : topic.data.hitAm ? 'am' : 'none';
      push(fill(pick(RAIN_LEX.commutePhrases[ck], seed(day, 400 + salt)), vars),
           topic.data.hitAm || topic.data.hitPm ? 'timeSensitive' : 'passive', 1400);
    }
    // 每个话题都补一条态度句（不只主话题）——否则第2、3个话题只剩干巴巴一句数据，
    // 读起来像播报员念稿，前面辛苦建立的对话感在后半段就散了
    push(pick(lex.punch, seed(day, 31 + salt * 13)), 'passive', 1300);
    // 主话题再追一条：她对最要紧那件事本来就会多说两句
    if (i === 0) push(pick(lex.punch, seed(day, 419 + salt)), 'passive', 1200);
    // 每个话题有 1/2 概率补第二条信息句（换个角度再说一遍，真人就是这样）
    if (seed(day, 500 + salt) % 2 === 0) {
      const usable2 = renderable(lex.lines, vars);
      const alt = usable2.filter(l => l !== msgs[msgs.length - 1]?.t);
      push(fill(pick(alt.length ? alt : usable2, seed(day, 611 + salt * 3)), vars), 'passive', 1300);
    }
  });

  // ②b 话题不足时补厚：平淡日只有 1 个话题，走完主流程才 8 条，草草收场像敷衍。
  //     此时她本来就没正事可说 → 多说自己（punch/selfRef），反而更贴角色。
  if (chosen.length <= 2) {
    const lex = TOPIC_LEX[chosen[0].key];
    // ⚠ 这里不能用 multiTopicGlue（语义是「今天事情有点多」）——只有一个话题时那是说谎。
    //    改用 bridges（纯衔接，不承诺信息量）。
    push(pick(FRAME_LEX.bridges, seed(day, 701)), 'passive', 1200);
    push(pick(lex?.punch, seed(day, 733)), 'passive', 1400);
    push(pick(lex?.selfRef, seed(day, 757)), 'passive', 1500);
    push(pick(lex?.punch, seed(day, 787)), 'passive', 1300);
  }

  // ③ 「我又不出门却在管你」——概率从 1/3 提到 2/3，这是她最有辨识度的一面
  if (s0 % 3 !== 0) {
    const lex = TOPIC_LEX[chosen[0].key];
    push(pick(lex?.selfRef, seed(day, 77)), 'passive', 1500);
  }
  // ④⑤ 收尾：askBack 与「追加一条 closer」二选一，不能都上。
  //     三条同义的索取连着甩（说句话啊/别装作没看见/都不回…那我睡了）真人不会这么讲话。
  if (s0 % 2 === 0) push(pick(FRAME_LEX.askBack, seed(day, 823)), 'passive', 1400);
  push(pick(FRAME_LEX.closers, seed(day, 907)), 'passive', 1600);
  if (s0 % 2 === 1) {
    const more = FRAME_LEX.closers.filter(c => c !== msgs[msgs.length - 1]?.t);
    push(pick(more, seed(day, 1013)), 'passive', 1800);
  }

  return { topics: chosen, msgs, lead: chosen[0] };
}

function gradeOf(t) {
  if (t.key !== 'rain') return undefined;
  const mm = t.data?.rainMax ?? 0;
  return t.data?.thunder ? '雷阵雨' : mm >= 8 ? '暴雨' : mm >= 3 ? '大雨' : mm >= 1 ? '中雨' : '小雨';
}
function contrastLine(sites, s) {
  const [h, o] = sites;
  if (!h || !o) return null;
  const C = RAIN_LEX.contrastPhrases;
  const dh = h.totalMm, doo = o.totalMm, gap = Math.abs(dh - doo);
  if (gap < 0.3) return pick(C.same, s);
  if (doo < 0.5) return pick(C.officeClear, s);
  if (dh < 0.5) return pick(C.homeClear, s);
  return doo > dh ? pick(C.officeWorse, s) : pick(C.homeWorse, s);
}

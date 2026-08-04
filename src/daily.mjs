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
    if (v === undefined || v === null || Number.isNaN(v)) return '';
    return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
  });
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
  const { day, isWeekend = false, noon = false, maxTopics = 3 } = opts;
  const scored = scoreTopics(w, { isWeekend });
  const chosen = pickTopics(scored, day, maxTopics);
  if (!chosen.length) return null;

  const s0 = seed(day);
  const msgs = [];
  const push = (t, lv = 'passive', d = 1400) => { if (t && t.trim()) msgs.push({ t: t.trim(), lv, d: msgs.length ? d : 0 }); };

  // ① 开场：工作日「你要出门了」 vs 周末「我刚睡醒」，语气必须分开
  // 注意各槽位要用**不同 salt**：都用 s0 的话，开场/桥接/收尾会绑死成同一组合，
  // 天数一多就看出是模板（实测三种天气开场收尾一模一样）
  push(pick(isWeekend ? FRAME_LEX.openWeekend : FRAME_LEX.openWeekday, seed(day, 3)), 'passive', 0);

  // ② 话题主体：第一个话题是主角（决定通知级别），其余用 bridge 引出
  chosen.forEach((topic, i) => {
    const lex = TOPIC_LEX[topic.key];
    if (!lex) return;
    const vars = varsOf(w, { ...topic.data, grade: gradeOf(topic) }, sites);
    const salt = i * 17;
    if (i > 0) push(pick(FRAME_LEX.bridges, seed(day, 211 + salt * 29)), 'passive', 1100);
    // 主话题给短句（一眼能看见结论），次话题允许长句（展开讲）——长短交替才有节奏
    const wantShort = i === 0;
    const pool = lex.lines.filter(l => wantShort ? l.length <= 14 : true);
    push(fill(pick(pool.length ? pool : lex.lines, seed(day, 11 + salt * 7)), vars),
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
  });

  // ③ 偶尔来一句「我又不出门却在管你」——不是每天都有，才显得是真心话
  if (s0 % 3 === 0) {
    const lex = TOPIC_LEX[chosen[0].key];
    push(pick(lex?.selfRef, seed(day, 77)), 'passive', 1500);
  }
  // ④ 收尾：她真正想说的
  push(pick(FRAME_LEX.closers, seed(day, 907)), 'passive', 1600);

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

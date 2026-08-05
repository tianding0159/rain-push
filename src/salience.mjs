// ═══ 显著性评分：决定「今天她该说什么」═══
// 数据面很宽（温度/体感/湿度/风/紫外线/能见度/云量/降水…），但**不能全说**。
// 每天给每个话题打分，只说分高的那 2-4 条：
//   ① 必说（score >= MUST）：会实际影响你的，漏了就是失职
//   ② 轮换（MENTION <= score < MUST）：够格但不紧急，按日期做种挑，制造每天不同
//   ③ 不说（score < MENTION）：平淡无奇，说了是噪音
// 「365天不重复」主要靠这一层——话题组合本身每天就不一样，文案变体只是second layer。

export const MUST = 70, MENTION = 40;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 线性映射到 0-100，超出上限也不再涨（避免极端值把别的话题全挤掉）
const ramp = (v, lo, hi) => clamp((v - lo) / (hi - lo) * 100, 0, 100);

/**
 * @param w 归一后的当天数据 { hours:[{hh,mm,prob,temp,feels,humid,wind,gust,uv,vis,cloud,code,text}], daily:{tmax,tmin} }
 * @param ctx { isWeekend, amRush:[a,b], pmRush:[a,b] }
 */
export function scoreTopics(w, ctx = {}) {
  const H = w.hours;
  if (!H.length) return [];
  // 防线：调用方应已按当天过滤。若混入多天数据，评分会把明天的天气算成今天。
  const days = new Set(H.map(x => x.day).filter(Boolean));
  if (days.size > 1) throw new Error(`scoreTopics 收到跨天数据（${[...days].join(',')}）——上游必须先按当天过滤`);
  const day = H.filter(x => x.hh >= 7 && x.hh <= 22);      // 醒着的时段
  const S = arr => arr.filter(v => typeof v === 'number' && !Number.isNaN(v));
  // 空数组返回 undefined 而非 ±Infinity —— 否则 (-Infinity).toFixed(1) 会把
  // "-Infinity度" 漏进文案（实测：假数据无温度时满屏 Infinity度）。数据真空就明说"没有"。
  const max = (f) => { const a = S(day.map(f)); return a.length ? Math.max(...a) : undefined; };
  const min = (f) => { const a = S(day.map(f)); return a.length ? Math.min(...a) : undefined; };
  const avg = (f) => { const a = S(day.map(f)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };

  const rainHrs = day.filter(x => x.mm >= 0.2 || x.prob >= 35);
  const rainMax = rainHrs.length ? Math.max(...rainHrs.map(x => x.mm)) : 0;
  const rainSum = +day.reduce((s, x) => s + (x.mm || 0), 0).toFixed(1);
  const thunder = day.some(x => (x.text || '').includes('雷'));
  const inSpan = ([a, b]) => rainHrs.some(x => x.hh >= a && x.hh < b);
  const hitAm = inSpan(ctx.amRush || [7, 9]), hitPm = inSpan(ctx.pmRush || [17, 19]);

  const tmax = w.daily?.tmax ?? max(x => x.temp);
  const tmin = w.daily?.tmin ?? min(x => x.temp);
  const swing = tmax - tmin;
  const feelsGap = max(x => (x.feels ?? x.temp) - x.temp);      // 体感高出实际最多多少
  const chillGap = min(x => (x.feels ?? x.temp) - x.temp);      // 体感低于实际最多多少
  const humid = avg(x => x.humid) * 100;
  const windMax = max(x => x.wind), gustMax = max(x => x.gust);
  const uvMax = max(x => x.uv);
  const visMin = min(x => x.vis);
  const cloudAvg = avg(x => x.cloud) * 100;

  const t = [];
  const push = (key, score, data) => { if (score >= MENTION) t.push({ key, score: Math.round(score), data }); };

  // ── 降水：唯一能被「撞通勤」加权的话题，因为它直接决定你会不会淋湿
  if (rainHrs.length) {
    let s = Math.max(ramp(rainMax, 0.3, 8), ramp(rainSum, 1, 25));
    if (hitAm || hitPm) s += 18;
    if (hitAm && hitPm) s += 8;
    if (thunder) s = Math.max(s, 82);
    // 保底入场：真该报的雨（口径对齐 worker.analyze 的 dayMinMm/peakMinMm）即便计分偏低
    // 也至少进池——否则 2mm 这种小雨评分 ~22 < MENTION 会被踢掉，导致「下着雨却说没雨」
    // （daily 用 salience 评分、analyze 用双下限，两套口径曾在此打架）。纯概率高但雨量为 0、
    // 或毛毛雨（峰值 <0.5）不达标 → 不保底，维持「实际量级≠概率」的静默设计。
    const worthReporting = (rainSum >= 0.8 && rainMax >= 0.5) || thunder;
    if (worthReporting) s = Math.max(s, MENTION);
    push('rain', clamp(s, 0, 100), { rainMax, rainSum, thunder, hitAm, hitPm,
      start: rainHrs[0].hh, end: Math.min(rainHrs[rainHrs.length - 1].hh + 1, 23) });
  }
  push('heat',   ramp(tmax, 30, 39),        { tmax });
  push('cold',   ramp(12 - tmin, 0, 12),    { tmin });          // 12°C 以下才开始计分
  push('swing',  ramp(swing, 8, 16),        { swing, tmax, tmin });
  push('muggy',  ramp(feelsGap, 2, 8) * (humid > 75 ? 1 : 0.6), { feelsGap, humid, tmax });
  push('windchill', ramp(-chillGap, 3, 10), { chillGap, tmin });
  push('humid',  humid >= 85 ? ramp(humid, 85, 96) : (humid <= 32 ? ramp(32 - humid, 0, 14) : 0), { humid });
  push('wind',   Math.max(ramp(windMax, 6, 14), ramp(gustMax, 10, 20)), { windMax, gustMax });
  push('uv',     ramp(uvMax, 6, 11),        { uvMax });
  push('haze',   ramp(8000 - visMin, 0, 6500), { visMin });
  push('clear',  rainHrs.length ? 0 : ramp(30 - cloudAvg, 0, 26), { cloudAvg, tmax });
  push('gloomy', rainHrs.length ? 0 : ramp(cloudAvg - 72, 0, 24), { cloudAvg });

  // 兜底：每日播报不该有「无话可说」的日子。什么都不显著时给一个 mild 话题，
  // 让她照样能说两句（温度还是要报的，只是没什么要嘱咐的）。
  // 注意分数压在 MENTION 之上一点点 → 一旦有真话题，它会被挤掉，不抢戏。
  if (!t.length) t.push({ key: 'mild', score: MENTION + 1, data: { tmax, tmin, humid } });
  return t.sort((a, b) => b.score - a.score);
}

/** 从评分结果选出今天真正要说的话题：必说全上 + 轮换按日期挑 */
export function pickTopics(scored, day, maxN = 3) {
  const must = scored.filter(x => x.score >= MUST);
  const rest = scored.filter(x => x.score < MUST);
  const out = must.slice(0, maxN);
  if (out.length < maxN && rest.length) {
    // 日期做种轮换：同一天固定，不同天换着说 → 天然的每日新鲜感
    let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const need = maxN - out.length;
    for (let i = 0; i < need && i < rest.length; i++) out.push(rest[(h + i * 7) % rest.length]);
  }
  return out;
}

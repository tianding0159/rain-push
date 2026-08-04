// ═══════════════════════════════════════════════════════════════
//  今日雨讯 → iPhone (Bark)  |  Cloudflare Worker
//  双地点(住处/公司) · 不下雨则完全静默
//  数据 和风1km 或 Open-Meteo7km · 图标Worker内生成(零依赖PNG编码)
// ═══════════════════════════════════════════════════════════════
import { getForecast as qwForecast } from './qweather.mjs';
import { ICON_POOL, ICON_MIME } from './icon_pool.mjs';
import { compose as kcompose, rainShape } from './voice.mjs';
import { buildChat, sendChat } from './chat.mjs';
import { buildDaily } from './daily.mjs';

// 地点从 SITES secret 读取，不写进代码——精确住址/公司坐标 + 通勤时段
// 合起来是一份完整行踪画像，不该进版本库（即使仓库是 private，fork/泄露也带着走）
// 格式：[{"name":"家","lat":00.00,"lon":000.00},{"name":"公司","lat":00.00,"lon":000.00}]
// 支持 1~N 个地点；只给一个就退化成单地点模式
function loadSites(env) {
  let sites;
  try { sites = JSON.parse(env.SITES || '[]'); }
  catch { throw new Error('SITES 不是合法 JSON'); }
  if (!Array.isArray(sites) || !sites.length) throw new Error('SITES 为空，请先配置');
  for (const s of sites) {
    if (typeof s.lat !== 'number' || typeof s.lon !== 'number')
      throw new Error(`SITES 中 ${s.name || '?'} 的 lat/lon 必须是数字`);
  }
  return sites;
}
const CFG = {
  tz: 'Asia/Shanghai',
  windowStart: 7, windowEnd: 22,      // 只关心醒着、可能出门的时段
  hourHitMm: 0.2,                     // 单小时命中：有实际雨量（两家都是mm/h，可比）
  // 概率阈值必须按数据源分开——两家口径完全不同，共用一个数会让这条闸静默失效。
  // 实测2026-08-04同一天同一地点：Open-Meteo 峰值98%，和风峰值仅37%。
  // 和风的 probability 语义偏保守，若沿用70则永不命中（程序照跑、闸等于不存在）。
  hourHitProb: { 'open-meteo': 70, 'qweather': 35 },
  dayMinMm: 0.8,                      // 窗口累计下限，滤掉一整天的毛毛雨
  peakMinMm: 0.5,                     // 峰值下限：全天没有一小时到0.5mm = 毛毛雨，静默
  siteQuietMm: 0.5,                   // 某地点低于此值 → 不画柱图，直接说"基本没有"
  amRush: [7, 9], pmRush: [17, 19],
};
const THUNDER = new Set([95, 96, 99]);
const BARS = '▁▂▃▄▅▆▇█';

// ── 颜文字池：按严重度分档，日期做种轮换 ──
const KAO = {
  drizzle: ['(´･ᴗ･`)','(´• ω •`)','(｡･ω･｡)','(´꒳`)','( ˘͈ ᵕ ˘͈ )','(◡‿◡)','(´▽｀)'],
  moderate:['( •̀ ω •́ )','(๑•̀ㅂ•́)و','(｡•̀ᴗ-)','( •̀ᴗ•́ )و','(ง ˙˘˙ )ว','(๑•̀ᗜ•́)و'],
  heavy:   ['( •̀ㅁ•́;)','(๑•̀ᗝ•́)૭','(ง •̀_•́)ง','(｡•́︿•̀｡)','(・_・;)'],
  torrent: ['(⊙_⊙)','(・o・)','(￣□￣」)','(°ロ°)'],
  cat:     ['ฅ^•ﻌ•^ฅ','(=^･ω･^=)','ฅ(•ㅅ•)ฅ','(=①ω①=)','ฅ( ̳• ·̫ • ̳ฅ)','(=・ω・=)','(=^ ◡ ^=)'],
};
function pickKao(day, maxMm, thunder) {
  let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;   // 同一天必须同一个
  const pool = maxMm >= 8 ? KAO.torrent
    : (maxMm >= 3 || thunder) ? KAO.heavy
    : maxMm >= 1 ? KAO.moderate : KAO.drizzle;
  return { face: pool[h % pool.length],
           cat: (!thunder && maxMm < 3) ? KAO.cat[(h >> 3) % KAO.cat.length] : null };
}

// ── 数据源分发 ──
async function fetchAll(env, override) {
  const sites = loadSites(env);
  const want = override || env.PROVIDER;
  const provider = want === 'qweather' ? 'qweather' : 'open-meteo';
  const locs = provider === 'qweather' ? await qwForecast(sites, env) : await omForecast(sites);
  // 「今天」一律取数据自带的本地日期，不在 Worker 里从 UTC 推（Worker 运行时是 UTC）
  const day = locs[0].daily.time[0];
  return { locs, day, provider, sites };
}

async function omForecast(SITES) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: SITES.map(s => s.lat).join(','),
    longitude: SITES.map(s => s.lon).join(','),
    timezone: CFG.tz, forecast_days: 1,
    hourly: 'precipitation,precipitation_probability,weather_code',
    daily: 'precipitation_sum',
  });
  const r = await fetch(u, { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [j];
}

function hoursOf(loc, day) {
  const h = loc.hourly;
  return h.time.map((t, i) => ({
    day: t.slice(0, 10), hh: +t.slice(11, 13), mm: h.precipitation[i] ?? 0,
    prob: h.precipitation_probability[i] ?? 0, code: h.weather_code[i] ?? 0,
  }))
  // 只留「今天」——和风的24小时窗口会跨到次日，混进来会把明天的雨算成今天
  .filter(x => x.day === day && x.hh >= CFG.windowStart && x.hh <= CFG.windowEnd);
}

function analyzeSite(loc, day, provider) {
  const hours = hoursOf(loc, day);
  const probGate = CFG.hourHitProb[provider];
  const thunderHours = hours.filter(x => THUNDER.has(x.code));   // 雷暴独立扫全窗口
  const wet = hours.filter(x => x.mm >= CFG.hourHitMm || x.prob >= probGate);
  const hit = [...new Set([...wet, ...thunderHours])].sort((a, b) => a.hh - b.hh);
  return {
    hours, hit,
    thunder: thunderHours.length > 0,
    totalMm: +hit.reduce((s, x) => s + x.mm, 0).toFixed(1),
    maxMm: hit.length ? Math.max(...hit.map(x => x.mm)) : 0,
  };
}

function analyze(locs, day, provider, siteDefs) {
  const per = locs.map((loc, i) => ({ site: siteDefs[i], ...analyzeSite(loc, day, provider) }));
  // 任一地点达标就推送（住处和公司都可能淋到）
  // 累计够但峰值太小（毛毛雨连下一整天）同样静默——除非有雷
  const live = per.filter(p => p.hit.length &&
    ((p.totalMm >= CFG.dayMinMm && p.maxMm >= CFG.peakMinMm) || p.thunder));
  if (!live.length) return { rain: false, per };

  const allHit = live.flatMap(p => p.hit);
  const start = Math.min(...allHit.map(x => x.hh));
  const end = Math.min(Math.max(...allHit.map(x => x.hh)) + 1, 23);
  const maxMm = Math.max(...live.map(p => p.maxMm));
  const thunder = live.some(p => p.thunder);
  const peak = allHit.reduce((a, b) => (b.mm > a.mm ? b : a));
  const grade = thunder ? '雷阵雨'
    : maxMm >= 8 ? '暴雨' : maxMm >= 3 ? '大雨' : maxMm >= 1 ? '中雨' : '小雨';
  const inSpan = ([a, b]) => allHit.some(x => x.hh >= a && x.hh < b);

  // 每个地点在统一时间轴上的柱图（轴一致才可横向比较）
  // 下限1.0mm：没有它，0.1mm/h的平雨会被归一化成满格█，看着像暴雨
  const scale = Math.max(maxMm, 1.0);
  const sites = per.map(p => {
    const span = p.hours.filter(x => x.hh >= start && x.hh < end);
    return {
      name: p.site.name, totalMm: p.totalMm, maxMm: p.maxMm,
      spark: span.map(x => x.mm <= 0 ? BARS[0]
        : BARS[Math.min(7, Math.max(1, Math.round(x.mm / scale * 7)))]).join(''),
      hours: span.map(x => [x.hh, x.mm]),
    };
  });
  return { rain: true, grade, thunder, start, end, maxMm, peakHour: peak.hh,
           hitAmRush: inSpan(CFG.amRush), hitPmRush: inSpan(CFG.pmRush), sites };
}

function composeFallback(r, day) {
  const p = n => String(n).padStart(2, '0');
  const { face, cat } = pickKao(day, r.maxMm, r.thunder);
  let advice;
  if (r.hitAmRush && r.hitPmRush) advice = '早晚两趟通勤都在雨里，伞今天必须带';
  else if (r.hitPmRush)           advice = '下班那趟正撞在雨里，出门时带上伞';
  else if (r.hitAmRush)           advice = '早高峰就开始下，出门前拿伞';
  else                            advice = '通勤时段没撞上，白天外出留意一下';
  if (r.thunder) advice += '。有雷，避开空旷处';

  const lines = [`${advice} ${face}`];
  const differs = r.sites.length > 1 && r.sites.some(s => s.spark !== r.sites[0].spark);
  const shown = differs ? r.sites : [r.sites[0]];
  for (const s of shown) {
    const tag = differs ? `${s.name} ` : '';
    if (differs && s.totalMm < CFG.siteQuietMm) {
      lines.push(`${s.name}那边基本没有`);      // 全是▁的柱图是噪音，不如一句话
    } else {
      lines.push(`${tag}${p(r.start)} ${s.spark} ${p(r.end)}  ${s.totalMm.toFixed(1)}mm`);
    }
  }
  if (cat) lines[lines.length - 1] += `  ${cat}`;
  return {
    title: `今天有雨 · ${p(r.start)}:00–${p(r.end)}:00`,
    subtitle: `${r.grade}，最大 ${r.maxMm.toFixed(1)}mm/h（${p(r.peakHour)} 点前后）`,
    body: lines.join('\n'),
  };
}

// ── 图标：14 张池子，按日期轮换 ──
// 用「日期做种」而非随机：中午复查会更新早上那条通知（同 group），头像若换掉会像换了个人。
// 轮换步长取 5（与 14 互质）→ 14 天走遍全池不重复，之后才回头。
export function iconIndexFor(day) {
  // 用「距基准日的天数」而非字符串哈希：哈希会碰撞，实测14天只覆盖9张。
  // 天数序列是严格连续的整数 → 与池大小取模必然走遍全池，14天一轮不重复。
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  const days = Math.floor(t / 86400000);
  const n = ICON_POOL.length;
  return ((days % n) + n) % n;
}
function iconResponse(idx = 0) {
  const b64 = ICON_POOL[((idx % ICON_POOL.length) + ICON_POOL.length) % ICON_POOL.length];
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Response(bin, { headers: {
    'Content-Type': ICON_MIME,
    // 图标是静态的 → 可长缓存；Bark 侧本身也永不过期缓存同 URL
    'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable' } });
}

async function bark(env, payload) {
  return fetch(`https://api.day.app/${env.BARK_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

async function run(env, { dry = false, revokeIfClear = false, providerOverride, slot = 'manual' } = {}) {
  const { locs, day, provider, sites } = await fetchAll(env, providerOverride);
  const r = analyze(locs, day, provider, sites);
  // 每日播报模式：没雨也要说话，跳过静默分支（静默只属于「仅下雨提醒」模式）
  if (!r.rain && (env.MODE || 'daily') !== 'daily') {
    // revoked 必须反映「真的撤回了吗」，不是「允不允许撤回」——
    // 直接回传入参会在 dry-run 或撤回失败时谎报成功
    let revoked = false;
    if (revokeIfClear && !dry) {
      const res = await bark(env, { id: `rain-${day}`, delete: '1', body: ' ' });
      revoked = res.ok;
    }
    // 静默时给出判据实测值，否则「no-rain」看不出是「差一点」还是「完全没雨」
    const detail = r.per.map(p => ({
      name: p.site.name,
      totalMm: p.totalMm, maxMm: +p.maxMm.toFixed(1),
      thunder: p.thunder, wetHours: p.hit.length,
    }));
    return {
      sent: false, day, reason: 'no-rain', revoked, provider, detail,
      gate: `累计>=${CFG.dayMinMm}mm 且 峰值>=${CFG.peakMinMm}mm/h（或有雷）`,
    };
  }
  // 图标取降水更明显的那个点。
  // 关键：把绘图数据直接编进 URL（07-21 每小时 0.1mm 为单位），让图标「自描述」。
  // 否则 Bark 取图时端点会独立重新取数——provider 可能不同、滚动窗口也可能已滑动，
  // 画出来的和推送内容对不上（实测过：推送有雨、图标全空）。
  // 数据变则 URL 变，也天然适配 Bark「图标缓存永不过期」的行为。
  // ── 每日播报模式（MODE=daily，默认）：不只下雨才响，每天都播报 ──
  if ((env.MODE || 'daily') === 'daily') {
    // ⚠ 评分必须看**所有地点**，不能只用 locs[0]。
    // 只看家会漏掉「公司暴雨、家里晴」——那正是双地点存在的意义（实测被判静默）。
    // 做法：逐小时取各地点的**最不利值**（雨量/风/紫外线取最大，能见度取最小），
    // 保证任一地点的坏天气都能触发；具体哪边下得大交给 contrastPhrases 说。
    const worst = (arrs, f = Math.max) => (i) => {
      const vs = arrs.map(a => a?.[i]).filter(v => typeof v === 'number' && !Number.isNaN(v));
      return vs.length ? f(...vs) : undefined;
    };
    const hs = locs.map(l => l.hourly);
    const h0 = { time: hs[0].time,
      precipitation:             hs[0].time.map((_, i) => worst(hs.map(h => h.precipitation))(i)),
      precipitation_probability: hs[0].time.map((_, i) => worst(hs.map(h => h.precipitation_probability))(i)),
      temperature:  hs[0].time.map((_, i) => worst(hs.map(h => h.temperature))(i)),
      apparent:     hs[0].time.map((_, i) => worst(hs.map(h => h.apparent))(i)),
      humidity:     hs[0].time.map((_, i) => worst(hs.map(h => h.humidity))(i)),
      wind:         hs[0].time.map((_, i) => worst(hs.map(h => h.wind))(i)),
      gust:         hs[0].time.map((_, i) => worst(hs.map(h => h.gust))(i)),
      uv:           hs[0].time.map((_, i) => worst(hs.map(h => h.uv))(i)),
      visibility:   hs[0].time.map((_, i) => worst(hs.map(h => h.visibility), Math.min)(i)),
      cloud:        hs[0].time.map((_, i) => worst(hs.map(h => h.cloud))(i)),
      condText:     hs[0].time.map((_, i) => hs.map(h => h.condText?.[i]).find(t => t && t.includes('雷'))
                                          || hs[0].condText?.[i] || ''),
    };
    // ⚠ 必须在这里就按 day 过滤：和风返回的是**跨次日**的滚动 24 小时窗口。
    // salience.scoreTopics 只按小时过滤、不看日期 → 会把明天 14 点的雨算成今天的，
    // 而 siteStats 按 day 过滤只算今天 → 出现「rain 得分 82 但两地累计 0mm」的自相矛盾。
    // 根因不是「两个数据源」，是**同一数据源被两套不同的过滤条件切**。统一在此处切。
    const w = {
      hours: h0.time.map((t, i) => ({
        day: t.slice(0, 10),
        hh: +t.slice(11, 13), mm: h0.precipitation[i] ?? 0,
        prob: h0.precipitation_probability[i] ?? 0,
        temp: h0.temperature?.[i], feels: h0.apparent?.[i], humid: h0.humidity?.[i],
        wind: h0.wind?.[i], gust: h0.gust?.[i], uv: h0.uv?.[i],
        vis: h0.visibility?.[i], cloud: h0.cloud?.[i], text: h0.condText?.[i] || '',
      })).filter(x => x.day === day && !Number.isNaN(x.hh)),
      daily: { tmax: Math.max(...locs.map(l => l.daily?.tmax).filter(v => v != null)),
               tmin: Math.min(...locs.map(l => l.daily?.tmin).filter(v => v != null)) },
    };
    // 今天已经过完（傍晚手动触发）时窗口内可能一条不剩 → 明确说明而非静默出错
    if (!w.hours.length) return { sent: false, day, reason: 'today-window-empty', provider,
      note: '和风滚动窗口已滑出今日 07-22 时段，非故障；定时在早上跑时窗口完整' };
    // 周末判定用北京时区的星期几（Worker 运行时是 UTC，直接 getDay 会在早推时段错一天）
    const bjDow = new Date(day + 'T12:00:00+08:00').getUTCDay();
    const isWeekend = bjDow === 0 || bjDow === 6;
    // 每地各自的当日累计必须从原始数据算 —— 不能用 r.sites（那是「达标才填」的），
    // 也不能填 0：会说出「家0mm、公司0mm，跑哪儿都躲不掉」这种自相矛盾的话
    const siteStats = locs.map((loc, i) => {
      const hh = loc.hourly;
      let sum = 0;
      hh.time.forEach((t, k) => {
        const H = +t.slice(11, 13);
        if (t.slice(0, 10) === day && H >= CFG.windowStart && H <= CFG.windowEnd)
          sum += hh.precipitation[k] || 0;
      });
      return { name: sites[i]?.name || `点${i + 1}`, totalMm: +sum.toFixed(1),
               spark: r.rain ? (r.sites[i]?.spark || '') : '' };
    });
    const built = buildDaily(w, siteStats, { day, isWeekend, noon: revokeIfClear });
    if (!built) return { sent: false, day, reason: 'nothing-worth-saying', provider };
    const iconIdx = iconIndexFor(day);
    const slot = revokeIfClear ? 'noon' : (dry ? 'dry' : (isWeekend ? 'we' : 'wd'));
    const res = await sendChat(env, built.msgs, day, slot, { dry, iconIdx });
    return dry
      ? { sent: false, day, dryRun: true, provider, mode: 'daily', isWeekend,
          topics: built.topics.map(t => `${t.key}(${t.score})`), messages: res }
      : { sent: res.every(x => x.ok), day, provider, mode: 'daily', isWeekend,
          topics: built.topics.map(t => `${t.key}(${t.score})`), count: res.length, res };
  }

  // ── 聊天流模式：拆成多条「她发来的消息」──
  // MODE=chat 走剧本；MODE=single 回到单条播报。默认 chat。
  if ((env.MODE || 'chat') === 'chat') {
    const { tier, msgs } = buildChat(r, r.sites, { noon: revokeIfClear });
    const slot = revokeIfClear ? 'noon' : (dry ? 'dry' : 'am');
    const iconIdx = iconIndexFor(day);
    const res = await sendChat(env, msgs, day, slot, { dry, iconIdx });
    return dry
      ? { sent: false, day, dryRun: true, provider, mode: 'chat', tier, messages: res }
      : { sent: res.every(x => x.ok), day, provider, mode: 'chat', tier, count: res.length, res };
  }

  // 图标固定不变 → URL 只带版本号。改图必须改这个号，否则 Bark 永久缓存不会重下
  const fp = 'v2';
  const payload = {
    ...kcompose(r, day, r.sites, CFG, {
      shape: rainShape(r.sites.reduce((a, b) => (b.maxMm > a.maxMm ? b : a)).hours),
      noon: revokeIfClear ? 'worse' : null,      // 中午那趟才用「情况有变」开头
      slot,                                       // morning/noon 各自固定；manual 每次不同
    }),
    group: '天气',
    level: 'timeSensitive',
    id: `rain-${day}`,
    isArchive: '1',
  };
  // 未配 PUBLIC_BASE（如首次部署前）就不带 icon——发一个必定 404 的 URL 只会让
  // NSE 白等一次下载超时。Bark 图标缓存永不过期，故 URL 带指纹保证换图能生效。
  if (env.PUBLIC_BASE && /^https?:\/\/[^/]+\./.test(env.PUBLIC_BASE)) {
    payload.icon = `${env.PUBLIC_BASE}/icon.png?v=${fp}`;
  }
  if (dry) return { sent: false, day, dryRun: true, provider, payload };
  const res = await bark(env, payload);
  return { sent: res.ok, day, status: res.status, payload };
}

export default {
  async scheduled(event, env, ctx) {
    const noon = event.cron === '47 4 * * *';
    ctx.waitUntil(run(env, { revokeIfClear: noon, slot: noon ? 'noon' : 'morning' }));
  },
  async fetch(req, env) {
    const { pathname, searchParams } = new URL(req.url);
    if (pathname === '/icon.png') {
      const q = searchParams.get('i');
      return iconResponse(q !== null ? parseInt(q, 10) || 0 : iconIndexFor(new Date().toISOString().slice(0, 10)));
    }
    if (pathname === '/run') {
      // Worker URL 是公开可达的 → 不设闸的话任何人拿到 URL 都能触发真实推送骚扰手机。
      // dry=1 只返回 payload 不发送，可以放开；真发必须带 TRIGGER_TOKEN。
      const dry = searchParams.get('dry') === '1';
      if (!dry) {
        const t = searchParams.get('t') || '';
        const want = env.TRIGGER_TOKEN || '';
        // 长度先比，再逐字符累积异或——避免短路比较泄露前缀信息
        let ok = want.length > 0 && t.length === want.length;
        if (ok) { let x = 0; for (let i = 0; i < want.length; i++) x |= t.charCodeAt(i) ^ want.charCodeAt(i); ok = x === 0; }
        if (!ok) return new Response('forbidden', { status: 403 });
      }
      const providerOverride = searchParams.get('provider') || undefined;
      return Response.json(await run(env, { dry, providerOverride }));
    }
    return new Response('ok');
  },
};

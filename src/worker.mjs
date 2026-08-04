// ═══════════════════════════════════════════════════════════════
//  今日雨讯 → iPhone (Bark)  |  Cloudflare Worker
//  双地点(住处/公司) · 不下雨则完全静默
//  数据 和风1km 或 Open-Meteo7km · 图标Worker内生成(零依赖PNG编码)
// ═══════════════════════════════════════════════════════════════
import { Canvas } from './png.mjs';
import { getForecast as qwForecast } from './qweather.mjs';

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

function compose(r, day) {
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

// ── 图标：固定07-21轴 + 音乐日报BPM四档配色移植 ──
const INK = [22,24,28], GRID = [255,255,255,22], EMPTY = [255,255,255,38];
const TIERS = [{max:1,c:[79,171,240]},{max:3,c:[96,196,110]},{max:8,c:[250,180,19]},{max:1e9,c:[240,90,36]}];
const SS = 4, D = 180, W = D * SS, H0 = 7, H1 = 21;

export function renderIcon(hourPairs) {
  const c = new Canvas(W, W);
  c.rect(0, 0, W, W, INK);
  for (let x = 0; x < W; x += W/9) c.rect(x, 0, SS/2, W, GRID);
  for (let y = 0; y < W; y += W/9) c.rect(0, y, W, SS/2, GRID);
  const byHour = new Map(hourPairs);
  const n = H1 - H0 + 1, span = W*0.74, x0 = (W-span)/2, slot = span/n, bw = slot*0.66;
  const base = W*0.725, maxH = W*0.44;
  c.rect(x0, base + SS*1.5, span, SS, [255,255,255,55]);
  const xNoon = x0 + (12 - H0 + 0.5) * slot;
  c.rect(xNoon - SS/2, base + SS*1.5, SS, W*0.045, [255,255,255,90]);   // 12点锚
  const mx = Math.max(...hourPairs.map(h => h[1]), 1);
  for (let i = 0; i < n; i++) {
    const hh = H0 + i, mm = byHour.get(hh) || 0;
    const x = x0 + i*slot + (slot-bw)/2;
    if (mm <= 0) { c.rect(x, base - SS*1.5, bw, SS*1.5, EMPTY); continue; }
    const h = Math.max(SS*3, Math.min(1, mm/mx) * maxH);
    c.rect(x, base - h, bw, h, TIERS.find(t => mm < t.max).c);
  }
  const R = c.w/2;   // iOS头像位会裁圆，先自己裁好保证边缘干净
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const d = Math.hypot(x-R+.5, y-R+.5), i = (y*c.w+x)*4;
    if (d > R) c.px[i+3] = 0; else if (d > R-SS) c.px[i+3] *= (R-d)/SS;
  }
  return c.downsample(SS);
}

async function bark(env, payload) {
  return fetch(`https://api.day.app/${env.BARK_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

async function run(env, { dry = false, revokeIfClear = false, providerOverride } = {}) {
  const { locs, day, provider, sites } = await fetchAll(env, providerOverride);
  const r = analyze(locs, day, provider, sites);
  if (!r.rain) {
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
  // 图标取降水更明显的那个点，且URL带指纹——Bark图标缓存永不过期，同URL不会重下
  const lead = r.sites.reduce((a, b) => (b.maxMm > a.maxMm ? b : a));
  const fp = `${day}-${r.start}${r.end}-${Math.round(r.maxMm*10)}`;
  const payload = {
    ...compose(r, day),
    group: '天气',
    level: 'timeSensitive',
    id: `rain-${day}`,
    isArchive: '1',
  };
  // 未配 PUBLIC_BASE（如首次部署前）就不带 icon——发一个必定 404 的 URL 只会让
  // NSE 白等一次下载超时。Bark 图标缓存永不过期，故 URL 带指纹保证换图能生效。
  if (env.PUBLIC_BASE && /^https?:\/\/[^/]+\./.test(env.PUBLIC_BASE)) {
    payload.icon = `${env.PUBLIC_BASE}/icon.png?fp=${fp}`;
  }
  if (dry) return { sent: false, day, dryRun: true, payload, iconHours: lead.hours };
  const res = await bark(env, payload);
  return { sent: res.ok, day, status: res.status, payload };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, { revokeIfClear: event.cron === '47 4 * * *' }));
  },
  async fetch(req, env) {
    const { pathname, searchParams } = new URL(req.url);
    if (pathname === '/icon.png') {
      const { locs, day, provider, sites } = await fetchAll(env, searchParams.get('provider') || undefined);
      const r = analyze(locs, day, provider, sites);
      const hours = r.rain
        ? r.sites.reduce((a, b) => (b.maxMm > a.maxMm ? b : a)).hours : [];
      const png = await renderIcon(hours).png();
      // 边缘缓存 1 小时：图标一天内只变一次，且能挡住被刷时对天气 API 的放大
      return new Response(png, { headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600' } });
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

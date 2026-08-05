// ═══ daily 播报回归测试（带断言，可用于 CI）═══
// 历史名 test-silence 沿用：老「下雨才推」模式测的是「该不该静默」。
// 现默认 MODE=daily（每天都说话，不静默），本脚本改测 daily 的正确性：
//   ① 无 Infinity / NaN / 空占位 {xxx} / undefined 漏进文案
//      （2026-08 「Infinity度」bug 的防回归——空温度数组经 Math.max/min 产生 ±Infinity）
//   ② daily 模式每个场景都产出消息（daily 的语义就是不空手）
//   ③ 天气话题「该在时在」——下雨场景 topics 必含 rain；无雨场景不含。
//      只校验话题清单，不校验「每条消息都是天气」：糖糖大量消息是关系向闲聊
//      （你人呢 / 我又不出门却管你 / 快点回啦），天气只是她今天找你的由头。
// 退出码：全绿 0 / 任一红 1。

// 测试用地点：中性坐标，真实坐标只存在于 secret / .dev.vars，不进版本库
const TEST_SITES = JSON.stringify([
  { name: 'A地', lat: 31.20, lon: 121.50 },
  { name: 'B地', lat: 31.25, lon: 121.60 },
]);

// 构造 Open-Meteo 形状的单点 24h 响应，绕开网络测判据。
// spec: { 小时: [雨mm, 概率%, weather_code] }
// 默认给一套「温带常夏」温度曲线，贴近真实数据（真实和风/OM 一定带温度）；
// opts.noTemp=true 则整条不带任何温度/宽字段 —— 专用于守 Infinity 的极端 case。
function loc(spec, opts = {}) {
  const t = [], p = [], pr = [], w = [];
  const temperature = [], apparent = [], humidity = [], wind = [], gust = [],
        uv = [], visibility = [], cloud = [], condText = [];
  for (let i = 0; i < 24; i++) {
    t.push(`2026-08-04T${String(i).padStart(2, '0')}:00`);
    const s = spec[i] || [0, 0, 1];
    p.push(s[0]); pr.push(s[1]); w.push(s[2]);
    if (!opts.noTemp) {
      // 清晨约 26℃ → 午后约 33℃ → 夜里回落：够真实又不误触发 heat(阈值 30 起且需更高才计分)
      const base = 26 + 7 * Math.sin(Math.max(0, i - 6) / 18 * Math.PI);
      temperature.push(+base.toFixed(1));
      apparent.push(+(base + 2).toFixed(1));           // 体感略高
      humidity.push(0.7);                              // 0-1 小数（与真实同坑）
      wind.push(3); gust.push(6);
      uv.push(i >= 10 && i <= 15 ? 6 : 1);
      visibility.push(15000);
      cloud.push(0.4);
      condText.push(s[2] === 95 ? '雷阵雨' : (s[0] > 0 ? '雨' : '多云'));
    }
  }
  const hourly = { time: t, precipitation: p, precipitation_probability: pr, weather_code: w };
  if (!opts.noTemp) Object.assign(hourly,
    { temperature, apparent, humidity, wind, gust, uv, visibility, cloud, condText });
  const daily = { time: ['2026-08-04'], precipitation_sum: [p.reduce((a, b) => a + b, 0)] };
  if (!opts.noTemp) { daily.tmax = 33; daily.tmin = 26; }
  return { latitude: 31.1, longitude: 121.5, timezone: 'Asia/Shanghai', daily, hourly };
}

const rng = (a, b, v, c = 61) =>
  Object.fromEntries(Array.from({ length: b - a }, (_, i) => [a + i, [v, 80, c]]));

// 每个 case：[名称, [双点数据], 期望]。expect.rain=true 表示 topics 必含 rain。
const cases = [
  ['晴天（两地都晴）',            [loc({}), loc({})],                                            { rain: false }],
  ['整天毛毛雨0.1×10h',           [loc(rng(9, 19, 0.1)), loc(rng(9, 19, 0.1))],                  { rain: false }],
  ['只半夜02-04下大雨',            [loc({ 2:[3,90,63], 3:[4,95,63] }), loc({ 2:[3,90,63], 3:[4,95,63] })], { rain: false }],
  ['概率85%但雨量0',              [loc({ 14:[0,85,3], 15:[0,88,3] }), loc({ 14:[0,85,3], 15:[0,88,3] })], { rain: false }],
  ['★家下雨、公司晴',             [loc({ 8:[2.5,90,63], 9:[1.8,85,63] }), loc({})],              { rain: true }],
  ['★公司下雨、家晴',             [loc({}), loc({ 16:[3.2,90,63], 17:[2.1,88,63] })],            { rain: true }],
  ['两地都下但强度不同',           [loc({ 14:[4,90,63], 15:[6,95,63] }), loc({ 14:[1,70,61], 15:[1.5,75,61] })], { rain: true }],
  ['两地完全一致（应合并单行）',    [loc({ 14:[2,85,63] }), loc({ 14:[2,85,63] })],                { rain: true }],
  ['纯雷暴雨量极小',              [loc({ 15:[0.1,40,95] }), loc({ 15:[0.1,40,95] })],            { rain: true }],
  ['早晚双峰',                    [loc({ 7:[2.8,90,63], 8:[1.2,80,61], 17:[3.1,92,63], 18:[2.4,88,63] }), loc({ 7:[2,85,63], 17:[2.5,88,63] })], { rain: true }],
  // ── 防回归极端 case：整条无温度字段。曾导致「Infinity度」漏进文案。──
  ['⚠无温度数据（守Infinity）',   [loc({}, { noTemp: true }), loc({}, { noTemp: true })],        { rain: false }],
];

// dry-run：拦截 fetch 喂入构造数据，跑 daily 模式，返回 { body, topics }
async function dryRun(locs) {
  const mod = await import('../src/worker.mjs');
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => {
    if (String(u).includes('open-meteo')) return new Response(JSON.stringify(locs));
    return new Response('{}');
  };
  try {
    const res = await mod.default.fetch(new Request('https://x/run?dry=1'),
      { BARK_KEY: 'F', PUBLIC_BASE: 'https://e', PROVIDER: 'open-meteo',
        MODE: 'daily', SITES: TEST_SITES });
    const j = await res.json();
    // daily dry-run 返回 { messages:[payload...], topics:['rain(82)',...] }
    const body = (j.messages || []).map(m => m.body).join('\n');
    const topics = (j.topics || []).map(s => String(s).replace(/\(.*/, ''));  // 'rain(82)' → 'rain'
    return { body, topics, raw: j };
  } finally { globalThis.fetch = orig; }
}

// ── 断言 ──
// 漏值特征：Infinity / NaN / undefined 字面，或未被替换的占位符 {tmax} 等。
const BAD = /Infinity|NaN|undefined|\{[a-zA-Z]\w*\}/;
let fails = 0;

for (const [name, locs, expect] of cases) {
  console.log('─'.repeat(56));
  console.log('CASE:', name);
  const { body, topics } = await dryRun(locs);
  const errs = [];

  // ① 无 Infinity/NaN/undefined/空占位漏进文案
  const m = body.match(BAD);
  if (m) errs.push(`文案出现漏值「${m[0]}」`);

  // ② daily 模式每个场景都得产出消息（daily 语义 = 不空手）
  if (!body.trim()) errs.push('daily 模式却无任何消息产出');

  // ③ 天气话题「该在时在」：下雨场景 topics 必含 rain，无雨场景不含
  if (expect.rain && !topics.includes('rain'))
    errs.push(`期望下雨但 topics 不含 rain（实际：${topics.join(',') || '空'}）`);
  if (!expect.rain && topics.includes('rain'))
    errs.push(`期望无雨但 topics 含 rain（实际：${topics.join(',')}）`);

  if (errs.length) {
    fails++;
    console.log('  ✗ FAIL');
    errs.forEach(e => console.log('     -', e));
    body.split('\n').forEach(l => console.log('     | ' + l));
  } else {
    console.log(`  ✓ PASS  topics=[${topics.join(', ')}]  ${body.split('\n').length}条消息`);
  }
}

console.log('─'.repeat(56));
if (fails) {
  console.log(`✗ ${fails}/${cases.length} 个场景失败`);
  process.exit(1);
}
console.log(`✓ 全部 ${cases.length} 个场景通过`);
process.exit(0);

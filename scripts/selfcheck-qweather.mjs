// 换数据源/换key后先跑这个：把每条字段语义假设实测一遍
// 用法: QW_HOST=... QW_KEY=... node scripts/selfcheck-qweather.mjs
const { QW_HOST: HOST, QW_KEY: KEY, LAT, LON } = process.env;
if (!HOST || !KEY) { console.error('需要 QW_HOST 和 QW_KEY'); process.exit(1); }
if (!LAT || !LON) { console.error('需要 LAT 和 LON（不写进代码，避免公开仓库泄露位置）'); process.exit(1); }
const r = await fetch(`https://${HOST}/weather/v1/hourly/${LAT}/${LON}?hours=24&localTime=true`,
  { headers: { 'X-QW-Api-Key': KEY } });
console.log('HTTP', r.status);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const h = (await r.json()).hours;
const t0 = h[0].forecastTime;
let bad = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };

console.log(`\n本地时间 (localTime=true)  首条=${t0}`);
check(t0.includes('+08:00'), '带 +08:00 偏移；否则 slice(11,13) 取小时会偏 8 小时');
console.log(`\n起点：现在 ${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`);
console.log(`  → 返回从「下一个整点」开始，不含当前小时。7:28 跑则窗口实际是 08:00 起`);

const probs = h.map(x => x.precipitation?.probability ?? 0);
console.log(`\nprobability 范围 ${Math.min(...probs)} ~ ${Math.max(...probs)}`);
check(Math.max(...probs) <= 1, '是 0-1 小数，适配器必须 ×100');
check(Math.max(...probs) < 0.7, '峰值低于 0.7 → 沿用 Open-Meteo 的 70 阈值会永不命中');

console.log(`\n单位 intensity=${h[0].precipitation?.intensity?.unit} amount=${h[0].precipitation?.amount?.unit}`);
const codes = new Map(h.map(x => [x.condition.code, x.condition.text]));
console.log('\n本次出现的 condition code：');
for (const [c, t] of [...codes].sort()) console.log(`  ${c}  ${t}${t.includes('雷') ? '  ← 判为雷暴' : ''}`);
console.log(`\n跨天：${[...new Set(h.map(x => x.forecastTime.slice(0,10)))].join(' → ')}`);
console.log('  → 滚动24小时窗口会跨到次日，必须按 day 过滤，否则把明天的雨算成今天');
console.log(bad ? `\n${bad} 项与预期不符，改适配器前先看这里` : '\n全部符合适配器假设');

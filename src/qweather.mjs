// ═══════════════════════════════════════════════════════════════
//  和风天气数据源适配器 — 归一成 Open-Meteo 形状，主逻辑零改动
//  所有字段语义均经真实凭据实测（2026-08-04），非按文档推断
// ═══════════════════════════════════════════════════════════════

// 雷暴判定：用 condition.text 含「雷」为主判据。
// 为什么不用码表：和风的 condition code 官方对照表文档页已 404，
// 而实测 302 = 雷阵雨、300 = 阵雨。写死一个查不全的码表 = 埋漏报。
// text 是本地化描述，请求时不传 lang（默认中文）即稳定含「雷」字。
// 已知代价：若将来给请求加了 lang=en，这条判据会静默失效 → 故此处硬编码不传 lang。
const THUNDER_CODES = new Set(['302', '303', '304']);
function isThunder(cond) {
  return (cond?.text || '').includes('雷') || THUNDER_CODES.has(cond?.code);
}

/**
 * @param sites [{name, lat, lon}]  和风只支持单点，双地点发两次请求
 * @returns Open-Meteo 形状的数组，供 analyze() 直接消费
 */
export async function getForecast(sites, env) {
  const out = [];
  for (const s of sites) {
    // 经纬度最多两位小数——多给会 400
    const lat = s.lat.toFixed(2), lon = s.lon.toFixed(2);
    const url = `https://${env.QW_HOST}/weather/v1/hourly/${lat}/${lon}`
              + `?hours=24&localTime=true`;   // localTime=true 才返回 +08:00，否则是 UTC
    const r = await fetch(url, {
      headers: { 'X-QW-Api-Key': env.QW_KEY },
      cf: { cacheTtl: 300 },
    });
    if (!r.ok) throw new Error(`qweather ${r.status} for ${s.name}`);
    const j = await r.json();

    const time = [], precipitation = [], precipitation_probability = [], weather_code = [];
    for (const x of j.hours) {
      time.push(x.forecastTime.slice(0, 16));                       // 2026-08-04T16:00
      precipitation.push(x.precipitation?.intensity?.value ?? 0);   // mm/h
      // probability 是 0-1 小数（实测 0~0.37），×100 归一成 Open-Meteo 的 0-100
      precipitation_probability.push(Math.round((x.precipitation?.probability ?? 0) * 100));
      weather_code.push(isThunder(x.condition) ? 95 : 0);           // 归一成 WMO 语义
    }
    // 和风 hourly 不返回 daily —— 顶层只有 metadata / hours，自己按当天累加
    const day = time[0].slice(0, 10);
    const sum = +j.hours.reduce((a, x) =>
      a + (x.forecastTime.startsWith(day) ? (x.precipitation?.amount?.value ?? 0) : 0), 0
    ).toFixed(1);

    out.push({
      latitude: +lat, longitude: +lon, timezone: 'Asia/Shanghai',
      daily: { time: [day], precipitation_sum: [sum] },
      hourly: { time, precipitation, precipitation_probability, weather_code },
    });
  }
  return out;
}

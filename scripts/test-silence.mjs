import * as W from '../src/worker.mjs';
import fs from 'fs';
// 测试用地点：中性坐标，真实坐标只存在于 secret / .dev.vars，不进版本库
const TEST_SITES = JSON.stringify([
  { name: 'A地', lat: 31.20, lon: 121.50 },
  { name: 'B地', lat: 31.25, lon: 121.60 },
]);
// 直接构造 Open-Meteo 形状的双点响应，绕开网络测判据
function loc(spec){ const t=[],p=[],pr=[],w=[];
  for(let i=0;i<24;i++){ t.push(`2026-08-04T${String(i).padStart(2,'0')}:00`);
    const s=spec[i]||[0,0,1]; p.push(s[0]); pr.push(s[1]); w.push(s[2]); }
  return {latitude:31.1,longitude:121.5,timezone:'Asia/Shanghai',
    daily:{time:['2026-08-04'],precipitation_sum:[p.reduce((a,b)=>a+b,0)]},
    hourly:{time:t,precipitation:p,precipitation_probability:pr,weather_code:w}};
}
const rng=(a,b,v,c=61)=>Object.fromEntries(Array.from({length:b-a},(_,i)=>[a+i,[v,80,c]]));
const cases=[
 ['晴天（两地都晴）',            [loc({}), loc({})]],
 ['整天毛毛雨0.1×10h',           [loc(rng(9,19,0.1)), loc(rng(9,19,0.1))]],
 ['只半夜02-04下大雨',            [loc({2:[3,90,63],3:[4,95,63]}), loc({2:[3,90,63],3:[4,95,63]})]],
 ['概率85%但雨量0',              [loc({14:[0,85,3],15:[0,88,3]}), loc({14:[0,85,3],15:[0,88,3]})]],
 ['★家下雨、公司晴',             [loc({8:[2.5,90,63],9:[1.8,85,63]}), loc({})]],
 ['★公司下雨、家晴',             [loc({}), loc({16:[3.2,90,63],17:[2.1,88,63]})]],
 ['两地都下但强度不同',           [loc({14:[4,90,63],15:[6,95,63]}), loc({14:[1,70,61],15:[1.5,75,61]})]],
 ['两地完全一致（应合并单行）',    [loc({14:[2,85,63]}), loc({14:[2,85,63]})]],
 ['纯雷暴雨量极小',              [loc({15:[0.1,40,95]}), loc({15:[0.1,40,95]})]],
 ['早晚双峰',                    [loc({7:[2.8,90,63],8:[1.2,80,61],17:[3.1,92,63],18:[2.4,88,63]}), loc({7:[2,85,63],17:[2.5,88,63]})]],
];
let sent=0, silent=0;
for(const [name,locs] of cases){
  const r=W.__test_analyze? W.__test_analyze(locs) : null;
  console.log('─'.repeat(56)); console.log('CASE:', name);
  const out = await dryRun(locs);
  if(!out) { silent++; console.log('  → 静默，不推送'); }
  else { sent++; out.split('\n').forEach((l,i)=>console.log(i?'    '+l:'  ▣ '+l)); }
}
console.log('─'.repeat(56));
console.log(`触发 ${sent} / 静默 ${silent}`);

// 用模块导出的内部函数做 dry run
async function dryRun(locs){
  const mod = await import('../src/worker.mjs');
  // analyze/compose 未导出 → 走 fetch 拦截
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => {
    if (String(u).includes('open-meteo')) return new Response(JSON.stringify(locs));
    return new Response('{}');
  };
  try {
    const res = await mod.default.fetch(new Request('https://x/run?dry=1'),
      {BARK_KEY:'F', PUBLIC_BASE:'https://e', PROVIDER:'open-meteo', SITES:TEST_SITES});
    const j = await res.json();
    // 两种模式都要认：chat 模式返回 messages[]，single 模式返回 payload
    if (j.messages) return j.messages.map(m => m.body.replace(/\n/g, ' / ')).join('\n');
    if (j.payload)  return [j.payload.title, j.payload.subtitle, ...j.payload.body.split('\n')].join('\n');
    return null;
  } finally { globalThis.fetch = orig; }
}

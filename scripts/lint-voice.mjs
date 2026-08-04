// 文案 AI 味量化体检。用法: node scripts/lint-voice.mjs [--strict]
// 把「像不像糖糖说的」变成可测指标——凭感觉判断不可复现，改一次就得重新吵一次。
import { TOPIC_LEX, FRAME_LEX } from '../src/lex/topics.mjs';

// 判据从「平均值」改成「分布形状」——用户点出的问题：
// 真人是长短混着来。全是碎句是另一种机械，逼平均值下来会把长句全杀掉（实测≥19字只剩1%）。
// 所以既要短句够多，也要**保底有长句**，还要方差够大。
const GATES = {
  avgLen:      { min: 7, max: 15, label: '平均字数' },
  stdev:       { min: 5.0, label: '长度标准差(离散度)' },
  shortRatio:  { min: 0.25, label: '≤6字短句占比' },
  longRatio:   { min: 0.08, label: '≥19字长句占比' },
  periodRatio: { max: 0.25, label: '句号结尾占比' },
  ellipsis:    { min: 0.20, label: '含省略号占比' },
  particle:    { min: 0.25, label: '语气词收尾占比' },
  idiom:       { max: 0.15, label: '四字书面语占比' },
  causal:      { max: 0.02, label: '因果连词占比' },
  // 同开头放宽为占比：真人聊天本来就爱反复用「喂」「哼」「算了」开头，
  // 卡绝对次数会逼出刻意的多样性，反而假。只要没有哪个开头独占超过 6% 即可。
  headTopRatio: { max: 0.06, label: '最高频开头占比' },
};
const PARTICLE = /(嘛|啦|哦|呢|吧|诶|欸|啊|呀|咯|喔|噢)[。！？…~]?$/;
// ⚠ 判据修正：原来是 /[一-龥]{4}(?=[，。…]|$)/ —— 匹配任意四个连续汉字。
// 句子一短，整句就是四个字，「喂带伞啦」「拿伞拿伞」「你在听吗」全被判成成语，
// 344/719 命中率 61% 纯属虚报。去 AI 味成功反而让这个指标爆表，是判据的锅不是文案的。
// 改成查真实的书面语/成语词表——宁可漏报，不能误报（照着误报改会把口语改成书面语）。
const IDIOM = new RegExp([
  '一如既往','不言而喻','显而易见','众所周知','毫无疑问','由此可见','综上所述',
  '换而言之','总而言之','与此同时','值得注意','需要注意','务必注意','敬请',
  '倾盆大雨','狂风暴雨','阳光明媚','万里无云','秋高气爽','寒风刺骨','酷暑难耐',
  '瞬息万变','变幻莫测','不容小觑','有备无患','未雨绸缪','事半功倍','恰到好处',
].join('|'));
const CAUSAL = /因为|所以|因此|由于|因而/;

function measure(lines) {
  const N = lines.length || 1;
  const L = lines.map(l => l.length);
  const heads = new Map();
  for (const l of lines) {
    const h = l.replace(/\{\w+\}/g, 'N').slice(0, 3);
    heads.set(h, (heads.get(h) || 0) + 1);
  }
  return {
    n: N,
    avgLen: L.reduce((a, b) => a + b, 0) / N,
    stdev: (() => { const m = L.reduce((a, b) => a + b, 0) / N;
      return Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / N); })(),
    shortRatio: lines.filter(l => l.length <= 6).length / N,
    longRatio: lines.filter(l => l.length >= 19).length / N,
    periodRatio: lines.filter(l => l.endsWith('。')).length / N,
    ellipsis: lines.filter(l => l.includes('…') || l.includes('...')).length / N,
    particle: lines.filter(l => PARTICLE.test(l)).length / N,
    idiom: lines.filter(l => IDIOM.test(l) && !/[0-9{}]/.test(l)).length / N,
    causal: lines.filter(l => CAUSAL.test(l)).length / N,
    headTopRatio: Math.max(...heads.values()) / N,
    topHeads: [...heads].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}
function judge(m) {
  const fails = [];
  for (const [k, g] of Object.entries(GATES)) {
    const v = m[k];
    if (g.max !== undefined && v > g.max) fails.push(`${g.label} ${fmt(k, v)} > ${fmt(k, g.max)}`);
    if (g.min !== undefined && v < g.min) fails.push(`${g.label} ${fmt(k, v)} < ${fmt(k, g.min)}`);
  }
  return fails;
}
const fmt = (k, v) => k.endsWith('Ratio') || ['ellipsis', 'particle', 'idiom', 'causal'].includes(k)
  ? (v * 100).toFixed(0) + '%' : (['avgLen', 'stdev'].includes(k) ? v.toFixed(1) : String(v));

const all = [];
console.log('══ 分话题');
for (const [k, t] of Object.entries(TOPIC_LEX)) {
  const lines = Object.values(t).filter(Array.isArray).flat();
  all.push(...lines);
  const m = measure(lines), f = judge(m);
  console.log(`  ${k.padEnd(10)} n=${String(m.n).padStart(3)} 均${m.avgLen.toFixed(1)}字 ` +
    `短${(m.shortRatio*100).toFixed(0)}% 句号${(m.periodRatio*100).toFixed(0)}% ` +
    `…${(m.ellipsis*100).toFixed(0)}% 气${(m.particle*100).toFixed(0)}% ` +
    (f.length ? `✗ ${f.length}项` : '✓'));
  if (f.length && process.argv.includes('--verbose')) f.forEach(x => console.log(`      ${x}`));
}
const fl = Object.values(FRAME_LEX).filter(Array.isArray).flat();
all.push(...fl);
{
  const m = measure(fl), f = judge(m);
  console.log(`  ${'frames'.padEnd(10)} n=${String(m.n).padStart(3)} 均${m.avgLen.toFixed(1)}字 ` +
    `短${(m.shortRatio*100).toFixed(0)}% 句号${(m.periodRatio*100).toFixed(0)}% ` +
    `…${(m.ellipsis*100).toFixed(0)}% 气${(m.particle*100).toFixed(0)}% ` + (f.length ? `✗ ${f.length}项` : '✓'));
}
console.log('\n══ 全库');
const M = measure(all), F = judge(M);
for (const [k, g] of Object.entries(GATES)) {
  const v = M[k];
  const bad = (g.max !== undefined && v > g.max) || (g.min !== undefined && v < g.min);
  const bound = g.max !== undefined ? `≤${fmt(k, g.max)}` : `≥${fmt(k, g.min)}`;
  console.log(`  ${g.label.padEnd(16)}${fmt(k, v).padStart(7)}   目标 ${bound}   ${bad ? '✗' : '✓'}`);
}
if (M.topHeads.length) console.log('  重复开头:', M.topHeads.map(([h, c]) => `${h}×${c}`).join(' '));
console.log(`\n样本 ${all.length} 条 · ${F.length ? F.length + ' 项不达标' : '全部达标'}`);
process.exit(F.length && process.argv.includes('--strict') ? 1 : 0);

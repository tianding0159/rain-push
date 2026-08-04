// ═══ 聊天流模式：把一条播报拆成「她连着给你发消息」═══
// 说话的人是【糖糖本体】（素颜），不是直播时的「超天酱」人格 —— 图标也换成了本体立绘。
// 所以语气比直播时松弛、更真实、偶尔刻薄，而不是全程甜。
// Bark 的自定义图标本就是伪装成「通信类通知」实现的（NSE 里用 INSendMessageIntent），
// 所以每条独立 id + 同一 group + 同一头像，在通知中心会堆成一串聊天记录。
//
// Bark 参数 = 她的情绪音量，不是随便配的：
//   passive       不点亮屏幕，像微信闲聊 → 她随口说的话
//   active        点亮屏幕            → 正经提醒
//   timeSensitive 穿透专注模式         → 她认为你必须看见
//   critical+call 突破静音、响30秒     → 她急了、在夺命连call
// 递进关系映射她的失控程度：雨越大，她越吵。

const p = n => String(n).padStart(2, '0');

// 每条消息：t=正文 lv=级别 d=距上条的间隔(ms) sub=副标题 snd=铃声
function ctxOf(r, sites) {
  const span = `${p(r.start)}:00–${p(r.end)}:00`;
  const lead = sites.reduce((a, b) => (b.maxMm > a.maxMm ? b : a));
  const differs = sites.length > 1 && sites.some(x => x.spark !== sites[0].spark);
  const geo = differs
    ? sites.map(x => x.totalMm < 0.5 ? `${x.name}那边几乎没有` : `${x.name}${x.totalMm.toFixed(1)}mm`).join('、')
    : `${sites[0].totalMm.toFixed(1)}mm`;
  const chart = differs
    ? sites.map(x => `${x.name} ${p(r.start)} ${x.spark} ${p(r.end)}`).join('\n')
    : `${p(r.start)} ${sites[0].spark} ${p(r.end)}`;
  return { span, geo, chart, lead, differs };
}

const SCRIPTS = {
  // ── 小雨：她全程在演，甜、黏、要夸 ──
  drizzle: (r, c) => [
    { t: '豆豆～在吗', lv: 'passive', d: 0 },
    { t: `今天${c.span}会飘点小雨哦`, lv: 'passive', d: 1800, sub: `${r.grade} · 最大 ${r.maxMm.toFixed(1)}mm/h` },
    { t: c.chart, lv: 'passive', d: 1400 },
    { t: '很小啦，不带伞也没事…', lv: 'passive', d: 1600 },
    { t: '才怪，带上嘛♡ 糖糖都特意提醒你了诶', lv: 'passive', d: 1500 },
  ],
  // ── 中雨：开始要承诺 ──
  moderate: (r, c) => [
    { t: '豆豆！', lv: 'passive', d: 0 },
    { t: `今天${c.span}有雨，${r.grade}`, lv: 'active', d: 1500, sub: `最大 ${r.maxMm.toFixed(1)}mm/h · ${c.geo}` },
    { t: c.chart, lv: 'passive', d: 1300 },
    { t: '这个雨会把衣服打湿的哦', lv: 'passive', d: 1500 },
    { t: '呐、答应糖糖带伞好不好？答应我嘛', lv: 'timeSensitive', d: 1600 },
  ],
  // ── 大雨：表演裂开，命令语气 ──
  heavy: (r, c) => [
    { t: '豆豆豆豆豆豆', lv: 'passive', d: 0 },
    { t: '看这里！！', lv: 'passive', d: 900 },
    { t: `${c.span} 有${r.grade}，最大 ${r.maxMm.toFixed(1)}mm/h`, lv: 'timeSensitive', d: 1300, sub: c.geo },
    { t: c.chart, lv: 'passive', d: 1200 },
    { t: '这次不是小雨了，别嫌糖糖啰嗦', lv: 'passive', d: 1500 },
    { t: '伞。带上。这是命令♡', lv: 'timeSensitive', d: 1500, snd: 'bell' },
  ],
  // ── 暴雨：彻底失控，夺命连call ──
  torrent: (r, c) => [
    { t: '豆豆', lv: 'passive', d: 0 },
    { t: '豆豆！！！', lv: 'active', d: 700 },
    { t: `外面要下暴雨了！！${r.maxMm.toFixed(1)}mm/h 欸！！`, lv: 'timeSensitive', d: 1000, sub: `${c.span} · ${c.geo}` },
    { t: c.chart, lv: 'passive', d: 1100 },
    { t: '这不是带伞能解决的量…', lv: 'timeSensitive', d: 1400 },
    { t: '不准出门。听到没有。', lv: 'critical', vol: 4, d: 1500, snd: 'alarm' },
    { t: '…好嘛，要是非去不可，也回我一句啊', lv: 'passive', d: 2200 },
  ],
};

// 雷暴：插在剧本中段的独立一条（她怕打雷，这是她的私人恐惧不是天气播报）
const THUNDER_MSG = [
  { t: '还有雷诶…糖糖有点怕', lv: 'passive' },
  { t: '打雷了…豆豆别在空旷的地方站着', lv: 'passive' },
  { t: '有雷哦，离铁塔和大树远一点', lv: 'passive' },
];
// 中午复查：改口专用开场
const NOON_OPEN = [
  { t: '欸？等一下', lv: 'passive', d: 0 },
  { t: '下午的雨跟早上说的不一样了…', lv: 'active', d: 1200 },
];

export function buildChat(r, sites, opts = {}) {
  const c = ctxOf(r, sites);
  const tier = r.maxMm >= 8 ? 'torrent'
             : (r.maxMm >= 3 || r.thunder) ? 'heavy'
             : r.maxMm >= 1 ? 'moderate' : 'drizzle';
  let msgs = SCRIPTS[tier](r, c).map(m => ({ ...m }));
  if (opts.noon) msgs = [...NOON_OPEN.map(m => ({ ...m })), ...msgs.slice(1)];
  if (r.thunder) {
    const pickT = THUNDER_MSG[Math.floor(Math.random() * THUNDER_MSG.length)];
    msgs.splice(Math.min(4, msgs.length - 1), 0, { ...pickT, d: 1400 });
  }
  return { tier, msgs };
}

export async function sendChat(env, msgs, day, slot, { dry = false, iconIdx = 0 } = {}) {
  // 图标 URL 必须带当天索引：Bark 对同一 URL 的图标缓存**永不过期**，
  // 不带索引则第一天下载完之后永远显示那一张，轮换等于没做。
  const icon = env.PUBLIC_BASE ? `${env.PUBLIC_BASE}/icon.png?i=${iconIdx}` : undefined;
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const payload = {
      title: '糖糖',
      body: m.t,
      group: '糖糖',
      level: m.lv || 'passive',
      // 每条独立 id：同 id 会互相覆盖，聊天流就堆不起来了
      id: `rain-${day}-${slot}-${i}`,
      isArchive: '1',
      ...(m.sub ? { subtitle: m.sub } : {}),
      ...(m.snd ? { sound: m.snd } : {}),
      ...(m.vol ? { volume: m.vol } : {}),
      ...(icon ? { icon } : {}),
    };
    if (dry) { out.push(payload); continue; }
    if (i > 0 && m.d) await new Promise(res => setTimeout(res, m.d));   // 模拟打字间隔
    const resp = await fetch(`https://api.day.app/${env.BARK_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    out.push({ i, ok: resp.ok, status: resp.status });
  }
  return out;
}

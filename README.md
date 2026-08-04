# rain-push

只在**今天真的会下雨**时，给 iPhone 推一条好看的通知。不下雨完全静默。

可配置 1~N 个地点（如住处与公司），两地天气不同时分行显示、相同时自动合并成一行。
地点坐标从 `SITES` secret 读取，**不写进代码**。

## 长什么样

```
◉  今天有雨 · 13:00–19:00
   雷阵雨，最大 1.8mm/h（16 点前后）
   下班那趟正撞在雨里，出门时带上伞。有雷，避开空旷处 ( •̀ㅁ•́;)
   住处 13 ▂▂▃█▃▁ 19  2.9mm
   公司 13 ▂▂▃▅▂▁ 19  2.0mm
```

左侧图标由 Worker 当天现画（纯 JS PNG 编码，零依赖），横轴固定 07→21 点，
柱高是逐小时雨量、颜色分四档（蓝小雨 / 绿中雨 / 黄大雨 / 橙暴雨）。

## 架构

```
Cloudflare Cron (07:28 / 12:47 北京)
   └→ Worker
        ├→ 天气 API（和风 1km 或 Open-Meteo 7km，一个环境变量切换）
        ├→ 判据：该不该吵你
        └→ Bark → APNs → iPhone
```

没有服务器，没有数据库，不需要常开机器。

## 判据：怎么做到不下雨真的不吵

设计的主对象是**静默条件**，不是触发条件。三道闸：

1. **时间窗** 只看 07:00–22:00。半夜的雨不吵你。
2. **实际量级 ≠ 概率** 单小时要么雨量 ≥0.2mm/h，要么概率超阈值。
3. **双下限** 全天累计 <0.8mm，或峰值 <0.5mm/h（毛毛雨下一整天）→ 静默。

雷暴独立扫全窗口，不受雨量闸约束——雷值得单独知道。

`scripts/test-silence.mjs` 覆盖 10 个场景（含 4 个「应该静默」），改判据后必跑。

## 数据源

`PROVIDER` 环境变量切换，判据/文案/图标共用一套代码。

| | 分辨率 | 认证 | 费用 |
|---|---|---|---|
| `qweather` | **1km** | API Key + 专属 Host | 前 50000 次/月 ¥0（本项目约 120 次/月） |
| `open-meteo` | 7km | 无需 key | 免费 |

### 换 key 或换源后必跑

```bash
QW_HOST=... QW_KEY=... node scripts/selfcheck-qweather.mjs
```

它把每条字段语义假设实测一遍。**这些坑错了不会报错，只会让提醒安静地失效**：

- `probability` 是 **0–1 小数**，不是 0–100 → 判据不 ×100 则永不命中
- 两家概率**口径不同**（同日同点实测 Open-Meteo 98% vs 和风 37%）→ 阈值必须分开配
- `localTime=true` 才带 `+08:00`，否则是 UTC → 取小时会偏 8 小时
- 返回的是**滚动 24 小时窗口且跨次日** → 不按 day 过滤会把明天的雨算成今天
- 起点是**下一个整点**，不含当前小时 → 7:28 跑，窗口实际从 08:00 起
- 强制 gzip 返回 → 裸 urllib 不解压会炸（Worker 的 fetch 自动处理）
- 公共域名 `devapi.qweather.com` 2026 年起逐步停服，**必须**用专属 API Host

## 部署

```bash
npm i -D wrangler
npx wrangler secret put BARK_KEY
npx wrangler secret put QW_HOST
npx wrangler secret put QW_KEY
npx wrangler secret put SITES     # 见下方「地点配置」
npx wrangler deploy
# 回填 wrangler.toml 的 PUBLIC_BASE 后再 deploy 一次

curl "https://<你的worker>/run?dry=1"    # 看 payload，不真发
open "https://<你的worker>/icon.png"     # 看今天的图标
```

Bark 里需开「后台 App 刷新」，中午复查发现转晴时才能撤回早上那条。

## 地点配置

坐标**不写进代码**，用 secret 注入。精确住址 + 公司坐标 + 通勤时段合起来是一份
完整行踪画像，不该进版本库——即使仓库是 private，fork 或日后转公开都会带着走。

```bash
npx wrangler secret put SITES
# 粘贴（一行，1~N 个地点；只给一个就退化成单地点模式）：
# [{"name":"住处","lat":00.00,"lon":000.00},{"name":"公司","lat":00.00,"lon":000.00}]
```

本地调试把同样内容写进 `.dev.vars`（已 gitignore），格式见 `.dev.vars.example`。

未配置时 Worker 会**明确抛错**而不是静默跑空——这类配置缺失最怕的就是"看着在跑其实没跑"。

## 调松紧

`src/worker.mjs` 顶部 `CFG`：嫌吵把 `dayMinMm` 从 0.8 抬到 2.0（只报中雨以上），
想连毛毛雨都知道就降到 0.3。作息不同改 `windowStart/End`、`amRush/pmRush`。

## 已知边界

- 天气预报本身有不确定性，中午那趟复查就是为了纠正早上的预报
- Bark 默认通道内容明文经第三方服务器（`api.day.app`）——天气无所谓，**别拿它推敏感内容**
- Cloudflare cron 有分钟级抖动，不保证 07:28:00 精确送达

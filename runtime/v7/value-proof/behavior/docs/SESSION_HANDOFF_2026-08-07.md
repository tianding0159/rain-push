# Session Handoff — 2026-08-07

Author: 土豆 via Ona (Claude Opus 4.8)
Branch: `p1-1a/single-sided-behavior-pilot`
Repo: `tianding0159/rain-push`(私仓)
Scope root: `runtime/v7/value-proof/`

本文档基于会话结束时对磁盘与 git 的**实测取证**写成(mtime / git log / reflog /
测试套件 / SHA256),非记忆复述。所有断言可按文末"复核命令"自行验证。

---

## 0. TL;DR

- 本会话在 `runtime/v7/value-proof/behavior/` 下构建了一整套**单侧行为证据研究管线**,
  跨 4 个阶段:Round-A 修订标注模型 → 50 条 grammar discovery → P1-1C 200 条研究 →
  P1-1D 标注工具偏差审计 → P1-1E 统一 Instrument A 200 条(进行中)。
- **唯一 push 到远端的**是 1 个 commit `88fbc1a`(仅 1 个文件:
  `CHARACTER_THEORY_V3_REVIEW.md`)。**其余全部工作仍是本地未提交状态**(untracked)。
- 测试套件当前:**198 tests / 198 pass / 0 fail**。
- **未完成**:P1-1E 的 150 条 Instrument A 重标注(需在隔离会话外部完成),及其下游
  全部分析。已导出隔离标注 kit,ingest/assembly 侧代码已就绪并测试通过。

---

## 1. Git 状态(实测)

### 1.1 分支 commit 栈(`origin/main..HEAD`)

```
88fbc1a docs(character-theory): checkpoint v3 architecture review   ← 本会话唯一 push
d2a41e5 feat: add revised Round-A behavior annotation model + 50-record pilot pass
8314468 feat(behavior): single-sided behavioral evidence corpus pilot harness
1466b89 feat(value-proof): character-fidelity measurement harness
```

- 远端 `origin/p1-1a/single-sided-behavior-pilot` = `88fbc1a`(已验证一致)。
- `d2a41e5` 及以下为更早提交(本会话之前已存在于本地)。

### 1.2 已 push 的 checkpoint(`88fbc1a`)

- 唯一改动文件:`runtime/v7/value-proof/behavior/docs/CHARACTER_THEORY_V3_REVIEW.md`
  (+360 行)。
- SHA-256:`118811b8a3e53f6d9c3ba1d8d636544902b4c84997f1040e8ed8b8cf2da939fe`
- 性质:review-only 历史研究文档,不含 engine/schema/annotation 改动。

### 1.3 未提交工作区(全部 untracked / modified,**未 push**)

| 类别 | 路径 | 状态 |
|---|---|---|
| 词表(production) | `behavior/policy/behavior-vocab.json` | **M**(+30 行,P1-1B.1 精修)|
| 引擎 lib | `behavior/lib/*.mjs`(~35 个) | untracked |
| 驱动脚本 | `behavior/bin/*.mjs`(~19 个) | untracked |
| schema | `behavior/schemas/behavior-grammar-candidate.schema.json` | untracked |
| 测试 | `behavior/tests/*.test.mjs`(6 个新) | untracked |
| 公开产物 | `behavior/discovery*/` (4 个目录) | untracked |
| 文档 | `behavior/docs/{ANNOTATION_GUIDE_REVISED,GRAMMAR_DISCOVERY}.md` | untracked |
| 私有产物 | `private/{pilot-50,behavior-200,behavior-1d,behavior-200-a}/` | untracked(gitignored)|

> 交接决策点:除 checkpoint 外,本会话所有代码/产物**尚未纳入 git**。下一位需决定
> 哪些提交、哪些属于 gitignored 私有底稿。`behavior-vocab.json` 的 M 改动明确
> **排除**在 checkpoint 外(属 production,非本 review 范围)。

---

## 2. 做了什么 — 按阶段(时间线来自文件 mtime)

### 阶段 1 · Round-A 修订标注模型(06:24–07:10)

目的:把初版行为标注升级为"修订版 Round-A"结构化模型。

- `behavior/schemas/behavior-annotation-revised.schema.json` — 修订标注 schema
- `behavior/docs/ANNOTATION_GUIDE_REVISED.md` — 修订标注指南
- `behavior/lib/round-a-revised-form.mjs`、`revised-annotation.mjs` — 表单/校验
- `behavior/lib/round-a-stats.mjs` — 统计层(边际分布)
- `behavior/bin/gen-revised-round-a.mjs` — 生成器
- `behavior/tests/revised-annotation.test.mjs` — 测试
- 产物:`private/pilot-50/round-a.revised.private.json`(**50 条**,
  SHA256 `af0c5417…`)+ `round-a.stats.private.json` + `round-a.review-priority.private.json`

### 阶段 2 · Character Theory v3 架构评审(08:32)【已 push】

目的:把 50 条 Round-A 当经验基,评审所提 7 层 Character Theory 是否"最小且充分"。

- `behavior/docs/CHARACTER_THEORY_V3_REVIEW.md`(360 行,唯一 push 的文件)
- 核心结论(review 自身,未被后续 200 条回灌):
  - 7 层链**非最小**;冻结主链 = `Situation → Driver → Strategy → Language`
    (Affect 调制 Language、Persona 作表层皮肤、Trigger-Prior 作旁挂先验表)。
  - 降级为派生:**Concern**(=driver×situation)、**Move**
    (=behaviorActionSequence 的视图)、**Desired State**(=expectedReply.relationshipReply)。
  - **Character Conservation** 作为硬可逆律被否证(多对一 fan-out),保留为软"driver-set
    成员"诊断。
  - Character packet 由 9 槽压到 **6 读取槽**。
  - 完整性:18 项要求覆盖 17 项;**Minimal Model A/B/C 缺失**
    (标 `MISSING_FROM_ORIGINAL_REVIEW`,未回填)。
  - §5 一致性核查:文档已写"Situation+Driver 在 17 个 n≥2 cell 中仍有 11 个 Strategy
    分叉"的**最终结论**(非中途"strategy tracks situation"假设),无需修正。

### 阶段 3 · 50 条 Grammar Discovery + 精修(08:58–09:52)

目的:从 50 条里挖行为语法(候选 → 假设 → churn/gate → 精修重跑)。

- lib:`grammar-candidate` `grammar-hypotheses` `grammar-churn` `grammar-gate`
  `grammar-discovery` `grammar-stability` `refinement-gap` `refinement-transform`
  `refinement-diff` `reveal-followup` `single-action-audit`
- bin:`discover-grammar.mjs` `refine-and-rerun.mjs`
- schema:`behavior-grammar-candidate.schema.json`
- 公开产物:`behavior/discovery/`(grammar-candidate / grammar-hypotheses /
  annotation-guide-churn / refinement-summary)
- 私有产物:`private/pilot-50/grammar/`(~20 个:driving-force-strategy、
  affect-strategy、transitions、reveal-mask、trigger-sensitivity、refined.* 等)

### 阶段 4 · P1-1C 200 条研究(09:54–10:31)

目的:把管线放大到 200 条(160 discovery + 40 holdout),端到端跑完。

- lib:`heuristics-200` `select-200` `heuristic-annotator` `behavior-dimensions`
  `counterexample` `hypothesis-falsification` `holdout-validation` `full-scale-gate`
  `guide-freeze`
- bin(完整驱动链):`gen-200-selection` `annotate-200` `dimensions-200`
  `falsify-200` `counterexamples-200` `stability-200` `holdout-200`
  `full-scale-gate-200` `freeze-guide` `terminal-status-200`
- 测试:`behavior/tests/p1-1c-200.test.mjs`
- 公开产物:`behavior/discovery-200/`(9 个 aggregate:dimensions、
  hypothesis-falsification、counterexample-density、holdout-validation、
  full-scale-gate、guide-freeze、selection-manifest、summary、terminal-status)
- 私有产物:`private/behavior-200/`(11 个:annotation、selection、
  discovery-160、holdout-40、counterexamples、dimensions、hypotheses、
  holdout-validation、stability、selection-key 等)

### 阶段 5 · P1-1D 标注工具偏差审计(10:38–10:52)【完成】

目的:把标注工具本身当研究对象,A vs B 配对审计 50 条。

- `behavior/lib/instrument-bias.mjs` + `instrument-bias-synthesis.mjs`
- `behavior/bin/instrument-bias-audit.mjs`
- `behavior/tests/instrument-bias.test.mjs`(27 tests)
- 公开:`behavior/discovery-1d/instrument-bias.aggregate.json`
- 私有:`private/behavior-1d/instrument-bias.private.json`
- 报告追加至 `behavior/docs/GRAMMAR_DISCOVERY.md`
- **终态**:`INSTRUMENT_BIAS_TOO_HIGH → HOLD_FIX_INSTRUMENT_FIRST`
  (证实 P1-1C 的 HOLD:两种工具不可混池)。

### 阶段 6 · P1-1E 统一 Instrument A 200 条(11:11–11:32)【进行中,已阻塞】

目的:消除混合工具混淆,统一用 Instrument A 重标 150 条(110 discovery+40 holdout),
原始 50 A 不动,构建 UNIFIED_A_200。

**已完成(与隔离无关的部分):**
- `behavior/lib/instrument-a-manifest.mjs` — Instrument A 身份清单
  (`INSTRUMENT_A_PROTOCOL_VERSION="P1-1E.instrumentA.1"`,protocolHash `92c99174…`)。
  Instrument A 定义 = "冻结标注协议下的、遵循指南的模型辅助研究标注"(非人工/非 gold)。
  匹配类 = `INSTRUMENT_A_PROTOCOL_MATCH_MODEL_VARIANT`(协议冻结、原始模型版本未记录)。
- `behavior/lib/instrument-a-validate.mjs` — 校验+指纹。原始 50 条:**0 违规**,
  指纹 `4b9564a2…`。
- `behavior/lib/freeze-lock.mjs` + `bin/freeze-lock.mjs` — 冻结锁
  (lockHash `4117a3a2…`,guide `9fad3552…`,split 160/40,seeds 固定,
  corpus sha `26355e60…`/1051 行)。状态 `FREEZE_LOCK_ESTABLISHED`。
- `behavior/lib/instrument-a-ingest.mjs` — RESUME 侧(coverage/ingest/assemble),
  已测试。
- `behavior/bin/gen-instrument-a-kit.mjs` — **隔离标注 kit 生成器**。
- 测试:`instrument-a-manifest.test.mjs`(13)+ `instrument-a-kit.test.mjs`(14)。
- 公开:`behavior/discovery-200-a/`(instrument-a-manifest、freeze-lock aggregate)。
- 私有:`private/behavior-200-a/`(manifest、freeze-lock、
  `instrument-a-kit/`13 个文件)。

**隔离 kit 内容**(`private/behavior-200-a/instrument-a-kit/`,gitignored):
README、instrument-a-manifest.json、freeze-lock.json、
records-discovery-110.json(开放,仅原文)、records-holdout-40.SEALED.json(封存)、
output-template.json、EXEMPLAR-filled.json、KIT-MANIFEST.json、
guide/(6 个冻结文档副本)。records 仅含 text+presentationId+split+recordHash
(已验证不泄露 B 字段)。

---

## 3. 未完成 / 待接手

**阻塞点**:150 条 Instrument A 重标注必须在**全新隔离会话**中完成(不得读 B、
不得读结论/H 状态/pattern),因当前会话上下文已被污染(持有 B 与全部结论)。
用户第二轮明确选择:"导出隔离 kit,然后停止"。

**从 kit 返回 150 条标注后的下游(全部 pending):**
1. 组装 `UNIFIED_A_200`(50A + 150A;ingest 侧已就绪)
2. 在 160-A discovery 上重跑 200 研究、冻结 grammar
3. 开封 40-A holdout;校验 + E3 资格
4. 三级稳定性 50A/160A/200A
5. mixed-vs-unified-a-diff(13 项,每项标 INSTRUMENT_EFFECT_LIKELY /
   CHARACTER_EFFECT_POSSIBLE / STABLE_ACROSS_INSTRUMENTS)
6. 复审 B 影响最大区域
7. A-overannotation-risk 审计(LOW/MED/HIGH)
8. 临时 character priors(context-conditioned,不落 production 常量)
9. E3 grammar gate + 最终 1051 gate(11 条件)
10. 产出 10 私有 + 7 committed;测试 ≥14;23 项最终报告
- 终态之一:`UNIFIED_A_200_READY / _HOLD / _FAILED`

**约束(整个 P1-1E 期间冻结)**:禁止 push/PR/merge/改引擎/四臂生成/自动 1051;
冻结 guide/vocab/schema/thresholds/hypotheses/holdout-split/seed;若发现真 bug,
单独记录并 STOP。

---

## 4. 关键指纹 / 常量(实测)

| 项 | 值 |
|---|---|
| checkpoint commit | `88fbc1a9904a3c125fa9438422a3a0711ba86afc` |
| review SHA-256 | `118811b8a3e53f6d9c3ba1d8d636544902b4c84997f1040e8ed8b8cf2da939fe` |
| 50-rec input SHA-256 | `af0c5417b46f2c2f571b1ef68adb950fb7f46996e53ca77dddd36ffb57eec375` |
| raw corpus SHA-256 | `26355e6050bc31d44d69f5e35c3e7a82df0db5313989388387fbe805f3b70ebb` |
| raw corpus 行数 | 1051 |
| Instrument A protocolHash | `92c99174…`(见 manifest 全值)|
| 原始 50 A 指纹 | `4b9564a2…` |
| freeze lockHash | `4117a3a2…` / guide `9fad3552…` |
| split / seeds | 160/40;holdout 4238823、presentation 11642349、selection 46168593 |
| 测试套件 | 198 tests / 198 pass / 0 fail |

---

## 5. 备份(本地,压缩不可动)

- `~/rain-push-backup/rain-push-*.bundle`(全量,~28MB,含所有分支+HEAD)
- `~/rain-push-backup/p1-1a-*.bundle`(当前分支,~1.4MB)
- 均已 `git bundle verify` 通过,含 `88fbc1a`。
- 还原:`git clone <bundle> <目标目录>`

---

## 6. 环境 / 安全备注

- 环境 git 凭据身份为 `gut12_roche`,对私仓 `tianding0159/rain-push` **无写权限**
  → 直接 `git push` 会 403。本次用 PAT(x-access-token 内联 URL,一次性、未落盘、
  未写 config)成功推送。
- **待轮换**(本会话内明文出现过,未外发/未落盘/未进 git):
  1. 用户提供的 GitHub PAT
  2. Google OAuth token(`ya29…`,agent `env|grep` 失误带出)
- 本会话未向任何"公用/共享/工作协作仓库"推送任何内容;私人业务零外泄
  (5 个本地 repo 全查:仅你私仓收到 1 个 doc commit;silicon-hitchhiker/dotfiles
  本地领先远端 0 commit)。

---

## 7. 复核命令(自行验证本文档)

```bash
cd /tmp/rain-push/runtime/v7/value-proof

# commit 栈 + checkpoint 详情
git -C /tmp/rain-push log --oneline origin/main..HEAD
git -C /tmp/rain-push show --stat 88fbc1a

# 未提交工作区
git -C /tmp/rain-push status --short

# 测试
node --test behavior/tests/

# 指纹
sha256sum behavior/docs/CHARACTER_THEORY_V3_REVIEW.md
sha256sum private/pilot-50/round-a.revised.private.json
sha256sum private/tangtang-corpus-1051.raw.txt

# 远端确认(仅你私仓)
git -C /tmp/rain-push remote -v
git -C /tmp/rain-push ls-remote --heads origin p1-1a/single-sided-behavior-pilot
```

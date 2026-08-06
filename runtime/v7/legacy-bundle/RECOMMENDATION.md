# P0-0B 清点报告 + 推荐方案

**范围**：仅 legacy root ZIP（`rain-push-v7-claude-handoff.zip`）的生命周期。**不做** R-DARK-01，不改对白，不改 runtime 行为。本文件只做**清点 + 推荐**，不实施 A/B、不开 PR。

**base**：`main` @ `a33c66577ed072a021f4b3ec8713baf12a4239af`
**分支**：`p0-0b/legacy-bundle-lifecycle`

清点为机器可验证：由 [`gen-bundle-inventory.mjs`](gen-bundle-inventory.mjs)（零依赖，直接解析 ZIP central directory）生成 [`bundle-inventory.json`](bundle-inventory.json) 与 [`bundle-source-map.json`](bundle-source-map.json)。source 分类读取**固定 base ref** `a33c665` 的 Git blobs（`git ls-tree`/`cat-file`，非工作树），因此结果可复现、不受脏工作树或本清点产出物自身影响；`--check` 校验产出物与 ZIP + base ref 是否漂移。

---

## 1. Bundle 成员清点

| 项 | 值 |
|---|---|
| ZIP SHA-256 | `badca1696482dd4aef6ebe8bdc9465d6bc9f0e82609aa04e1a97bef7a542f6c9` |
| ZIP 大小 | 528,131 B |
| git blob sha1 | `b2c74c3b79055a741f40a7041ee3bca44efb526d` |
| central 条目总数 | **398** |
| — 文件成员 | **333** |
| — 目录条目 | **65** |

每个成员的路径、压缩/解压大小、SHA-256、CRC32、method、DOS 时间、version-made-by、flags、external-attr 见 `bundle-inventory.json`。

### 信封 metadata（现 builder 与 bundle 的差异）

| metadata | bundle 实际值 | 我们的确定性 builder |
|---|---|---|
| DOS date | `23814` = **2026-08-06（打包当天）** | 固定 epoch 1980-01-01 |
| UTF-8 flag | **False**（全部 398 成员）| True (`0x0800`) |
| 目录条目 | **有 65 个** | 不写目录条目 |
| host OS | 3 (Unix) | 3 (Unix) |
| method | deflate(文件) / store(目录) | deflate |
| external attr | `100644`（文件）| `100644` |

这些 metadata 与现确定性 builder 不一致（时间戳=打包当天、无 UTF-8 flag、含显式目录条目）。它们是 ZIP 信封里**已被逐字节记录**的常量（见 `bundle-inventory.json` 每成员的 `dosDate`/`utf8Flag`/`method`/`externalAttrMode`），因此**理论上可由一个专用 builder 重现**——只是现有确定性 builder 不产生这种信封（详见 §3）。

---

## 2. Source 分类（按 content SHA-256 对固定 base ref `a33c665`，非文件名）

方法：对 base ref `a33c665` 的全部 tracked regular file blob 建 SHA-256 内容索引（97 个，symlink 已排除），逐个 bundle 文件成员按**内容哈希**匹配。**不凭文件名猜**。分类拆为四桶——「内容不匹配」**不等于**「canonical source 不存在」：

| 分类 | 数量 | 含义 |
|---|---|---|
| `exact_content_match` | **68** | 恰有一个 tracked blob 内容一致 |
| `same_path_different_content` | **1** | 同路径有 tracked 文件、但内容已漂移（**source 存在，仅内容不同**）|
| `ambiguous_content_match` | **0** | 多个 tracked blob 共享此内容 |
| `no_tracked_path` | **264** | 既无同内容 blob、base ref 也无此路径（**唯一真正 source-absent 的桶**）|
| 合计 | 333 | = ZIP 文件成员数 |

- **68 exact**：全部指向 `runtime/v7/engine/`，与 P0-0A 的 engine SSOT **逐一对应**（68/68）。`runtime/v7/engine/` 下无任何非 exact 成员，印证 P0-0A SSOT 完整。
- **1 same-path-different-content**：`README.md`——base ref 有此文件，但 bundle 内的版本内容不同（历史快照 vs 当前仓库版）。**canonical source 存在**，只是漂移了。
- **264 no-tracked-path**：仓库 base ref 里既无同内容、也无同路径。

### 264 个 no_tracked_path 构成

| 区域 | 数量 | 说明 |
|---|---|---|
| `runtime/v7/<其他 runtime>/` | 247 | 完整 v7 spec 树（language 28、emotion 25、expression 24、behavior 24、thought 23、decision…、engines、schemas、tests 等），**从未提升进仓库**，base ref 无此路径 |
| `handoff/*` | 15 | 交接文档 + 快照（DECISION_LOG、ACCEPTANCE_CRITERIA、materials_manifest.json、npm-test-output.txt、package_tree.txt、gen-materials-manifest.mjs 等）——**打包时刻的历史快照**，base ref 无此路径 |
| 顶层 doc | 2 | `CLAUDE.md`、`START_HERE_CLAUDE.md`（base ref 无此路径；`README.md` 归入上面 same-path 桶）|

---

## 3. 能否仅从当前 tracked source + 当前 builder 确定性重建完整 bundle？

**当前 tracked source 与当前 builder 无法保证完整 legacy bundle 的确定性重建。** 两条独立理由：

1. **264/333 成员在 base ref 里 `no_tracked_path`**——仓库当前既无同内容、也无同路径。占 bundle 文件成员的 **79%**。其中 247 个是从未被提升的完整 spec 树，15 个 handoff 是打包时刻的历史快照（含 `npm-test-output.txt` 这类运行产物、`materials_manifest.json` 这类自描述清单）；另有 1 个 `README.md` 属 same-path 漂移。要"从 source 重建"就得先把这些反向提升进仓库并各自建确定性生成器——远超 P0-0B「legacy bundle 生命周期」范围，且部分（测试输出快照）本质难以重建。
2. **现 builder 不产生该信封**——bundle 信封的时间戳=打包当天、无 UTF-8 flag、含目录条目，与现确定性 builder 的信封不一致。**注**：这些 metadata 已在 `bundle-inventory.json` 中逐字节记录，一个**专用 builder** 理论上可重放它们；这不是"物理上不可能"，而是"现有 tracked source + 现有 builder 这一组合做不到"。

→ **A 路径（用现 source + 现 builder 完整 repack）不成立**（A 的前提是"所有成员均有当前 canonical tracked source 且 builder 能复刻信封"，此处 264 个无路径、信封也需专用 builder）。

---

## 4. 推荐：**B — 冻结为 legacy artifact**

将 root ZIP 正式标记为 **frozen legacy artifact**：

1. **记录固定身份**：完整 ZIP SHA-256 + git blob SHA-1 + size + entry counts + frozen commit + 内嵌 engine promoted-from commit，写入 [`legacy-bundle.lock.json`](legacy-bundle.lock.json)（机器可读，`lifecycle=frozen_legacy_artifact`）。
2. **解除 SSOT 跟随**：CI 不再要求 bundle 内嵌 engine 与**当前** `engine.manifest.json` 同步。理由：既然现 source + 现 builder 无法确定性重建 bundle、且 264/333 成员在 base ref 无 tracked path，长期"跟随"只能靠**手工改二进制 ZIP**——正是评审要禁止的。
3. **CI 改为防篡改**：`verify-legacy-bundle.mjs` 验证 bundle **自身**未被改动（对 lock 校验 size/SHA-256/blob-sha1/entry counts/lock 版本），而非与活动 engine 对比。旧 `engine-tests` job 已删除，替换为 `legacy-bundle-frozen` job。
4. **迁移说明**：见 [`MIGRATION.md`](MIGRATION.md)——"当前权威 engine archive"指向 `runtime/v7/engine/`（源）+ `build-engine-archive.mjs`（`dist/rain-push-v7-engine.zip`）。新消费者用这条，不用 legacy bundle。
5. **不删除 ZIP**：除非有证据证明无消费者依赖。当前无此证据 → 保留。

### 冻结锚点（已写入 `legacy-bundle.lock.json`）
- 整包 SHA-256：`badca1696482dd4aef6ebe8bdc9465d6bc9f0e82609aa04e1a97bef7a542f6c9`
- git blob sha1：`b2c74c3b79055a741f40a7041ee3bca44efb526d`
- 内嵌 engine revision：与 engine SSOT 一致（68/68，promotedFromCommit `4f168556cc8991d2ce21121dfc7465d3212c0546`）
- 大小：528,131 B / 398 成员（333 文件 + 65 目录）

---

## 5. B 的取舍（诚实标注）

- **旧 `engine-tests` 68/68 guard 已转义并落地**：从"bundle 内嵌 engine ↔ 活动 manifest 同步"变为两条独立守卫——
  1. **frozen ZIP → lock 防篡改**（`verify-legacy-bundle.mjs` 对 `legacy-bundle.lock.json`：存在/size/SHA-256/git blob SHA-1/entry counts/lock 版本）；
  2. **权威链 round-trip**（`verify-engine-bundle-parity.mjs` 现**实际**跑在生成的 `dist/rain-push-v7-engine.zip` 解包树上，见 CI `engine-source-ssot` job 的 "round-trip parity" 步骤）。
- `verify-engine-bundle-parity.mjs` + 其 4 组测试**不浪费**：它保护的是**权威链路**（`runtime/v7/engine/` 源 → `engine.manifest.json` → `dist` archive），本 PR 已把它从"套在 legacy bundle 上"改为"套在生成 archive 的 round-trip 上"——**这条声明现在为真**（req8 走 option A：generalize + 实际使用，而非只是声称）。
- **代价**：bundle 内嵌 engine 与未来 engine 改动会"名义上"分叉，但这正是 frozen artifact 的定义——它是历史快照，不该跟随。

迁移细节见 [`MIGRATION.md`](MIGRATION.md)。本 PR 已按 **B** 实施：lock + verifier + 测试 + CI 改造 + 迁移文档，未改 root ZIP 字节、未改 runtime 行为、未开始 R-DARK-01。

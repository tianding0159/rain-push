# P0-0B 清点报告 + 推荐方案

**范围**：仅 legacy root ZIP（`rain-push-v7-claude-handoff.zip`）的生命周期。**不做** R-DARK-01，不改对白，不改 runtime 行为。本文件只做**清点 + 推荐**，不实施 A/B、不开 PR。

**base**：`main` @ `a33c66577ed072a021f4b3ec8713baf12a4239af`
**分支**：`p0-0b/legacy-bundle-lifecycle`

清点为机器可验证：由 [`gen-bundle-inventory.mjs`](gen-bundle-inventory.mjs)（零依赖，直接解析 ZIP central directory）生成 [`bundle-inventory.json`](bundle-inventory.json) 与 [`bundle-source-map.json`](bundle-source-map.json)。`--check` 可校验二者与 ZIP 是否漂移。

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

### 信封 metadata（决定能否逐字节重建）

| metadata | bundle 实际值 | 我们的确定性 builder |
|---|---|---|
| DOS date | `23814` = **2026-08-06（打包当天）** | 固定 epoch 1980-01-01 |
| UTF-8 flag | **False**（全部 398 成员）| True (`0x0800`) |
| 目录条目 | **有 65 个** | 不写目录条目 |
| host OS | 3 (Unix) | 3 (Unix) |
| method | deflate(文件) / store(目录) | deflate |
| external attr | `100644`（文件）| `100644` |

即便内容相同，bundle 的**信封字节也无法用现 builder 重现**：时间戳是打包当天（非确定性）、无 UTF-8 flag、含显式目录条目。

---

## 2. Canonical source 映射（按 content SHA-256，非文件名）

方法：对 `git ls-files` 全部 tracked 文件建 SHA-256 内容索引（97 个），逐个 bundle 文件成员按**内容哈希**匹配。**不凭文件名猜**。

| 项 | 值 |
|---|---|
| tracked 文件索引（按 sha256）| 97 |
| ZIP 文件成员 | 333 |
| **mapped 到 tracked source** | **68** |
| **orphan（无 tracked 同内容）** | **265** |

- **68 mapped**：全部指向 `runtime/v7/engine/`，与 P0-0A 的 engine SSOT **逐一对应**（68/68）。
- **265 orphan**：无任何 tracked 文件与之内容一致。

### 265 orphan 构成

| 区域 | 数量 | 说明 |
|---|---|---|
| `runtime/v7/<其他 runtime>/` | 247 | 完整 v7 spec 树（language 28、emotion 25、expression 24、behavior 24、thought 23、decision…、engines、schemas、tests 等），**从未提升进仓库**，仓库里没有它们的源 |
| `handoff/*` | 15 | 交接文档 + 快照（DECISION_LOG、ACCEPTANCE_CRITERIA、materials_manifest.json、npm-test-output.txt、package_tree.txt、gen-materials-manifest.mjs 等）——是**打包时刻的历史快照** |
| 顶层 doc | 3 | `CLAUDE.md`、`README.md`、`START_HERE_CLAUDE.md`（bundle 版，与仓库版内容不一致）|

`runtime/v7/engine/` 下 orphan = **0**（68 engine 成员全部 mapped，印证 P0-0A SSOT 完整）。

---

## 3. 能否仅从 tracked source 确定性重建完整 bundle？

**不能。** 两条独立的否决理由：

1. **265/333 成员是 orphan**——仓库里根本没有它们的 canonical source。占 bundle 文件成员的 **80%**。其中 247 个是从未被提升的完整 spec 树，15 个 handoff 是打包时刻的历史快照（含 `npm-test-output.txt` 这类运行产物、`materials_manifest.json` 这类自描述清单）。要"从 source 重建"就得先把这 265 个反向提升进仓库并各自建确定性生成器——远超 P0-0B「legacy bundle 生命周期」范围，且部分（测试输出快照）本质不可重建。
2. **信封非确定性**——时间戳=打包当天、无 UTF-8 flag、含目录条目，与现 builder 的确定性信封不兼容；即使内容齐备也无法逐字节复现原 ZIP。

→ **A 路径（完整 repack）不成立**（A 的前提是"所有成员均有 canonical tracked source"，此处 265 个没有）。

---

## 4. 推荐：**B — 冻结为 legacy artifact**

将 root ZIP 正式标记为 **frozen legacy artifact**：

1. **记录固定身份**：engine revision + 完整 ZIP SHA-256（见下），作为冻结锚点。
2. **解除 SSOT 跟随**：CI 不再要求 bundle 内嵌 engine 与**当前** `engine.manifest.json` 同步。理由：P0-0A 的 `engine-tests` job 已让 bundle 内嵌 engine 跟随 SSOT，但既然 bundle 无法确定性重建、且 265/333 是 orphan，长期"跟随"只能靠**手工改二进制 ZIP**——正是评审要禁止的。
3. **CI 改为防篡改**：验证 bundle **自身**未被改动（钉住 `badca169…` 整包 SHA-256），而非与活动 engine 对比。
4. **迁移说明**：把"当前权威 engine archive"明确指向 P0-0A 的 `runtime/v7/engine/`（源）+ `build-engine-archive.mjs`（`dist/rain-push-v7-engine.zip`，sha `f838c617…`）。新消费者用这条，不用 legacy bundle。
5. **不删除 ZIP**：除非有证据证明无消费者依赖。当前无此证据 → 保留。

### 冻结锚点（B 实施时写入）
- 整包 SHA-256：`badca1696482dd4aef6ebe8bdc9465d6bc9f0e82609aa04e1a97bef7a542f6c9`
- git blob sha1：`b2c74c3b79055a741f40a7041ee3bca44efb526d`
- 内嵌 engine revision：与 P0-0A engine SSOT 一致（68/68，promotedFromCommit `4f168556`）
- 大小：528,131 B / 398 成员（333 文件 + 65 目录）

---

## 5. B 的取舍（诚实标注）

- **P0-0A 的 `engine-tests` 68/68 guard 会转义**：从"bundle 内嵌 engine ↔ 活动 manifest 同步"变为"整包 SHA-256 未被篡改"。P0-0A 装的 `verify-engine-bundle-parity.mjs` + 4 组测试**不浪费**——它们保护的是**权威链路**（`runtime/v7/engine/` 源 → `dist` archive），迁移后继续对权威 archive 生效；只是不再套在 legacy bundle 上。
- **代价**：bundle 内嵌 engine 与未来 engine 改动会"名义上"分叉，但这正是 frozen artifact 的定义——它是历史快照，不该跟随。

**下一步需你决策**：是否批准按 **B** 实施（另起 commit / 后续 PR）。本次仅清点 + 推荐，未实施、未开 PR。

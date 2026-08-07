#!/usr/bin/env node
// Real Stage-2 pilot pack generator (directive §Four).
//
// Reads the REAL gitignored corpus, runs the deterministic stratified sampler, and writes 7 files
// into private/pilot-50/. ALL outputs stay inside private/ (gitignored). NOTHING is committed and
// NO committed snapshot is produced.
//
// Strict content separation (directive §Three): the Round-A review pack shows ONLY presentationId
// + raw text + an empty form. Every hint (recordId, line, selection bucket, selection reason) goes
// into the SEPARATE selection-key file that the reviewer must not open during Round A.
//
// Safety: the raw corpus is opened read-only; we record its sha256 before and after and refuse to
// proceed / warn loudly if it changes.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../corpus/lib/io.mjs";
import { loadRawCorpus, resolveRawPath } from "../lib/raw-corpus.mjs";
import { stratifiedSelect, SELECTION_SEED, PRESENTATION_SEED, TARGET } from "../lib/stratified-sample.mjs";
import { COVERAGE_BUCKETS } from "../lib/heuristics.mjs";
import { makeRoundAForm, CONFIDENCE_TAGS, ROUND_A_GRADES, FAILURE_RISK_PROMPTS } from "../lib/round-a-form.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "..", "private", "pilot-50");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writePrivate(name, obj) {
  const f = join(OUT_DIR, name);
  const body = typeof obj === "string" ? obj : canonicalJson(obj) + "\n";
  writeFileSync(f, body);
  return f;
}

function main() {
  const resolved = resolveRawPath();
  if (!resolved) {
    process.stdout.write(canonicalJson({ status: "PROVENANCE_BLOCKED", reason: "raw corpus not resolvable" }) + "\n");
    process.exit(0);
  }
  const rawPath = resolved.path;
  const preHash = sha256File(rawPath);

  const loaded = loadRawCorpus();
  if (!loaded.present) {
    process.stdout.write(canonicalJson({ status: "PROVENANCE_BLOCKED" }) + "\n");
    process.exit(0);
  }

  const sel = stratifiedSelect(loaded.records, { target: TARGET, seed: SELECTION_SEED });

  mkdirSync(OUT_DIR, { recursive: true });

  // Order the selected records by presentationId for stable file layout (presentation order
  // reveals nothing — it's a separate seeded scramble).
  const byPres = sel.records.slice().sort((a, b) => a.presentationId.localeCompare(b.presentationId));

  // ---- 1. selection.private.json — full selection record WITH text + buckets (private audit) ----
  const selectionFile = {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    corpus: { path: "private/tangtang-corpus-1051.raw.txt", sha256: preHash, lines: loaded.records.length },
    selectionSeed: sel.seed,
    presentationSeed: sel.presentationSeed,
    target: sel.target,
    selectedCount: sel.selectedCount,
    coverage: sel.coverage,
    records: byPres.map((r) => ({
      presentationId: r.presentationId,
      recordHash: r.hash,
      order: r.order,
      speaker: r.speaker,
      text: r.text,
      buckets: r.buckets,
      punct: r.punct,
    })),
    selectionOrder: sel.selectionOrder, // which bucket triggered each pick (audit trail)
  };
  const pSelection = writePrivate("selection.private.json", selectionFile);

  // ---- 2. selection-key.private.json — the ANSWER KEY (presentationId ↔ line/hash/bucket) ----
  // This is what the reviewer must NOT open during Round A. No text here (text lives in round-a),
  // just the de-anonymizing mapping + the sampling hints.
  const keyFile = {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    warning: "DO NOT OPEN DURING ROUND A — this de-anonymizes presentation ids and reveals sampling buckets, which would prime annotation.",
    corpusSha256: preHash,
    selectionSeed: sel.seed,
    presentationSeed: sel.presentationSeed,
    key: byPres.map((r) => ({
      presentationId: r.presentationId,
      recordHash: r.hash,
      sourceOrder: r.order,           // line number in the raw corpus
      samplingBuckets: r.buckets,     // heuristic buckets — SAMPLING HINT ONLY, not truth
      triggeredBy: (sel.selectionOrder.find((s) => s.hash === r.hash) || {}).triggeredBy || null,
    })),
  };
  const pKey = writePrivate("selection-key.private.json", keyFile);

  // ---- 3. round-a.private.json — the REVIEW PACK (text + empty form, NO hints) ----
  const roundA = {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    round: "A",
    instructions: "为每个 presentationId 独立填写表单。只看文本，不要参考任何分档/预测。先读 review-guide.private.md。",
    confidenceTags: CONFIDENCE_TAGS,
    allowedEvidenceGrades: ROUND_A_GRADES,
    forms: byPres.map((r) => makeRoundAForm(r.presentationId, r.text)),
  };
  const pRoundA = writePrivate("round-a.private.json", roundA);

  // ---- 4. round-b.template.private.json — SAME empty forms, no Round-A content ----
  // Round B is an independent re-annotation. It must NOT carry any Round-A answers, so it is just
  // a fresh set of empty forms keyed by the same presentation ids.
  const roundB = {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    round: "B",
    instructions: "独立复标。不要看 Round A 的填写结果。规则同 Round A。",
    confidenceTags: CONFIDENCE_TAGS,
    allowedEvidenceGrades: ROUND_A_GRADES,
    forms: byPres.map((r) => makeRoundAForm(r.presentationId, r.text)),
  };
  const pRoundB = writePrivate("round-b.template.private.json", roundB);

  // ---- 5. review-guide.private.md — how to annotate (no answers) ----
  const guide = buildReviewGuide();
  const pGuide = writePrivate("review-guide.private.md", guide);

  // ---- 6. consistency.template.private.json — empty shell for AFTER both rounds ----
  const consistencyTpl = {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    status: "AWAITING_HUMAN_ROUND_A_AND_B",
    note: "两轮人工标注完成后，用 run-pilot.mjs consistency 计算；此处仅为占位，不得填入伪数据。",
    roundASource: "round-a.private.json (filled)",
    roundBSource: "round-b.template.private.json (filled)",
    gates: null,
    agreement: null,
    verdict: null,
  };
  const pConsistency = writePrivate("consistency.template.private.json", consistencyTpl);

  // ---- 7. disagreements.template.private.json — empty shell for reconciliation ----
  const disagreementsTpl = {
    formatVersion: 1,
    visibility: "PRIVATE_DO_NOT_COMMIT",
    status: "AWAITING_HUMAN_ROUND_A_AND_B",
    note: "记录两轮分歧条目与裁决。两轮完成前保持空。",
    items: [], // each: { presentationId, field, roundA, roundB, resolution, resolvedGrade }
  };
  const pDisagreements = writePrivate("disagreements.template.private.json", disagreementsTpl);

  // Re-hash the raw corpus AFTER all work to prove it was untouched.
  const postHash = sha256File(rawPath);

  // Text-free receipt to stdout.
  const receipt = {
    status: preHash === postHash ? "REAL_PILOT_PACK_READY" : "RAW_CORPUS_MUTATED",
    corpusSha256Pre: preHash,
    corpusSha256Post: postHash,
    corpusUnchanged: preHash === postHash,
    corpusLines: loaded.records.length,
    selectionSeed: sel.seed,
    presentationSeed: sel.presentationSeed,
    selectedCount: sel.selectedCount,
    uniqueRecords: new Set(byPres.map((r) => r.hash)).size,
    uniquePresentationIds: new Set(byPres.map((r) => r.presentationId)).size,
    coverage: sel.coverage,
    files: {
      selection: "private/pilot-50/selection.private.json",
      selectionKey: "private/pilot-50/selection-key.private.json",
      roundA: "private/pilot-50/round-a.private.json",
      roundBTemplate: "private/pilot-50/round-b.template.private.json",
      reviewGuide: "private/pilot-50/review-guide.private.md",
      consistencyTemplate: "private/pilot-50/consistency.template.private.json",
      disagreementsTemplate: "private/pilot-50/disagreements.template.private.json",
    },
  };
  process.stdout.write(canonicalJson(receipt) + "\n");
}

function buildReviewGuide() {
  const prompts = FAILURE_RISK_PROMPTS.map((p, i) => `${i + 1}. **${p.id}** — ${p.q}`).join("\n");
  return `# 单侧行为观察语料库 — Round A 人工标注指南（PRIVATE）

> 本文件含标注流程，不含任何答案/预判。请在打开 \`selection-key.private.json\` **之前**完成 Round A。

## 0. 核心原则

- 你只看到 \`presentationId\` + 一句**糖糖单侧发言**。**没有对方的话轮**，这是设计使然，不是缺陷。
- 缺失的对方话轮**不是障碍**：无法判断的就标 \`unknown\` / 低置信度，不要脑补。
- **只记录可观察的东西**（L1）与**可支撑的推断**（L2/L3），把心理臆测降级为"候选 + 置信度"。
- 严禁参考任何分档（bucket）、模型预测、假设（H1-H7）——这些在 Round A 阶段一律不可见。

## 1. 四层怎么填

**L1 Observable（只写看得见的）**
- \`observableActs\`：这句话字面上"做了什么"（发问/命令/抱怨/示弱/调侃…用你自己的话）。
- \`grammaticalForm\` / \`target\`：语法形态、指向谁（伴侣/自己/观众/第三方/未知）。
- 布尔项（\`explicitRequest\` 等）：明确才填 true/false，不确定留 null。
- \`personaSurfaceCandidate\`：**只记表面线索**（像公开表演？像私下？），不是下结论。
- \`punctuationRhythmNotes\`：标点/节奏观察（省略号多、感叹密集、平铺…）。

**L2 Interaction Function（想达成什么）**
- \`function\` + \`confidence\`（${CONFIDENCE_TAGS.join(" / ")}）。
- \`textualEvidence\`：指出是哪几个字支撑你的判断。
- \`alternatives\`：还有哪些同样成立的功能解释。
- \`contextDependency\`：这个判断多大程度依赖缺失的上下文。

**L3 Latent Need Candidate（最多 3 个，永远是"候选"）**
每个候选：\`candidate\` / \`confidence\` / \`evidence\` / \`alternativeExplanation\` / \`whatWouldChangeMyMind\`。
- \`whatWouldChangeMyMind\` 必须填——想不出反证，说明你把臆测当成了事实。

**Affect（四维，各自带置信度标签）**
- \`primarySurface\` / \`opposingAffect\` / \`maskedAffect\` / \`leakedAffect\`。
- 每维 value + confidence（${CONFIDENCE_TAGS.join(" / ")}）。不确定就 \`unknown\`。

## 2. Expected Reply（功能层，不还原对方原话）
- \`literalRequest\`：字面是否在请求某个具体回应。
- \`functionalExpectedReplyClasses\` / \`likelyUnsatisfyingReplyClasses\`：期待/会让她失望的回应类型。
- \`replyInferenceConfidence\` + \`contextRequired\`。

## 3. Evidence Grade（单条只允许 E0 / E1 / E2）
- **E0** 无法判断（unknowable）
- **E1** 可观察行为（observable act）
- **E2** 有支撑的功能推断（supported function）
- **禁止**在单条写 E3/E4——那是跨语料的规律，需多条 + 人工复核后才产生，不在 Round A。

## 4. failureRiskNotes（每条必过的自我证伪清单）
${prompts}

对每条都想一遍：如果我错了，会错在哪里？把它写进对应 \`note\`。

## 5. 流程
1. 读完本指南。
2. 打开 \`round-a.private.json\`，按 \`presentationId\` 顺序逐条填 \`forms[]\`。
3. **不要**打开 \`selection-key.private.json\`（那是答案键，会污染判断）。
4. 全部填完后另存，再独立做 Round B（\`round-b.template.private.json\`），期间不看 Round A。
5. 两轮都完成后，才用 \`run-pilot.mjs consistency\` 算一致性——在此之前不产生任何一致性数字。

## 6. 从第一条开始
打开 \`round-a.private.json\` → 定位 \`forms[0]\`（presentationId \`PA-001\`）→ 读 \`text\` → 依次填 L1→L2→L3→Affect→ExpectedReply→EvidenceGrade→failureRiskNotes。
`;
}

main();

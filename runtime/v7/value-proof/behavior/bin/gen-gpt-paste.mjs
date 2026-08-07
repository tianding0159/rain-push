#!/usr/bin/env node
// Render a copy-paste Round-A pack for the GPT web UI (delivery mode A).
//
// Reads the private round-a pack, wraps it with the SHARED system prompt (gpt-prompt.mjs), and
// writes a single markdown file you paste into a GPT conversation. Verbatim text stays in private/
// — this file is gitignored (private/) and never committed.
//
// Usage: node bin/gen-gpt-paste.mjs [--batch N]
//   --batch N : split the 50 records into pastes of N each (default 50 = one paste).

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRawPath } from "../lib/raw-corpus.mjs";
import { systemPrompt, GPT_OUTPUT_SHAPE } from "../lib/gpt-prompt.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "..", "private", "pilot-50");

function main() {
  const argv = process.argv.slice(2);
  let batch = 50;
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--batch") batch = Number(argv[i + 1]);

  const rawPath = resolveRawPath()?.path;
  const preHash = rawPath ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  const roundA = JSON.parse(readFileSync(join(DIR, "round-a.private.json"), "utf8"));
  const forms = roundA.forms;

  const chunks = [];
  for (let i = 0; i < forms.length; i += batch) chunks.push(forms.slice(i, i + batch));

  const parts = [];
  parts.push("# Round-A GPT 标注包（PRIVATE — 勿提交/勿公开）\n");
  parts.push("> 用法：把下面 **System 指令** 粘到 GPT 对话开头（或设为 system），再逐批粘 **待标注条目**。GPT 逐条返回严格 JSON，你收集后存回 `private/pilot-50/round-a.gpt.json`。\n");
  parts.push("> 注意：这些是逐字版权语料，只在你↔GPT 的会话里流转，不要贴到任何公开位置。\n");
  parts.push("\n---\n\n## System 指令（粘一次）\n\n```\n" + systemPrompt() + "\n```\n");
  parts.push("\n## 输出 JSON shape（供参考，System 里已含）\n\n```json\n" + JSON.stringify(GPT_OUTPUT_SHAPE, null, 2) + "\n```\n");

  chunks.forEach((chunk, ci) => {
    parts.push(`\n---\n\n## 待标注条目 — 批次 ${ci + 1}/${chunks.length}（${chunk.length} 条）\n`);
    parts.push("对以下每条返回一个 JSON 对象，合并成一个 JSON 数组返回：\n");
    for (const f of chunk) {
      parts.push(`\n### ${f.presentationId}\n\n> 糖糖发言：「${f.text}」\n`);
    }
  });

  parts.push("\n---\n\n## 收集结果\n\n把 GPT 返回的所有 JSON 合并为一个数组，存成 `private/pilot-50/round-a.gpt.json`（gitignored）。之后可与人工 Round-B 或第二次 GPT 运行做一致性对比。\n");

  mkdirSync(DIR, { recursive: true });
  const out = join(DIR, "round-a-paste.private.md");
  writeFileSync(out, parts.join(""));

  const postHash = rawPath ? createHash("sha256").update(readFileSync(rawPath)).digest("hex") : null;

  process.stdout.write(JSON.stringify({
    status: "GPT_PASTE_PACK_READY",
    file: "private/pilot-50/round-a-paste.private.md",
    records: forms.length,
    batches: chunks.length,
    batchSize: batch,
    rawHashUnchanged: preHash === postHash,
  }, null, 2) + "\n");
}

main();

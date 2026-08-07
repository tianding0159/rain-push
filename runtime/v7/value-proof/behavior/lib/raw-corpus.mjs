// Single-sided behavioral-evidence raw-corpus loader.
//
// The raw corpus is 1051 lines of ONE speaker's (糖糖) verbatim utterances, formatted
//   "N. speaker:「text」"
// It is NEVER committed. This module resolves it at runtime and parses it into records that
// carry a stable per-record hash. Verbatim text is confined to `.text` on each record and
// must never leave this process except through redactedRecord(), which drops text and keeps
// only order / hash / length / punctuation-shape / speaker.
//
// Resolution order (mirrors private-corpus.mjs so operators learn one convention):
//   1. explicit path argument (tests),
//   2. RAIN_PUSH_SINGLE_SIDED_CORPUS env var (absolute or cwd-relative),
//   3. gitignored default runtime/v7/value-proof/private/tangtang-corpus-1051.raw.txt.
// If none resolves → { present:false, status:"PROVENANCE_BLOCKED" }; callers must not fabricate.
//
// Zero runtime dependencies beyond node builtins. Deterministic given a fixed file.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RAW_DEFAULT = join(HERE, "..", "..", "private", "tangtang-corpus-1051.raw.txt");
// HERE = behavior/lib → ../../ = value-proof → private/ (gitignored).

export const RAW_STATUS = Object.freeze({
  LOADED: "SINGLE_SIDED_CORPUS_LOADED",
  BLOCKED: "PROVENANCE_BLOCKED",
});

// "N. speaker:「text」" with tolerant separators and quote glyphs.
const LINE_RE = /^\s*(\d+)[.\u3001)]\s*([^:：「『"]+)[:：]\s*[「『"](.+)[」』"]\s*$/;

export function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

export function resolveRawPath({ path, env = process.env } = {}) {
  if (path) return { path, origin: "argument" };
  const fromEnv = env.RAIN_PUSH_SINGLE_SIDED_CORPUS;
  if (fromEnv && fromEnv.trim()) {
    const p = fromEnv.trim();
    return { path: isAbsolute(p) ? p : join(process.cwd(), p), origin: "env:RAIN_PUSH_SINGLE_SIDED_CORPUS" };
  }
  if (existsSync(RAW_DEFAULT)) return { path: RAW_DEFAULT, origin: "default" };
  return null;
}

// Punctuation shape — a text-free fingerprint safe to log.
export function punctShape(text) {
  const s = String(text);
  return {
    len: s.length,
    excl: (s.match(/[!！]/g) || []).length,
    ques: (s.match(/[?？]/g) || []).length,
    ellipsis: (s.match(/\.\.\.|…/g) || []).length,
    comma: (s.match(/[,，、]/g) || []).length,
    period: (s.match(/[。.]/g) || []).length,
    hasTilde: /[~～]/.test(s),
  };
}

// Parse one line → record or null. text is retained; callers redact before logging.
export function parseLine(line, fallbackOrder) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const order = Number(m[1]);
  const speaker = m[2].trim();
  const text = m[3];
  return {
    order: Number.isFinite(order) ? order : fallbackOrder,
    speaker,
    text,
    hash: sha256(`${speaker}\u241f${text}`),
    punct: punctShape(text),
  };
}

// Load + parse. Never throws on "absent" (that is BLOCKED). Throws only on a present-but-
// unparseable file, which is a real error the operator must fix.
export function loadRawCorpus(opts = {}) {
  const resolved = resolveRawPath(opts);
  if (!resolved) return { present: false, status: RAW_STATUS.BLOCKED, records: [] };
  const text = readFileSync(resolved.path, "utf8");
  const rawLines = text.split(/\r?\n/);
  const records = [];
  const unparsed = [];
  rawLines.forEach((line, i) => {
    if (!line.trim()) return;
    const rec = parseLine(line, records.length + 1);
    if (rec) records.push(rec);
    else unparsed.push(i + 1);
  });
  return {
    present: true,
    status: RAW_STATUS.LOADED,
    path: resolved.path,
    origin: resolved.origin,
    records,
    unparsedLineNumbers: unparsed,
    fileSha256: sha256(text),
  };
}

// Text-free projection of a record — the ONLY shape allowed into logs/reports/git.
export function redactedRecord(rec) {
  return { order: rec.order, speaker: rec.speaker, hash: rec.hash, punct: rec.punct };
}

export function redactedBatch(records) {
  return records.map(redactedRecord);
}

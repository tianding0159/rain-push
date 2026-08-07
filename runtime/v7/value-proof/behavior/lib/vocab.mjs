// Accessor for the behavior vocabulary SSOT (behavior-vocab.json).
//
// mini-schema's enumFrom resolves against a "policy" object: a top-level key whose value is an
// array becomes the allowed set. Our vocab sections are top-level arrays, so the parsed vocab
// IS the policy object passed to validate(). This module is the single place that reads the
// file, so no other module hardcodes the vocabulary.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../corpus/lib/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const VOCAB_PATH = join(HERE, "..", "policy", "behavior-vocab.json");
export const SUPPORTED_VOCAB_FORMAT_VERSION = 1;

let cached = null;

export function loadVocab({ path = VOCAB_PATH, fresh = false } = {}) {
  if (cached && !fresh && path === VOCAB_PATH) return cached;
  const v = readJson(path);
  if (v.policyFormatVersion !== SUPPORTED_VOCAB_FORMAT_VERSION) {
    throw new Error(`behavior-vocab: unsupported policyFormatVersion ${v.policyFormatVersion}`);
  }
  if (path === VOCAB_PATH) cached = v;
  return v;
}

// Convenience predicates — every consumer goes through these, never through a literal list.
export function has(section, value, vocab = loadVocab()) {
  const list = vocab[section];
  if (!Array.isArray(list)) throw new Error(`behavior-vocab: unknown section ${JSON.stringify(section)}`);
  return list.includes(value);
}

export function list(section, vocab = loadVocab()) {
  const l = vocab[section];
  if (!Array.isArray(l)) throw new Error(`behavior-vocab: unknown section ${JSON.stringify(section)}`);
  return l.slice();
}

// A proposed label is NOT yet valid — it must be promoted first. Used by the extension-proposal
// gate so model/human suggestions cannot silently become schema-valid.
export function isProposedOnly(section, value, vocab = loadVocab()) {
  const proposals = vocab.extensionProposals || {};
  const staged = Array.isArray(proposals[section]) ? proposals[section] : [];
  return staged.includes(value) && !has(section, value, vocab);
}

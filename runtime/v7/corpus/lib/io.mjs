// Shared deterministic IO for corpus tools.
//
// Centralizes: reading JSON with stable error codes, canonical (sorted-key) JSON
// serialization so every tool writes byte-identical output, and loading the four schemas.
// Deterministic serialization is the backbone of the "byte-identical re-run" guarantee the
// migration and export tools must uphold.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, "..", "schemas");

export const IO_ERROR_CODES = Object.freeze({
  UNREADABLE: "ERR_IO_UNREADABLE",
  MALFORMED_JSON: "ERR_IO_MALFORMED_JSON",
});

export class IoError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "IoError";
    this.code = code;
  }
}

export function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new IoError(IO_ERROR_CODES.UNREADABLE, `${path} (${err.code || err.message})`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new IoError(IO_ERROR_CODES.MALFORMED_JSON, `${path}: ${err.message}`);
  }
}

// Canonical JSON: object keys sorted recursively, arrays preserved (order is semantic in
// corpora — message order, source order). Produces deterministic bytes for hashing and for
// clean-working-tree assertions. Trailing newline for POSIX-friendly files.
export function canonicalJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

export function writeCanonicalJson(path, value) {
  writeFileSync(path, canonicalJson(value));
}

export function loadSchemas() {
  return {
    registry: readJson(join(SCHEMA_DIR, "source-registry.schema.json")),
    event: readJson(join(SCHEMA_DIR, "private-corpus-event.schema.json")),
    public: readJson(join(SCHEMA_DIR, "public-derived-event.schema.json")),
    retrieval: readJson(join(SCHEMA_DIR, "retrieval-evidence-reference.schema.json")),
  };
}

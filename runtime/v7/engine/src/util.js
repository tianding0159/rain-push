import crypto from "node:crypto";

export function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashValue(value, length = 24) {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
    .slice(0, length);
}

export function deepClone(value) {
  return structuredClone(value);
}

export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsAny(text, patterns) {
  const normalized = normalizeText(text).toLowerCase();
  return patterns.some((pattern) => normalized.includes(String(pattern).toLowerCase()));
}

export function getPath(object, path, fallback = undefined) {
  const parts = String(path).split(".").filter(Boolean);
  let cursor = object;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== "object" || !(part in cursor)) {
      return fallback;
    }
    cursor = cursor[part];
  }
  return cursor;
}

export function setPath(object, path, value) {
  const parts = String(path).split(".").filter(Boolean);
  if (!parts.length) throw new Error("Path must not be empty");
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
  return object;
}

export function incrementPath(object, path, delta = 1) {
  const current = Number(getPath(object, path, 0));
  setPath(object, path, current + delta);
  return object;
}

export function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

export function lexicalBand(value) {
  const n = clamp(value);
  if (n < 0.25) return "low";
  if (n < 0.6) return "moderate";
  if (n < 0.85) return "high";
  return "severe";
}

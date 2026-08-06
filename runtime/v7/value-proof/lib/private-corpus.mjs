// Private-corpus loader for the value-proof pilot.
//
// The real annotated corpus (糖糖's private dialogue) is NEVER committed. This loader resolves
// it at runtime, in priority order:
//   1. an explicit path argument (tests),
//   2. the RAIN_PUSH_PRIVATE_CORPUS environment variable (absolute path),
//   3. a gitignored default under runtime/v7/value-proof/private/events.private.json.
// If none resolves, it returns { present:false, status:"READY_FOR_PRIVATE_CORPUS" } — the
// harness then runs on SYNTHETIC fixtures only and must NOT claim real validation.
//
// It validates loaded events against the committed P0-A corpus schemas (reused, not forked),
// joins the private character-signal sidecar by eventId, and returns a structure whose
// verbatim text is confined to `.messages[].text`. Everything the harness logs or snapshots
// must go through redactedView(), which strips text and keeps only ids / hashes / lengths /
// annotation — so private text never lands in a log, report, or replay artifact.
//
// Zero runtime dependencies. Deterministic except for the env/filesystem resolution, which is
// explicit and reported.

import { existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { readJson, loadSchemas } from "../../corpus/lib/io.mjs";
import { loadPolicy } from "../../corpus/lib/source-policy.mjs";
import { validate } from "../../corpus/lib/mini-schema.mjs";
import { parseSignalBatch } from "./character-signal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PRIVATE_DEFAULT_DIR = join(HERE, "..", "private");
export const PRIVATE_DEFAULT_EVENTS = join(PRIVATE_DEFAULT_DIR, "events.private.json");
export const PRIVATE_DEFAULT_SIGNALS = join(PRIVATE_DEFAULT_DIR, "signals.private.json");

export const CORPUS_STATUS = Object.freeze({
  LOADED: "PRIVATE_CORPUS_LOADED",
  READY: "READY_FOR_PRIVATE_CORPUS",
});

// Resolve the events path without reading it. Returns { path, origin } or null.
export function resolvePrivateEventsPath({ path, env = process.env } = {}) {
  if (path) return { path, origin: "argument" };
  const fromEnv = env.RAIN_PUSH_PRIVATE_CORPUS;
  if (fromEnv && fromEnv.trim()) {
    const p = fromEnv.trim();
    return { path: isAbsolute(p) ? p : join(process.cwd(), p), origin: "env:RAIN_PUSH_PRIVATE_CORPUS" };
  }
  if (existsSync(PRIVATE_DEFAULT_EVENTS)) return { path: PRIVATE_DEFAULT_EVENTS, origin: "default" };
  return null;
}

function asArray(loaded, key) {
  if (Array.isArray(loaded)) return loaded;
  if (loaded && Array.isArray(loaded[key])) return loaded[key];
  return null;
}

// Load + validate. Never throws on "not present" — that is the READY state. Throws only on a
// present-but-malformed corpus (a real error the operator must fix).
export function loadPrivateCorpus(opts = {}) {
  const policy = opts.policy || loadPolicy();
  const schemas = opts.schemas || loadSchemas();
  const resolved = resolvePrivateEventsPath(opts);

  if (!resolved) {
    return {
      present: false,
      status: CORPUS_STATUS.READY,
      origin: null,
      events: [],
      signalsByEvent: {},
      problems: [],
    };
  }

  const rawEvents = readJson(resolved.path);
  const events = asArray(rawEvents, "events");
  if (!events) {
    return {
      present: true,
      status: CORPUS_STATUS.LOADED,
      origin: resolved.origin,
      events: [],
      signalsByEvent: {},
      problems: [{ code: "PRIV_EVENTS_NOT_ARRAY", detail: resolved.path }],
    };
  }

  const problems = [];
  events.forEach((ev, i) => {
    const { valid, errors } = validate(schemas.event, ev, policy);
    if (!valid) problems.push({ code: "PRIV_EVENT_SCHEMA", index: i, detail: errors.map((e) => e.code).join(",") });
  });

  // Optional signal sidecar, resolved next to the events by default or via arg/env override.
  let signalsByEvent = {};
  const signalsPath = opts.signalsPath
    || (resolved.origin === "default" && existsSync(PRIVATE_DEFAULT_SIGNALS) ? PRIVATE_DEFAULT_SIGNALS : null)
    || (process.env.RAIN_PUSH_PRIVATE_SIGNALS && process.env.RAIN_PUSH_PRIVATE_SIGNALS.trim())
    || null;
  if (signalsPath && existsSync(signalsPath)) {
    const rawSignals = readJson(signalsPath);
    const signals = asArray(rawSignals, "signals") || [];
    const batch = parseSignalBatch(signals);
    for (const p of batch.problems) problems.push({ code: `PRIV_SIGNAL_${p.code}`, index: p.index, detail: p.detail });
    for (const { record, result } of batch.records) {
      if (result.valid) {
        (signalsByEvent[record.eventId] ||= []).push(record);
      }
    }
  }

  return {
    present: true,
    status: CORPUS_STATUS.LOADED,
    origin: resolved.origin,
    events,
    signalsByEvent,
    problems,
  };
}

// A view safe to log / snapshot / put in a replay artifact: NO verbatim text. Keeps ids,
// per-message role/order/length/hash, and the joined signal annotation (which is itself
// text-free — names + weights + roles). This is the ONLY shape the harness is allowed to
// persist for a private record.
export function redactedView(loaded) {
  return {
    status: loaded.status,
    present: loaded.present,
    origin: loaded.origin,
    eventCount: loaded.events.length,
    events: loaded.events.map((ev) => ({
      id: ev.id,
      sourceId: ev.sourceId,
      channel: ev.channel,
      mode: ev.mode,
      routeSeverity: ev.routeSeverity,
      messageCount: Array.isArray(ev.messages) ? ev.messages.length : 0,
      messages: (ev.messages || []).map((m) => ({
        order: m.order,
        role: m.role,
        lengthChars: typeof m.text === "string" ? m.text.length : 0,
        sha256: typeof m.text === "string" ? sha256(m.text) : null,
      })),
      signals: (loaded.signalsByEvent[ev.id] || []).map((s) => ({
        targetMessageOrder: s.targetMessageOrder,
        needBlend: s.needBlend,
        affectBlend: s.affectBlend,
      })),
    })),
    problems: loaded.problems,
  };
}

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

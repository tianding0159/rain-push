// Regenerates parity/actual-packet-fields.json from REAL engine execution.
//
// This is the ground truth for schema-field-map.json: the union of every field the engine
// actually emits in packet.data, captured by running all scenario fixtures plus a few extra
// path-specific events. Never hand-edit the JSON — run: node tests/gen-actual-fields.mjs
import { RuntimeOrchestrator, MemoryStateStore, RUNTIME_ORDER } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, "..");

const fixtures = JSON.parse(
  fs.readFileSync(path.join(here, "scenario-fixtures.json"), "utf8")
);

// Extra events to exercise paths some fixtures may not cover.
const extra = [
  { eventId: "x-dark", mode: "living", channel: "jine_private", actor: "character", text: "人生又卡bug了", context: { scenario: "dark_humor" }, seed: "s", timestamp: "2026-08-06T13:00:00+08:00" },
  { eventId: "x-sex", mode: "living", channel: "jine_private", actor: "character", text: "黄段子", context: { scenario: "sexual_joke" }, seed: "s", timestamp: "2026-08-06T13:00:00+08:00" },
  { eventId: "x-drug", mode: "living", channel: "jine_private", actor: "character", text: "药物梗", context: { scenario: "drug_reference" }, seed: "s", timestamp: "2026-08-06T13:00:00+08:00" },
  { eventId: "x-priv", mode: "living", channel: "public_post", actor: "audience", text: "住址", context: { scenario: "privacy_risk", privacyRisk: "critical", exactLocation: "L", realName: "N" }, seed: "s", timestamp: "2026-08-06T13:00:00+08:00" },
  { eventId: "x-mil", mode: "living", channel: "live_stream", actor: "system", text: "", context: { scenario: "million_followers", milestone: "million_followers", followers: 1000000 }, seed: "s", timestamp: "2026-08-06T13:00:00+08:00" }
];

export function collectActualFields() {
  const events = [...fixtures.map((f) => f.event), ...extra];
  const union = {};
  const versions = {};
  for (const k of RUNTIME_ORDER) union[k] = new Set();

  let ok = 0;
  let fail = 0;
  for (const ev of events) {
    try {
      const r = new RuntimeOrchestrator({ store: new MemoryStateStore() }).run(ev);
      for (const k of RUNTIME_ORDER) {
        versions[k] = r.packets[k].runtimeVersion;
        for (const f of Object.keys(r.packets[k].data)) union[k].add(f);
      }
      ok++;
    } catch {
      fail++;
    }
  }

  const packets = {};
  for (const k of RUNTIME_ORDER) {
    packets[k] = { runtimeVersion: versions[k], actualFields: [...union[k]].sort() };
  }
  return { events: events.length, ok, fail, packets };
}

function main() {
  const { events, ok, fail, packets } = collectActualFields();
  const doc = {
    meta: {
      artifact: "actual-packet-fields",
      purpose:
        "Field union captured from real engine execution across all scenario fixtures. Ground truth for schema-field-map.json — never hand-edit; regenerate with tests/gen-actual-fields.mjs.",
      generator: "tests/gen-actual-fields.mjs",
      fixturesRun: events,
      fixturesOk: ok,
      fixturesFail: fail
    },
    packets
  };
  const outPath = path.join(engineRoot, "parity", "actual-packet-fields.json");
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`wrote ${outPath} (events=${events} ok=${ok} fail=${fail})`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

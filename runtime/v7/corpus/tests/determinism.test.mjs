// Golden-file determinism guards. The migration and export tools must reproduce the
// committed expected artifacts byte-for-byte. If a tool's output drifts (formatting, key
// order, a semantic change), these fail and name which artifact — and CI's clean-working-
// tree assertion catches any tool that writes into the tree as a side effect.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateCorpus } from "../lib/migrate.mjs";
import { exportCorpus } from "../lib/export-public.mjs";
import { canonicalJson, readJson } from "../lib/io.mjs";
import { loadPolicy } from "../lib/source-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const EXP = join(FIX, "expected");
const policy = loadPolicy();

function golden(name) { return readFileSync(join(EXP, name), "utf8"); }

test("migration reproduces the committed registry byte-for-byte", () => {
  const { registry } = migrateCorpus(readJson(join(FIX, "corpus.v0_1.json")));
  assert.equal(canonicalJson(registry), golden("migrated-registry.json"));
});

test("migration reproduces the committed events byte-for-byte", () => {
  const { events } = migrateCorpus(readJson(join(FIX, "corpus.v0_1.json")));
  assert.equal(canonicalJson(events), golden("migrated-events.json"));
});

test("export reproduces the committed public projection byte-for-byte", () => {
  const registry = readJson(join(FIX, "registry.valid.json"));
  const events = readJson(join(FIX, "events.valid.json"));
  const { events: pub } = exportCorpus({ events, registry, policy });
  assert.equal(canonicalJson(pub), golden("public-export.json"));
});

test("the committed public projection contains no synthetic verbatim markers", () => {
  // Defence in depth: the golden public file itself must never carry private text.
  assert.ok(!golden("public-export.json").includes("SYN-"));
});

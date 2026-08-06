// Deterministic builder for runtime-contract-map.json.
// outputFields are pulled verbatim from actual-packet-fields.json (ground truth).
// Each contract carries a status:
//   enforced           - a runtime validator rejects a violation at run time
//                        (validatePipeline / validatePacketShape / validateEvent /
//                        validateUpdate / ReplayEngine.verify).
//   constructed        - invariant holds because the runtime always builds the
//                        packet that way; no independent validator re-checks it.
//   tested_only        - a contract test locks the behavior, but a forged
//                        violation would NOT be rejected by any runtime validator.
//   specification_only - spec requirement with no engine enforcement and no test.
// Rebuild: node parity/build-runtime-contract-map.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const actual = JSON.parse(
  readFileSync(join(here, "actual-packet-fields.json"), "utf8"),
);
const of = (rt) => actual.packets[rt].actualFields;

const RUNTIME_ORDER = [
  "knowledge",
  "continuity",
  "relationship",
  "meaning",
  "emotion",
  "need",
  "thought",
  "decision",
  "behavior",
  "expression",
  "language",
];

// Per-runtime contract list. Each contract: {req, statement, status, evidence}.
// status is grounded in src/validators.js, src/packet.js, src/update-queue.js,
// src/replay/replay.js and tests/parity-contract.test.js (verified during audit).
const runtimeSpec = {
  knowledge: {
    entry: "src/runtimes/knowledge.js#runKnowledge",
    inputs: ["event", "state", "signals"],
    contracts: [
      {
        req: "R-EVID-01",
        statement:
          "Knowledge packet stays evidence-scoped; no relationship/emotion/action conclusions.",
        status: "constructed",
        evidence:
          "runKnowledge only emits facts/signals/scenario; no validator scans for leakage.",
      },
    ],
  },
  continuity: {
    entry: "src/runtimes/continuity.js#runContinuity",
    inputs: ["knowledge", "state.history"],
    contracts: [
      {
        req: "R-PKT-01",
        statement: "Emits pendingThreads/callbacks without passing the whole model downstream.",
        status: "constructed",
        evidence:
          "runContinuity selects fields into data; shape is checked by validatePacketShape (R-PKT-01) but the no-whole-model rule itself is by-construction.",
      },
    ],
  },
  relationship: {
    entry: "src/runtimes/relationship.js#runRelationship",
    inputs: ["knowledge", "continuity"],
    contracts: [
      {
        req: "R-FACT-01",
        statement: "Interpretations are kept distinct from facts.",
        status: "tested_only",
        evidence:
          "parity-contract R-FACT-01 locks the meaning/decision surface; no dedicated validator on the relationship packet.",
      },
      {
        req: "R-ESC-01",
        statement: "Severity stays local and evidence-bounded.",
        status: "tested_only",
        evidence:
          "parity-contract R-ESC-01 exercises the ordinary-event path; validator = none dedicated general gate.",
      },
      {
        req: "R-NAME-01",
        statement: "Partner naming is 豆豆.",
        status: "tested_only",
        evidence:
          "parity-contract R-NAME-01 asserts on rendered output; no validator enforces naming inside the relationship packet.",
      },
    ],
  },
  meaning: {
    entry: "src/runtimes/meaning.js#runMeaning",
    inputs: ["knowledge", "continuity", "relationship"],
    contracts: [
      {
        req: "R-FACT-01",
        statement: "Possible meanings are separated from facts.",
        status: "tested_only",
        evidence:
          "parity-contract R-FACT-01 locks the generic-feedback path; validator = none dedicated.",
      },
    ],
  },
  emotion: {
    entry: "src/runtimes/emotion.js#runEmotion",
    inputs: ["meaning", "relationship"],
    contracts: [
      {
        req: "R-PKT-02",
        statement:
          "Packet purity: no need/goal/action/decision/text fields in the emotion packet.",
        status: "constructed",
        evidence:
          "runEmotion only emits emotion fields; spec asks for an active purity scan that does not exist (validator = none dedicated).",
      },
      {
        req: "R-ESC-01",
        statement: "Ordinary events do not escalate emotionally.",
        status: "tested_only",
        evidence:
          "parity-contract R-ESC-01 (pudding omission) locks it; validator = none dedicated general gate.",
      },
      {
        req: "R-DUAL-01",
        statement: "Ame/KAngel share one emotional substrate (ameKangelSharedState).",
        status: "tested_only",
        evidence:
          "parity-contract R-DUAL-01 asserts the shared-substrate surface; validator = none dedicated.",
      },
      {
        req: "R-DARK-01",
        statement:
          "Dark/sexual content is not auto-escalated into crisis or intimacy.",
        status: "tested_only",
        substatus: "bidirectional-gate-missing",
        evidence:
          "parity-contract R-DARK-01 covers the no-over-escalation direction only; there is NO gate for the under-block direction (e.g. drug reference not explicitly blocked). See high-risk-gaps.md.",
      },
    ],
  },
  need: {
    entry: "src/runtimes/need.js#runNeed",
    inputs: ["emotion", "meaning"],
    contracts: [
      {
        req: "R-ORD-01",
        statement: "Ordinary-life needs are first-class and distinct from emotions/satisfiers.",
        status: "tested_only",
        evidence:
          "scenario fixtures exercise ordinary needs; validator = none dedicated.",
      },
    ],
  },
  thought: {
    entry: "src/runtimes/thought.js#runThought",
    inputs: ["meaning", "emotion", "need"],
    contracts: [
      {
        req: "R-SCHEMA-01",
        statement:
          "Separates observation/question/hypothesis/rebuttal into distinct fields.",
        status: "constructed",
        evidence:
          "runThought emits the distinct fields; validatePacketShape checks presence only (partial, shape).",
      },
    ],
  },
  decision: {
    entry: "src/runtimes/decision.js#runDecision",
    inputs: ["need", "thought"],
    contracts: [
      {
        req: "R-FACT-01",
        statement:
          "Blocks relationship_rupture on ordinary/generic events; selects strategy families, not wording.",
        status: "tested_only",
        evidence:
          "parity-contract R-FACT-01 locks the block; validator = none dedicated.",
      },
      {
        req: "R-PKT-02",
        statement: "No final wording in the decision packet.",
        status: "constructed",
        evidence:
          "runDecision emits strategy families only; no text field is constructed.",
      },
    ],
  },
  behavior: {
    entry: "src/runtimes/behavior.js#runBehavior",
    inputs: ["decision"],
    contracts: [
      {
        req: "R-EXEC-03",
        statement: "External action requests stay not_executed.",
        status: "enforced",
        evidence:
          "validatePipeline + ExecutionBoundary reject any executed status; parity-contract R-EXEC-03 forges a violation.",
      },
      {
        req: "R-BUDGET-01",
        statement: "A message/action budget is defined (messageOrActionCount).",
        status: "enforced",
        evidence:
          "validatePipeline rejects language.messageUnits > behavior.messageOrActionCount (language_message_budget_exceeded).",
      },
      {
        req: "R-SURF-01",
        statement: "No-surface action types (wait/no_action/observe) exist.",
        status: "enforced",
        evidence:
          "validatePipeline rejects rendered text under a no-surface actionType (no_surface_behavior_rendered_text).",
      },
      {
        req: "R-PKT-02",
        statement: "No final wording in the behavior packet.",
        status: "constructed",
        evidence: "runBehavior emits no text field.",
      },
    ],
  },
  expression: {
    entry: "src/runtimes/expression.js#runExpression",
    inputs: ["behavior", "emotion"],
    contracts: [
      {
        req: "R-SURF-01",
        statement: "no_surface -> no active rhetorical acts.",
        status: "enforced",
        evidence:
          "validatePipeline rejects no_surface primarySurface with rendered text (no_surface_has_rendered_text).",
      },
      {
        req: "R-PRIV-02",
        statement:
          "Public channel forces low disclosure and blocks private relationship detail.",
        status: "tested_only",
        evidence:
          "expression build-time logic sets disclosure; parity-contract R-PRIV-02 locks it; no validatePipeline rule re-checks disclosure level.",
      },
      {
        req: "R-PKT-02",
        statement: "No final text/emoji in the expression packet.",
        status: "constructed",
        evidence: "runExpression emits plan fields, no rendered text.",
      },
    ],
  },
  language: {
    entry: "src/runtimes/language.js#runLanguage",
    inputs: ["expression", "behavior", "decision"],
    contracts: [
      {
        req: "R-EXEC-01",
        statement: "executionStatus stays not_executed.",
        status: "enforced",
        evidence:
          "validatePipeline rejects any other value (language_execution_boundary_violation); parity-contract R-EXEC-01 forges a claim.",
      },
      {
        req: "R-SURF-01",
        statement: "no_surface -> renderStatus no_output.",
        status: "enforced",
        evidence:
          "validatePipeline enforces the no-surface->no_output relation.",
      },
      {
        req: "R-BUDGET-01",
        statement: "messageUnits <= behavior.messageOrActionCount.",
        status: "enforced",
        evidence: "validatePipeline budget check.",
      },
      {
        req: "R-PRIV-01",
        statement: "Private referents are redacted on public channels.",
        status: "tested_only",
        evidence:
          "expression-driven redactions applied at render; parity-contract R-PRIV-01 locks it; no general leak scanner in validatePipeline.",
      },
      {
        req: "R-NAME-01",
        statement: "Rendered output uses 豆豆, never 阿P.",
        status: "tested_only",
        evidence:
          "parity-contract R-NAME-01 asserts on renderedText; no validator scans rendered text for banned names.",
      },
      {
        req: "R-FACT-01",
        statement: "No hypothesis-as-fact / global accusation in rendered text.",
        status: "tested_only",
        evidence:
          "parity-contract R-FACT-01 locks it; validator = none dedicated.",
      },
    ],
  },
};

const runtimes = RUNTIME_ORDER.map((rt) => {
  const s = runtimeSpec[rt];
  return {
    kind: rt,
    entry: s.entry,
    inputs: s.inputs,
    runtimeVersion: actual.packets[rt].runtimeVersion,
    outputFields: of(rt),
    contracts: s.contracts,
  };
});

const out = {
  meta: {
    artifact: "runtime-contract-map",
    purpose:
      "Map each runtime stage to its entry function, inputs, real output fields (packet.data), and the contracts it participates in — each contract tagged with an enforcement status.",
    pipelineOrder: RUNTIME_ORDER,
    contractStatus: {
      enforced:
        "A runtime validator rejects a violation at run time (validatePipeline / validatePacketShape / validateEvent / validateUpdate / ReplayEngine.verify).",
      constructed:
        "Invariant holds because the runtime always builds the packet that way; no independent validator re-checks it.",
      tested_only:
        "A contract test locks the behavior, but a forged violation would not be rejected by any runtime validator.",
      specification_only:
        "Spec requirement with no engine enforcement and no test.",
    },
    generator: "parity/build-runtime-contract-map.mjs",
    outputFieldsSource:
      "actual-packet-fields.json (ground truth; regenerate via tests/gen-actual-fields.mjs).",
  },
  runtimes,
  orchestratorContracts: {
    entry: "src/orchestrator.js#RuntimeOrchestrator.run",
    contracts: [
      {
        req: "R-EVENT-01",
        statement: "validateEvent before pipeline.",
        status: "enforced",
        evidence: "validators.js#validateEvent rejects malformed events.",
      },
      {
        req: "R-PKT-01",
        statement: "validatePacketShape per packet + event_id match.",
        status: "enforced",
        evidence:
          "validators.js#validatePipeline runs validatePacketShape and event_id_mismatch per RUNTIME_ORDER.",
      },
      {
        req: "R-EXEC-01",
        statement: "validatePipeline cross-packet execution boundary.",
        status: "enforced",
        evidence: "validators.js#validatePipeline execution-boundary check.",
      },
      {
        req: "R-SURF-01",
        statement: "validatePipeline no-surface checks.",
        status: "enforced",
        evidence:
          "validators.js#validatePipeline no_surface_* rules.",
      },
      {
        req: "R-BUDGET-01",
        statement: "validatePipeline message budget check.",
        status: "enforced",
        evidence: "validators.js#validatePipeline budget check.",
      },
      {
        req: "R-UPD-01",
        statement: "Updates require evidence refs.",
        status: "enforced",
        evidence: "update-queue.js#validateUpdate; parity-contract R-UPD-01.",
      },
      {
        req: "R-UPD-02",
        statement: "Updates cannot write forbidden paths.",
        status: "enforced",
        evidence: "update-queue.js#validateUpdate; parity-contract R-UPD-02.",
      },
      {
        req: "R-UPD-03",
        statement: "Over-cap increments are rejected.",
        status: "enforced",
        evidence: "update-queue.js#validateUpdate; parity-contract R-UPD-03.",
      },
      {
        req: "R-CANON-01",
        statement: "canon_only updates rejected in living mode.",
        status: "enforced",
        evidence: "update-queue.js#validateUpdate; parity-contract R-CANON-01.",
      },
      {
        req: "R-DET-01",
        statement: "Deterministic pipelineHash / replay verify.",
        status: "enforced",
        evidence:
          "replay/replay.js#ReplayEngine.verify; parity-contract R-DET-01.",
      },
      {
        req: "R-EXEC-02",
        statement: "result.executionStatus = not_executed unless allowlist+confirmed+handler.",
        status: "enforced",
        evidence:
          "execution/execution-boundary.js; parity-contract R-EXEC-02.",
      },
    ],
  },
};

writeFileSync(
  join(here, "runtime-contract-map.json"),
  JSON.stringify(out, null, 2) + "\n",
);

// summary
const counts = {};
let total = 0;
for (const r of runtimes) {
  for (const c of r.contracts) {
    counts[c.status] = (counts[c.status] || 0) + 1;
    total++;
  }
}
for (const c of out.orchestratorContracts.contracts) {
  counts[c.status] = (counts[c.status] || 0) + 1;
  total++;
}
console.log("wrote runtime-contract-map.json");
console.log("contracts total:", total, JSON.stringify(counts));
for (const r of runtimes) {
  console.log(`  ${r.kind}: outputFields=${r.outputFields.length} contracts=${r.contracts.length}`);
}

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
          "Sensitive input passes a bidirectional gate: keyword-only references get a NEGATIVE inference gate (not auto-severe/crisis/intimacy), while confirmed current events and Canon-routed events get POSITIVE activation paths (real severe state may activate). Operational-guidance language is stripped at the Language/Safety layer.",
        status: "tested_only",
        substatus: "bidirectional-gate-missing",
        gates: {
          keyword_only_negative_gate: "partial",
          confirmed_current_event_positive_gate: "missing",
          confirmed_harm_positive_gate: "missing",
          canon_route_positive_gate: "missing",
          operational_guidance_language_gate: "missing",
          harmless_fallthrough: "implemented",
        },
        evidence:
          "Engine reality (src/runtimes/meaning.js): dark_humor/sexual_joke/drug_reference each get only a NEGATIVE inference meaning (X_not_automatically_crisis/intimacy/severe); dark & sexual additionally add blockedMeanings (automatic_crisis/automatic_intimacy), drug does not. NONE of the three has a POSITIVE activation path: there is no gate that lets a confirmed_current_event, confirmed_harm_evidence, or a canon_route re-enable a genuinely severe state — so a real emergency or a Canon-scripted severe event would be flattened the same as a keyword joke. There is also no Language/Safety-layer gate that strips operational-guidance phrasing. The missing piece is the POSITIVE direction (three activation paths + operational-guidance gate), NOT 'add a restraint block to drug'. parity-contract R-DARK-01 locks the negative direction and pins each positive path as still-missing. See high-risk-gaps.md.",
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
        statement:
          "behavior.externalActionRequests[].status is built as not_executed (with confirmationRequired).",
        status: "tested_only",
        testedBy: {
          test: "tests/parity-contract.test.js",
          assertsFields: ["behavior.externalActionRequests"],
        },
        evidence:
          "runBehavior constructs every externalActionRequests entry as status=not_executed, confirmationRequired=true, and parity-contract R-EXEC-03 asserts that. There is NO validator that re-checks behavior.externalActionRequests[].status: validatePipeline's execution-boundary rule (line 46) inspects language.executionStatus, not the behavior packet, and ExecutionBoundary governs the boundary request object (R-EXEC-02), not this packet. So a forged behavior.externalActionRequests[].status='executed' would pass validatePipeline. This is constructed-by-runtime + tested, not enforced.",
      },
      {
        req: "R-BUDGET-01",
        statement:
          "language.messageUnits length must not exceed behavior.messageOrActionCount.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "language_message_budget_exceeded",
          checkedFields: ["language.messageUnits", "behavior.messageOrActionCount"],
        },
        evidence:
          "validatePipeline (line 50) rejects when language.messageUnits.length > behavior.messageOrActionCount.",
      },
      {
        req: "R-SURF-01",
        statement:
          "A no-surface behavior.actionType (wait/no_action/observe_without_engaging) must yield language.renderStatus=no_output.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "no_surface_behavior_rendered_text",
          checkedFields: ["behavior.actionType", "language.renderStatus"],
        },
        evidence:
          "validatePipeline (line 38) rejects when behavior.actionType is a no-surface type but language.renderStatus !== no_output.",
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
        statement:
          "When primarySurface=no_surface, expression.rhetoricalPlan carries no active rhetorical acts.",
        status: "constructed",
        evidence:
          "runExpression builds rhetoricalPlan with no active primaryActs under a no_surface primarySurface. No validator checks rhetoricalPlan.primaryActs: validatePipeline's no_surface rule (line 42) inspects only primarySurface + language.renderedText — it never reads rhetoricalPlan.primaryActs. So a forged non-empty primaryActs under no_surface would still pass validatePipeline. This is constructed-by-runtime, not enforced. (The separate, genuinely-enforced no_surface->no renderedText relation lives on the language stage as R-SURF-01.)",
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
        statement: "language.executionStatus stays not_executed.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "language_execution_boundary_violation",
          checkedFields: ["language.executionStatus"],
        },
        evidence:
          "validatePipeline (line 46) rejects any language.executionStatus other than not_executed; parity-contract R-EXEC-01 forges a claim.",
      },
      {
        req: "R-SURF-01",
        statement:
          "When expression.primarySurface=no_surface, language must have no renderedText.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "no_surface_has_rendered_text",
          checkedFields: ["expression.primarySurface", "language.renderedText"],
        },
        evidence:
          "validatePipeline (line 42) rejects a no_surface primarySurface that carries language.renderedText.",
      },
      {
        req: "R-BUDGET-01",
        statement:
          "language.messageUnits length must not exceed behavior.messageOrActionCount.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "language_message_budget_exceeded",
          checkedFields: ["language.messageUnits", "behavior.messageOrActionCount"],
        },
        evidence: "validatePipeline (line 50) budget check.",
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
        statement: "A malformed event is rejected before the pipeline runs.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validateEvent",
          errorCode: "missing_event_id",
          checkedFields: ["event.eventId", "event.mode", "event.actor"],
        },
        evidence: "validateEvent rejects malformed events (missing_event_id / invalid_mode / invalid_actor).",
      },
      {
        req: "R-PKT-01",
        statement: "Each packet has a valid shape and matches the event id.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "event_id_mismatch",
          checkedFields: ["packet.eventId", "packet.kind", "packet.data"],
        },
        evidence:
          "validatePipeline runs validatePacketShape per RUNTIME_ORDER and flags event_id_mismatch.",
      },
      {
        req: "R-EXEC-01",
        statement: "language.executionStatus stays not_executed (cross-packet boundary).",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "language_execution_boundary_violation",
          checkedFields: ["language.executionStatus"],
        },
        evidence: "validatePipeline (line 46) execution-boundary check.",
      },
      {
        req: "R-SURF-01",
        statement:
          "no-surface behavior.actionType -> no_output, and no_surface primarySurface -> no renderedText.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "no_surface_behavior_rendered_text",
          checkedFields: [
            "behavior.actionType",
            "language.renderStatus",
            "expression.primarySurface",
            "language.renderedText",
          ],
        },
        evidence:
          "validatePipeline lines 38 and 42 enforce the no-surface relations.",
      },
      {
        req: "R-BUDGET-01",
        statement:
          "language.messageUnits length must not exceed behavior.messageOrActionCount.",
        status: "enforced",
        enforcedBy: {
          validator: "src/validators.js#validatePipeline",
          errorCode: "language_message_budget_exceeded",
          checkedFields: ["language.messageUnits", "behavior.messageOrActionCount"],
        },
        evidence: "validatePipeline (line 50) budget check.",
      },
      {
        req: "R-UPD-01",
        statement: "An update without evidenceRefs is rejected.",
        status: "enforced",
        enforcedBy: {
          validator: "src/update-queue.js#validateUpdate",
          errorCode: "missing_update_evidence",
          checkedFields: ["update.evidenceRefs"],
        },
        evidence: "validateUpdate rejects updates lacking evidenceRefs; parity-contract R-UPD-01.",
      },
      {
        req: "R-UPD-02",
        statement: "An update writing outside counters/patterns/memory is rejected.",
        status: "enforced",
        enforcedBy: {
          validator: "src/update-queue.js#validateUpdate",
          errorCode: "forbidden_update_path",
          checkedFields: ["update.path"],
        },
        evidence: "validateUpdate rejects forbidden paths; parity-contract R-UPD-02.",
      },
      {
        req: "R-UPD-03",
        statement: "An increment beyond the cap is rejected.",
        status: "enforced",
        enforcedBy: {
          validator: "src/update-queue.js#validateUpdate",
          errorCode: "update_increment_cap_exceeded",
          checkedFields: ["update.operation", "update.delta"],
        },
        evidence: "validateUpdate rejects over-cap increments; parity-contract R-UPD-03.",
      },
      {
        req: "R-CANON-01",
        statement: "A canon_only update in living mode is rejected.",
        status: "enforced",
        enforcedBy: {
          validator: "src/update-queue.js#validateUpdate",
          errorCode: "canon_update_in_living_mode",
          checkedFields: ["update.policy"],
        },
        evidence: "validateUpdate rejects canon_only updates outside canon mode; parity-contract R-CANON-01.",
      },
      {
        req: "R-DET-01",
        statement: "Replay verify flags any pipelineHash mismatch.",
        status: "enforced",
        enforcedBy: {
          validator: "src/replay/replay.js#ReplayEngine.verify",
          errorCode: "mismatch",
          checkedFields: ["pipelineHash"],
        },
        evidence: "ReplayEngine.verify returns status=mismatch on hash divergence; parity-contract R-DET-01.",
      },
      {
        req: "R-EXEC-02",
        statement:
          "A boundary request stays not_executed unless allowlisted + confirmed + handler present.",
        status: "enforced",
        enforcedBy: {
          validator: "src/execution/execution-boundary.js#ExecutionBoundary.request",
          errorCode: "action_not_allowlisted",
          checkedFields: ["request.action", "request.confirmed"],
        },
        evidence:
          "ExecutionBoundary.request blocks non-allowlisted actions and returns not_executed unless confirmed with a handler; parity-contract R-EXEC-02.",
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

// P1-1B.1 reveal-followup analysis (directive §8) — data-driven, no preset answer.
//
// Answers "what actually happens AFTER a reveal?" instead of assuming reveal→mask. For every
// reveal-type move it records the immediate next action, the second-next, and whether the reveal
// was message-final (no follow-up exists). The message-final count is the structural reason H3 is
// low: you cannot mask with an action that isn't there.
//
// Deterministic, count-based, links carried (private). No text.

import { linkOf, orderedActions } from "./grammar-discovery.mjs";

const REVEAL_MOVES = new Set(["reveal", "seek_confirmation", "seek_attention"]);

export function analyzeRevealFollowup(annotations) {
  const immediate = new Map();
  const second = new Map();
  let revealBearing = 0;
  let revealFinalOnly = 0; // records whose ONLY reveal is message-final
  let revealWithFollow = 0; // records with at least one reveal that has a next action
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  for (const ann of annotations) {
    const acts = orderedActions(ann).map((s) => s.action);
    let hasReveal = false;
    let anyFollow = false;
    for (let i = 0; i < acts.length; i++) {
      if (!REVEAL_MOVES.has(acts[i])) continue;
      hasReveal = true;
      if (i + 1 < acts.length) {
        anyFollow = true;
        bump(immediate, acts[i + 1]);
        if (i + 2 < acts.length) bump(second, acts[i + 2]);
      }
    }
    if (hasReveal) {
      revealBearing++;
      if (anyFollow) revealWithFollow++;
      else revealFinalOnly++;
    }
  }

  const toSorted = (m) =>
    [...m.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count || (a.action < b.action ? -1 : 1));

  return {
    formatVersion: 1,
    status: "PILOT_ESTIMATE",
    revealBearingRecords: revealBearing,
    revealMessageFinalRecords: revealFinalOnly,
    revealWithFollowupRecords: revealWithFollow,
    finding: `${revealFinalOnly} of ${revealBearing} reveal-bearing records end ON the reveal (no following action). This is the STRUCTURAL reason immediate reveal→mask is low — masking requires a follow-up action that often does not exist.`,
    immediateFollowup: toSorted(immediate),
    secondFollowup: toSorted(second),
  };
}

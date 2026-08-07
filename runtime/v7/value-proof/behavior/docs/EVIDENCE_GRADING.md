# Evidence Grading Guide (E0–E4)

Grades bound how far a claim may travel. Only **E3/E4** patterns may ever influence future
generation behavior rules — and only after human review. The pattern validator
(`lib/pattern.mjs`) enforces the E3/E4 requirements below; the schema alone does not.

| Grade | Meaning | Where it may be used |
|------|---------|----------------------|
| E0 | context-dependent / unknowable | recorded only; never a claim |
| E1 | observable local act (L1) | describe a single record |
| E2 | supported interaction function (L2) | describe a record's function |
| E3 | recurring behavioral pattern (L4) | candidate input to behavior rules |
| E4 | high-confidence core regularity candidate | strongest candidate; still review-gated |

## E3 requirements (all must hold)

- supported by **multiple independent records** (not the same line repeated);
- at least **two different wordings**;
- at least **two different surface emotions / tones**;
- a **counterexample check** was performed (`counterexampleRecordHashes` considered, may be
  empty but must have been looked for);
- the pattern is **consistent across a second annotation round**.

Encoded on the pattern as: `supportingRecordHashes` ≥ N distinct, `surfaceVariantCount` ≥ 2,
`affectVariantCount` ≥ 2, `reReviewConsistent:true`.

## E4 requirements (E3 plus)

- appears across **multiple corpus clusters** (`crossClusterCount` ≥ 2);
- explains **several different overt behaviors**;
- has **predictive value on a held-out set** (the 200-stage reserves 20%, §14);
- does **not depend on a single keyword**;
- alternative explanations are **clearly weaker** than the main one;
- **human review passed** (`humanReviewed:true`).

## Downgrade triggers

Downgrade (or reject) a pattern when: support collapses to one wording; the "second affect" is
only `C_designed_inference`; a counterexample is as strong as the supporting set; or round-2
annotation disagrees. A rejected pattern keeps `reviewStatus:"rejected"` with its hashes so the
decision is auditable — it is not deleted.

## Why the gate matters

The whole point of the single-sided corpus is to prove 糖糖's continuity is a *derived,
evidenced* regularity — not a personality we asserted. A pattern that cannot clear E3 is a
hypothesis, and is reported as such (see H1–H7). Keeping E0–E2 out of behavior rules is what
stops the harness from manufacturing a character it was told to find.

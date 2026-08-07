# Expected-Reply Guide (functional, not reconstructed)

We never recover what the partner actually said. We annotate only the **functional class** of
reply the utterance seeks, and — separately — which replies would fail it and how it might
escalate. Every field may be `unknown`/empty; a needy-seeming character does **not** default all
utterances to `specific_reassurance`.

## The four fields (§7)

1. **literalRequest** (boolean) — is there an explicit ask on the page?
2. **functionalExpectedReply** — the reply class(es) the utterance is functionally fishing for.
3. **likelyUnsatisfyingReplies** — reply class(es) that would predictably fail to satisfy it.
4. **likelyEscalationIfUnsatisfied** — escalation stage(s) that plausibly follow non-satisfaction.

## Reply classes (from `behavior-vocab.json → expectedReplyClasses`)

`specific_reassurance` · `affection_reciprocation` · `exclusive_attention_confirmation` ·
`continued_presence` · `pursuit_after_withdrawal` · `apology` · `practical_answer` ·
`playful_resistance` · `admiration` · `desire_confirmation` · `boundary_respect` ·
`quiet_companionship` · `no_reply_expected` · `ambiguous`.

## Rules

- **Separate literal from functional.** "随便你" with a literal request of *none* may still have
  a functional expected reply of `pursuit_after_withdrawal`. Record both; do not collapse them.
- **Do not infer reassurance-seeking from tone alone.** Only assign `specific_reassurance` when
  the utterance's function (L2) supports it. Absent that, prefer `ambiguous` or `unknown`.
- **Unsatisfying ≠ opposite.** A practical answer can be the *unsatisfying* reply to a bid that
  functionally wanted `exclusive_attention_confirmation`. This asymmetry is often the most
  diagnostic signal — capture it.
- **Escalation is a candidate, not a prediction.** `likelyEscalationIfUnsatisfied` lists
  *candidate* next stages (see `TRANSITION_GUIDE.md` and §8); a single record cannot prove a
  full escalation path.

## Why this is the real test standard

When the four-arm evaluation eventually runs, a generated reply that satisfies the *literal*
request but misses the *functional* expected reply is exactly the "generic girlfriend"
degradation we are watching for. This guide defines that distinction so it can be measured
rather than asserted.

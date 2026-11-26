# Chatbot reliability and reviewer guide

## Product objective

Challenge B measures sponsorship **cash collected before the festival**. Signed value, in-kind support, open pipeline and research potential are separate measures. Historical inputs remain available and immutable. The approved strategy, metric definitions and original evaluation bank are unchanged.

## What this update changes

| Failure | Implementation | Verification |
|---|---|---|
| Ordinary prospect wording misses exact-sentence routes | Business task plan plus broader prospect intent recognition; recommendation questions use the visible prospect register | Screenshot wording and unseen paraphrases tested at function and HTTP levels |
| Past collections substituted for future potential | Prospect task exposes research/register tools; source status, route caveats and approach fields are retained | Prospect tool selection and source checks |
| Cache shares answers across owners or hides conversation turns | Cache key includes authenticated user, member, roles, dataset class, edition, date, filters and version; only independent first turns reuse answers; cache hits use normal persistence | Cross-owner, follow-up, changed-version and persisted-message HTTP checks |
| Repeated tool calls spend unnecessary queries | Identical reads share one promise/result inside a turn | Existing tool traces and complete HTTP regression suites |
| A valid number is attached to another entity or measure | Additional structured financial checks bind named sponsor and single metric citations to supporting rows; operational edition/date mismatches are checked | Wrong sponsor, wrong cited metric, wrong edition/date and changed figures |
| Model failure produces an empty dead end | Server restates supported financial facts and identifies unsupported additional explanation | Verified fallback tests; no model arithmetic |
| Free-provider failures repeat | Provider/model cooldowns, Retry-After respected as a cooldown, bounded attempts, output cap and actual attempt counts | Mocked 429/fallback/cooldown checks |
| Render restart loses evaluation progress | Compressed, actor-bound administrative checkpoint snapshots appended to the existing audit store; local JSON/Markdown exports remain | Compression and actor/owner isolation tests; live database write still requires deployment validation |
| Adopted retrieval disappears after restart | Completed measured retrieval comparison restored from durable administrative checkpoint at startup | Safe baseline fallback if unavailable; no unmeasured candidate becomes the default |

The scoped checker is deliberately limited: it catches particular structured financial contradictions. It is **not** a proof that every causal statement, recommendation or natural-language claim is correct. Missing information, ambiguity and qualitative reasoning still need evaluation and review.

## Retrieval and model choices

Keep React/Vite, Express/TypeScript/Zod and Supabase/PostgreSQL. No new hosted database, embedding API, agent framework or paid fallback is required.

Current facts are queried through permission-checked database tools. Strategy, definitions, assumptions and provenance use knowledge retrieval. Follow-up searches can incorporate previous user wording, without treating previous answers as current numeric evidence. History is enabled for explicit contradiction/decision-history requests. Superseded material stays excluded by default.

The established lexical baseline remains available. The morphological candidate adds topic aliases and precomputed document frequencies. Compare all retrieval variants on the unchanged bank before adopting a winner. A higher recall score is not an answer-accuracy score.

For a bounded provider comparison, run:

```sh
npx tsx scripts/benchmark-free-models.ts --run
```

This sends at most eight inference attempts across the configured OpenRouter primary/fallback IDs: four synthetic tool-selection tasks per distinct model. It does not read or change business data. Its output is labelled LIVE_PROVIDER_SYNTHETIC_TASKS. It measures tool choice, valid arguments, latency and reported token usage, **not** end-to-end business accuracy. Do not select a winner from model size or an unrun benchmark.

Free models have shared capacity and request caps. No unlimited availability is promised. Deterministic read answers and properly isolated cache hits preserve model capacity for diagnosis and unfamiliar questions. Provider quota windows are not added together into an invented daily allowance.

## Five-minute reviewer workflow

1. Open the simulated edition. Inspect cash collected, signed cash, outstanding collections and one campaign. Open the supporting source rather than relying on a screenshot total.
2. Ask “Which sponsor has actually paid us the most?” Follow with a question about signed value; confirm the labels and evidence distinguish them.
3. Ask “Is there any high potential sponsor we should focus on currently?” Expect research targets, stored prioritization and route/uncertainty caveats, not a ranking of past receipts.
4. Investigate an underperforming campaign. Ask for the evidence, the applicable approved threshold and the next action. Treat a recommendation as an interpretation of evidence, not a proven causal effect.
5. Ask the copilot to prepare a follow-up task for a visible, unambiguous operational record. Inspect owner, due date and payload. Only the reviewer explicitly confirms it. Verify the saved task and audit record.
6. In an isolated demo copy, change one relevant input and repeat the question. Verify new data is reflected in the answer and analytics. Preserve original historical data.
7. Ask a question without supporting data, such as actual historical cash receipts where none exist. Expect a precise limitation rather than fabricated collections or a forecast presented as actual cash.

The evaluator never confirms actions. Reviewers must not use shared demo finance edits merely to create a passing test fixture.

## Submission alignment

| Assignment criterion | Evidence to show |
|---|---|
| Quantitative reasoning, 20% | Funnel from prospects to collectible pre-fest cash; conversion/timing assumptions; base/stretch cases; cash versus signed and in-kind distinctions |
| Five strategies and tradeoffs, 20% | Exactly five ranked bets; incremental contribution with overlap handled; budget, staffing, timeline and explicit rejected alternatives |
| Experimentation, 15% | Leading indicators and measurable scale/change/stop thresholds, connected to actions |
| Dashboard/management, 20% | Real saved records, ownership/deadlines, updated analytics and a complete insight-to-action workflow |
| Chatbot utility, 20% | Unfamiliar phrasing, follow-ups, calculations, changed data, supported recommendations and honest uncertainty |
| Communication, 5% | Exactly three strategy slides, author name, accessible product, setup, sources, assumptions and accurately labelled test evidence |

The distinctive demonstration is a decision supported by evidence that becomes a confirmed, persisted action. A polished interface or more infrastructure does not substitute for that workflow.

## Acceptance and evidence

Run TypeScript checking, the production build and the full mocked regression suite in CI. Run the original LIVE retrieval comparison and full analyst evaluation on the deployed candidate. Keep expected answers unchanged. Cases with absent/ambiguous fixtures and subjective criteria remain explicitly NEEDS_HUMAN.

Required release policy remains at least 90% overall with 100% in Permissions, Action execution and Missing information, plus qualitative review. Partial runs, retrieved-reference recall and mocked regressions must never be reported as live answer accuracy.

Do not reset seeds, bypass permissions, weaken schemas or hide a failed check to reach a target score. The new runtime snapshot format needs a deployment smoke check against existing database permissions; it introduces no migration or financial-function changes.

# Dynamic data and Analyst completion

## Scope and acceptance

1. **Create and update**: creation drawers retain the selected season and record class. Campaign owners come from the real team directory. A successful save broadcasts a refresh immediately; the existing version poll also catches changes from another session. Historical records remain immutable.
2. **CSV and custom data**: Team & Settings → Import data accepts bounded CSV, auto-suggests mappings, previews rows, shows unmapped columns and requires confirmation. Operational destinations call the existing permission-checked APIs. Each row is a transaction; partial failures are reported and retry skips rows saved in the current import session. Existing matching names are rejected rather than silently merged. Imports are not an all-or-nothing multi-row transaction.
3. **Original or unfamiliar data**: export spreadsheets as CSV. Reference dataset preserves all columns, including the original sponsor dataset's non-operational fields, and makes them available to the Analyst through actor/edition-scoped tools. It does not rewrite ED-2025 or invent receipt, contact, contract or interaction evidence. Operational opportunities require existing eligible sponsor IDs and start in Prospecting. Use normal stage/confirmation/Collections workflows for later stages, signed contracts and cash evidence. Operational reference fields accept canonical IDs or exact, unambiguous names resolved against current directories; unknown or ambiguous identities block writes. Unsupported columns are disclosed, not guessed.
4. **Freshness**: operational writes already increment the database version; successful requests invalidate frontend queries. Each Analyst turn reads current evidence. Upload catalogue IDs also participate in answer cache keys, because storing a reference snapshot does not increment operational totals. Upload content is stored append-only in actor-bound audit snapshots; no schema migration or seed rerun. A changed upload produces a new snapshot ID.
5. **Advice and reasoning**: generic how-to questions use a single completion without business tools. Operational questions retain tools, roles and grounding checks. Recommendations should state an observation, brief rationale and practical next step in about 180 words. Provider output is capped (650 tokens without tools, 1,200 with tools); these are provider generation budgets, not a guarantee of exact visible token counts. Failed attempts remain bounded by the existing free-provider policy. No full internal reasoning transcript is exposed.
6. **Fallbacks**: missing data is explicit; failed deterministic reads retain available evidence. Diagnoses prefetch current rule evaluations and campaign records. If free inference fails, flagged rule responses can still provide a factual next step. Prospect source tables are no longer duplicated as long Markdown tables.
7. **Responsive outlook**: Overview and the Analyst expose an observed-rate cash what-if computed on each read. Formula: collected cash + remaining signed cash × observed collection rate + cash-only open pipeline × observed win rate × observed collection rate. Inputs come from canonical metrics and current opportunity state, calculations run server-side. Mixed/in-kind open deals are excluded. Missing/invalid rates suppress the result. This is a transparent sensitivity calculation, not a calibrated prediction, timing model or pre-event guarantee. Frozen approved targets and published forecasts remain unchanged.
8. **Reviewer access**: `npx tsx scripts/smoke-reviewer-live.ts --prepare` verifies only the server-configured SIM-LEAD account in ED-2026-DEMO. If its existing administrator/lead permissions allow it, the command assigns missing coordination_lead/admin/finance_collections roles through the existing audited endpoint. It never changes another account, bypasses authorization, grants live-edition roles or weakens historical/finance safeguards.

## Validation boundaries

- Native MOCKED tests exercise malformed/quoted/multiline CSV, unsafe/duplicate headers, row/size limits, mapping requirements, duplicates, general-vs-operational intent, upload filters and whole-cohort summaries.
- HTTP MOCKED tests exercise actor-bound persistence, repeated import, auth/role/history denial and a no-tool advice turn.
- MOCKED outlook tests change cash/pipeline inputs and assert the result changes, including restricted/historical cases.
- Existing tests cover canonical writes, actions, role enforcement, grounding, provider fallback and cache scope. The original evaluation bank, expected answers, seeds and approved strategy are unchanged.
- A finite suite cannot cover every possible natural-language question or arbitrary file. Full LIVE answer accuracy, deployed CSV persistence, visual interactions, concurrent imports, actual microphone behavior and model quality still require deployed acceptance checks. Do not describe mocked results as live accuracy.
- Operational duplicate detection in the import UI is a preflight, not a database uniqueness constraint. Concurrent sessions can still create same-name records. Original spreadsheet financial fields must not be silently treated as reconciled/allocated cash.

## Reviewer smoke questions after deployment

- How much cash have we collected? Who contributed the most collected cash?
- Which existing pipeline deals should we follow up on, and why?
- Which researched prospects should we approach first? Are those confirmed introductions?
- Should we stop our current initiatives? Explain the latest threshold signals.
- How do I write a sponsorship proposal? (general advice; no record reads)
- What is in the uploaded [dataset name]? Filter by [actual column/value].
- After adding/editing a campaign/task/opportunity, ask for it by name and refresh Overview.
- After changing a valid open cash amount or recorded cash through Collections, check that canonical metrics and the current what-if respond, while approved targets stay fixed.
- Propose a follow-up task, review the exact owner/date/link, confirm once, then find the saved task. No mutation before confirmation; replay must not duplicate it.
- Try empty data, unknown sponsor, ambiguous metric, historical writes, invalid CSV/IDs, same-file re-import and provider unavailability.

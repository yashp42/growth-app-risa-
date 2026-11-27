# Growth Analyst implementation handoff

Updated: 2026-11-27 (IST)

## Repository and deployment

- Repository: `yashp42/growth-app-risa-`
- Branch: `main`
- Latest repository commit: `0ac940f Record Analyst budget guard deployment status`
- Render service: `https://sponsorship-growth-platform.onrender.com`
- Latest read-only health check after the Analyst budget guard push returned `status: ok`, `database: connected`, all 30 metrics healthy, and a fresh process uptime. The endpoint does not report the deployed commit SHA, so this confirms service health/restart rather than exact source revision.

The working tree may contain an untracked `work/` directory. It predates the latest implementation work and must be preserved unless its owner explicitly asks otherwise.

## What has been implemented and verified

### Analyst safety and dataset analysis

- General advice and product-help questions are tool-free; they no longer receive all data tools by default.
- Business analysis, research and action questions receive scoped tools only.
- Output allowance was increased to reduce prematurely truncated answers.
- Uploaded reference datasets have bounded aggregate querying (`count`, `sum`, `average`, `minimum`, `maximum`), validated fields, grouping, sorting and result limits.
- Aggregate answers include dataset/version/coverage metadata and do not silently analyse only the first preview page.
- The analyst distinguishes reference data from canonical operational KPIs.

### Import user experience

- CSV, XLSX and XLS input is supported in the existing importer.
- Parsing handles BOM, quoted commas, escaped quotes, multiline cells, duplicate-header errors, formula-looking cells, row/column bounds and malformed CSV errors.
- The user chooses a destination before committing:
  - **Reference dataset for Analyst** preserves the uploaded data separately and does not alter KPIs.
  - **Sponsors**, **campaigns**, **opportunities** and **tasks** use operational import.
- Import Data is a visible, named section in Team & Settings. Compact contextual importers remain in operational tabs.
- Preview, field mapping, explicit confirmation, source-row/column count, source SHA-256 display and downloadable error report are implemented.
- Original RISA column names are recognised conservatively. `Brand` and `Opportunity Value INR` can be suggested; `Stage`, `Amount Paid`, `Payment Date` and `Category` stay reference-only until a business owner explicitly maps their meaning. A raw “Amount Paid” field never becomes reconciled cash.

### Atomic operational import

`POST /api/imports/operational` was added in `server/routes/importApi.ts`.

It provides one PostgreSQL transaction per batch for these destinations:

| Destination | Created records |
| --- | --- |
| sponsors | `sponsor` |
| campaigns | `campaign` |
| opportunities | `opportunity` plus its initial `opportunity_stage_version` |
| tasks | `task` |

Before the first insert it:

- validates payload, selected edition and record class;
- applies the existing authenticated role and domain-permission checks;
- checks all referenced IDs are in the selected record class;
- limits own-scope users to records they own;
- serializes matching retries with an advisory transaction lock;
- records `import_batch`, source file SHA-256, mapping version and source reference;
- records audit events for every inserted canonical row;
- rolls back the complete batch if a reference or database constraint fails.

The uploaded source SHA-256 and mapping SHA-256 are deliberately separate. Idempotency is based on both fingerprints; provenance keeps the real source fingerprint.

## Test evidence

Run from the repository root:

```powershell
npm.cmd run lint
npm.cmd run build
npx.cmd tsx --test scripts/test-dynamic-data.ts
npx.cmd tsx --test scripts/test-dynamic-integration.ts
```

Latest successful results:

- TypeScript lint: pass.
- Production Vite build: pass (only the existing Vite configuration/chunk-size warnings).
- Dynamic data/reliability tests: 33/33 pass.
- Mock HTTP integration tests: 5/5 pass, including the atomic operational batch and rollback-before-insert scenario.

The integration suite creates a local loopback test server. In a restricted environment it may need explicit permission to connect to `127.0.0.1`; that is a test-environment restriction, not a test failure.

## Important limitations: do not overclaim

The following requested work is **not complete yet**:

1. Atomic relational batch support is not yet implemented for contacts, outreach attempts, interactions, meetings, qualification histories, receipts, receipt allocations, invoices/schedules or later opportunity stage histories.
2. The Original-RISA preset is conservative and tested for known headers, but is not yet a formal, source-by-source mapping certification across every historical source file.
3. Every write-to-directory/search/metric/Analyst surface has not been browser-tested end to end. The test suite verifies representative transaction/API behavior only.
4. Browser verification of the new Import Data section was inconclusive: the Render health route was healthy, but the in-app browser session stayed at “Checking server session configuration” without browser-console errors. Do not report browser UI proof until checked in an authenticated normal browser session.
5. End-to-end live OpenRouter/free-provider and voice reliability cannot be guaranteed because provider capacity and microphone/browser permissions are external dependencies.
6. The parser is an in-repo RFC-style parser. If strict compliance with “established CSV parser” is mandatory, replace it with a maintained library such as Papa Parse after assessing bundle/security impact and add regression coverage.

## Recommended next implementation order

1. **Inventory each existing canonical write route** in `server/routes/writeApi.ts` and the matching action workflow in `server/llm/actions.ts`. Reuse their validation semantics rather than duplicating unsafe simplified inserts.
2. Build a multi-entity import manifest format, for example a zip/worksheet set with entity type, row keys and dependencies. Preview all entity sheets and validate every foreign-key relationship before writing.
3. Extend the atomic import transaction in dependency order:
   sponsors -> contacts -> campaigns -> outreach attempts -> interactions/meetings -> qualifications -> opportunities -> stage versions -> invoices/schedule items -> reconciled receipts -> allocations -> tasks.
4. Do **not** treat payment-looking columns as receipts. A financial batch must require reconciliation evidence, correct recorder/permissions, linked invoice or schedule records, and allocation-total validation. Roll back the whole graph on any failure.
5. Add import-batch row-error persistence/download rather than only client-side error text. Keep errors outside canonical operational records.
6. Verify selected global edition/record class all the way through Quick Add and every creation drawer. Preserve role enforcement; explain missing edition-specific assignment instead of silently defaulting to Live or granting access.
7. Add full real-browser test scripts using safe simulated records, then cleanly reverse/mark those records according to the audit model if needed. Do not test financial imports by manufacturing reconciled payments.
8. Run a limited provider smoke test only after app login/session is stable; record provider-unavailable results as an external capacity condition, never as fabricated analysis.

## Key files

- `server/routes/importApi.ts` — reference and operational import endpoints.
- `src/components/settings/DataImportPanel.tsx` — upload, preview, mapping and explicit commit UI.
- `src/components/settings/TeamSettingsWorkspace.tsx` — visible Team & Settings importer entry.
- `src/lib/csvImport.ts` — parser, mapping, RISA preset and relationship reference resolution.
- `server/routes/writeApi.ts` — canonical write behavior that future entity imports should match.
- `server/llm/actions.ts` — confirmed human/AI operational write workflows.
- `server/llm/questionPlan.ts` and `server/routes/aiApi.ts` — tool routing/safety.
- `scripts/test-dynamic-data.ts` and `scripts/test-dynamic-integration.ts` — current regression coverage.

## Analyst acceptance follow-up (Tests 11–15)

The 2026-11-27 continuation added scoped deterministic routes and regression coverage for the reviewer questions:

- **Test 11:** `basicAnalyticsIntent` recognizes a 2025-vs-2026 funnel comparison. The answer queries M-11/M-12/M-13 independently for `ED-2025` and `ED-2026-DEMO`, includes source numerator/denominator, and labels the distinct brand/opportunity grains. Uncomputable historical observations remain unavailable; the routes do not merge editions.
- **Test 12:** broad cash-position questions take precedence over the overlapping sponsor-ranking intent. The answer separately reads M-02/M-03/M-01/M-07 and ranks receivables only when M-07 is computable. A separate “which signed partnerships still have outstanding cash” route uses RBAC-scoped receivables plus the M-07 total. It distinguishes due-date evidence from a positive balance and never treats signed/invoiced value as collected cash.
- **Test 13:** the D-010 route reads current threshold rules and evaluated metric snapshots, reports keep/change/escalation thresholds, groups B4a/B4b under the approved B4 strategy, and labels missing/restricted/not-due metrics as not evaluable.
- **Test 14:** the route reads current M-13/M-21 by warm/inbound/cold, approved scenario values, approved capacity and bet-economics datasets, plus D-010 knowledge. It provides the approved priority order and explicitly avoids inventing fractional effort shares because current owner workload and marginal cash timing are not measured. It does not edit D-009/D-010.
- **Test 15:** three-turn routing preserves context: it ranks current channels from M-13, separates measured rates from causal hypotheses on “why”, and gives three evidence-linked, unexecuted recommendations on the follow-up. Automated tests exercise all three routes; live voice/provider proof remains outstanding.
- OpenRouter catalog validation on 2026-11-27 showed the configured `inclusionai/ling-3.2-flash:free` fallback was no longer listed. Replaced it with `google/gemma-4-31b-it:free`, which was listed with zero prompt/completion pricing and tool support. Increased output limits to 1,600 tokens with tools and 900 without tools.
- The deployed environment still explicitly pinned the retired fallback slug. `server/config.ts` now migrates that exact known retired value to the verified free fallback during config loading; `scripts/test-stage4a.ts` covers the migration. Lint, production build and all 276 scripted tests passed after this fix. After commit `81c82309bc31ee7b394beffdf2bd50ca9c40ab2d` deployed, live `/api/admin/health` returned `google/gemma-4-31b-it:free`, `fallback_verified: true`, and `status: ok`.

Files added/changed for this acceptance work include `server/llm/strategyAnswers.ts`, `server/llm/basicAnalytics.ts`, `server/llm/financialAnswers.ts`, `server/llm/operationalAnswers.ts`, `server/routes/aiApi.ts`, and tests under `scripts/test-analyst-acceptance-11-15.ts`, `scripts/test-basic-analytics.ts`, and `scripts/test-stage4b.ts`.

Acceptance caveat: deterministic/mock regression tests establish routing, source selection, math-field preservation, and uncertainty handling. They do not prove current production database contents, authenticated browser behavior, or OpenRouter availability. Complete those live checks in an authenticated environment before declaring all reviewer tests passed.

## Analyst reliability follow-up (2026-11-27 evening)

The latest user screenshots exposed three additional gaps: the cash answer checker rejected sponsor-level M-07 values because they were cited as the overall M-07 total; due-date follow-ups only returned aggregate collection metrics; and “allocate 5 person-weeks” was mistaken for a finance-only receipt allocation. Also, channel leakage analysis depended on an unavailable provider.

Current uncommitted changes address these with:

- sponsor-ranking citations use `sponsor_metrics:M-07`, so named sponsor balances are checked against sponsor-level evidence;
- receivable records now include permission-scoped unpaid schedule items and due dates, and the deterministic follow-up answer prioritizes recorded overdue amount, then outstanding amount, while explicitly marking unknown urgency;
- finance-only refusal is restricted to receipt/payment/bank-transaction allocation or reconciliation; capacity planning remains available to the strategy route;
- “which campaign is leaking qualified leads” uses M-10/M-17/M-18/M-19 per campaign without calling a model provider;
- historical funnel comparisons add their computed rate deltas to the verification evidence, retaining edition separation and small-sample caveats;
- channel follow-ups and a combined three-message request return measured evidence, distinguish inference, and give unexecuted recommendations.

Checks on this follow-up:

- `npm.cmd run lint`: pass.
- `npm.cmd run build`: pass; existing Vite config/chunk-size warnings remain.
- `npx.cmd tsx --test scripts/test-analyst-acceptance-11-15.ts scripts/test-basic-analytics.ts`: 14/14 pass.
- `scripts/test-stage4b.ts`: attempted, but HTTP tests requiring local loopback failed with Windows `EACCES` connecting to `127.0.0.1`; the relevant finance-refusal unit assertion passed. Re-run that integration suite in an environment permitting loopback.

The changes are pushed to `main` through `c2a5d3705c7889984ac4cdab453a8c43d40ffab1` (includes a follow-up commit restoring the complete Stage 4B test file). Deployment is still pending verification. After deployment, re-test (1) combined cash, (2) due-date follow-up, (3) historical vs simulated funnel, (4) all five D-010 bets, (5) capacity recommendation, (6) campaign leakage, (7) channel performance/why/actions in separate turns, and (8) the same channel diagnosis in one combined message. Provider availability is still external; provider-independent database routes should remain usable during outages.

### Architecture assessment and current state

The Analyst remains a hybrid: SQL-backed metric tools are authoritative for operational facts; PostgreSQL lexical RAG supplies approved definitions/rules; the LLM chooses tools for open-ended questions and now synthesizes interpretation over retrieved evidence for complex funnel, historical and strategy requests. High-risk cash totals continue to use validated deterministic calculations.

The follow-up implemented a shared `AnalystEvidencePlan` in `server/llm/analystPlan.ts`. It arbitrates the existing domain intents into one multi-facet request, records evidence obligations and required answer sections, and is used by the route for deterministic and model-assisted requests. A shared final check marks missing sections as incomplete, appends an honest user-facing explanation, and returns structured completeness fields. `verifyScopedAnswer` remains the independent numeric/edition checker. LLM synthesis is optional: its narrative must pass grounding and internal-tool leak checks; the evidence-backed answer remains intact if synthesis is unavailable or rejected. The UI now surfaces specific verification warnings and incompleteness.

This is a coherent first architecture layer, not a semantic guarantee: intent recognition still uses bounded language patterns, answer coverage uses required-section checks, and the general numeric verifier cannot prove causality or recommendation quality. Keep SQL authoritative, use RAG for definitions/rules rather than operational numbers, and continue adding paraphrase, multi-turn, and real database acceptance cases. Do not describe a local mock pass as live verification.

Knowledge retrieval is implemented as RAG using PostgreSQL full-text search (`tsvector`/GIN + `websearch_to_tsquery`), title/section trigram similarity, term expansion and ranked `knowledge_chunk` results; returned chunks enter the model context with provenance. This is lexical/hybrid retrieval, not embedding/vector search: `db/01_schema.sql` records that pgvector was deferred pending OD-06. Numerical operational claims should continue to use SQL metric tools, not document retrieval.

The “budget?” screenshot revealed a system-boundary leak: the model disclosed `get_sponsor_metrics` and told the user to run it. Commit `2c4f990f9396a99894e9779143e329c4167745ad` routes short sponsorship-budget shorthand to the deterministic current cash-position answer, adds a shared final-response guard against exposing internal tool/query instructions, adds a direct user-facing prompt rule, and restores the complete Stage 4B test file. Focused tests, lint, and production build passed locally before the push. The Render health check and authenticated live UI still need post-deploy verification.

## Follow-up from the five live acceptance prompts (2026-11-27)

The latest Analyst outputs showed a compound-question failure: campaign leakage was answered with raw opportunities, cash-plus-due-date questions returned only receivables, a request to preserve approved assumptions triggered a mutation refusal, and a channel-based task follow-up was searched as though the entire phrase were a sponsor name. The live historical-funnel answer was withheld even though the local deterministic regression test passes; this remains a production/data verification item, not a claimed fix.

Local changes in this continuation:

- Strategy routing now returns every applicable intent. A single prompt can evaluate D-010 growth bets and answer the five-person-week capacity comparison; the route composes both sections while preserving D-009/D-010.
- Cash questions that ask for signed, collected, outstanding and due-date evidence now route through one composed cash answer. It includes M-04 in-kind separately, states the M-03 = M-01 + M-07 reconciliation or reports a gap, and appends the permission-scoped receivable schedule evidence when requested.
- Qualified sponsorship opportunities/prospects and stage-drop-off phrasing routes to the deterministic leakage analysis. The answer includes campaign and channel stages, keeps M-17/M-18/M-19 brand denominators distinct from M-13 opportunity grain, identifies absolute loss volume separately from rate, and makes three measurable recommendations without claiming execution.
- Scenario refusal now ignores an explicit instruction to *not* change approved assumptions; positive requests to change an approved scenario remain refused.
- Confirmation-gated follow-up requests referring to “that channel” carry the previously established channel into the opportunity query. Open opportunities are ranked by stage maturity and then proposed value; tied top records or missing owners do not produce a task proposal. The selection basis is disclosed.
- Added regression cases for the real broad prompts, compound cash + due-date composition, dual strategy intents, and channel-context carryover.

Checks in this continuation:

- `npm.cmd run lint`: pass.
- `npx.cmd tsx --test scripts/test-analyst-acceptance-11-15.ts scripts/test-basic-analytics.ts scripts/test-chatbot-reliability.ts`: 31/31 pass.
- `npx.cmd tsx --test --test-name-pattern='human-only' scripts/test-stage4b.ts`: 1/1 matching test passes, including preservation wording and the channel resolver assertion.
- Build and authenticated live browser checks have not yet been rerun for this exact working tree. Do not claim production deployment or live acceptance completion.

## Shared Analyst planning and synthesis pass (2026-11-27)

The code now has a shared `AnalystEvidencePlan` (`server/llm/analystPlan.ts`) that arbitrates all domain facets for one user message, captures required evidence, and declares answer sections for the acceptance cases. `aiApi.ts` uses that plan for both deterministic and model-assisted routes. After answer generation, missing required sections are disclosed in the answer and returned as `answer_completeness_passed` / `answer_completeness_missing`; numeric/scope checking remains a separate `verifyScopedAnswer` pass. Its warning reason now reaches the UI instead of a generic “could not be verified” banner.

Complex campaign/channel funnel, historical-comparison and strategy answers now get an optional LLM synthesis paragraph above the unchanged verified evidence report. The prompt forbids new numbers, causality claims, and unsupported actions. The synthesis is discarded if numeric/scope grounding fails or if it leaks internal tools. Provider failure leaves the complete structured evidence answer available; status is reported as `synthesis_status` instead of making the database answer unavailable. The chat now tells the user when the evidence report is present but the synthesis layer was unavailable. Simpler financial totals remain deterministic.

Validation for this pass:

- `npm.cmd run lint`: pass.
- `npx.cmd tsx scripts/smoke-growth-analyst.ts`: pass.
- `npx.cmd tsx --test scripts/test-analyst-plan.ts scripts/test-analyst-acceptance-11-15.ts scripts/test-basic-analytics.ts scripts/test-chatbot-reliability.ts`: 35/35 pass.
- `npx.cmd tsx --test --test-name-pattern='human-only' scripts/test-stage4b.ts`: 1/1 matching finance/write-policy test passes.
- `npm.cmd run build`: pass; existing Vite `__dirname` and large-chunk warnings remain.
- Exact production DB responses, authenticated browser behavior, and live provider synthesis are still unverified. These changes are local and have not been pushed or deployed.

Remaining acceptance work: deploy this revision, then rerun all five broad prompts in an authenticated session. The historical-funnel live failure specifically needs its new `answer_check_warning`, completeness fields, and source tool trace to determine whether production is serving stale code or the selected historical records make one or more stage/channel comparisons unavailable. Keep the full answer in the evaluation record, not only the rendered metric widgets.

### PR and clean-install check (2026-11-27)

- Opened PR #19, `Improve Analyst evidence planning and synthesis`, from `codex/analyst-evidence-architecture`; it contains the 13 intended implementation/test/handoff files and excludes the pre-existing `work/` directory. The branch comparison is 400 additions / 61 deletions, without line-ending churn.
- GitHub Actions initially failed before tests because `npm ci` found the lock file missing optional `@emnapi` entries required by the existing Rolldown and Tailwind WASI bindings. `package-lock.json` was regenerated using npm 10.9.3, matching CI.
- Clean-install validation passed in an isolated temporary directory with `npx npm@10.9.3 ci --ignore-scripts --no-audit` (280 packages added). In-place npm operations against the existing `node_modules` were blocked by Windows EPERM, so the isolated result is the useful validation.
- GitHub Actions run 58 passed clean install, lint, build and voice-preview generation, then found two stale Stage 4B assertions. The fallback test now checks the verified metric and availability notice rather than requiring an irrelevant table; the system prompt was shortened while keeping its guardrails and now fits the existing 600-token budget. Both focused tests pass locally.
- These final fixes are being added to PR #19. Wait for the fresh hosted workflow (including the full scripted suite) to pass before merge.
- PR is open, not merged. Do not deploy until the updated clean CI passes; after merge, verify Render and run the authenticated acceptance prompts. The earlier red workflow run is on the prior PR head and does not validate the lock-file correction.


## Flexible Analyst follow-up

The local continuation applies shared investigation, evidence-scope, cash, threshold, and safe task-draft fixes on top of merged PR #19. It is not live-validated. Track acceptance against the five user scenarios, plus paraphrases and permission/provider failure cases. Do not treat mocked test passes as evidence of live answer quality.

### Current continuation state (2026-11-27)

- The five acceptance prompts are not stored as fixed answer templates. Cash totals, due schedules, channel conversion, historical metrics, D-010 samples, and linked opportunities are read from edition-scoped records and approved rule/scenario sources; missing fields remain missing.
- `ANALYST_FLEXIBLE_INVESTIGATION` now requires the explicit value `true`. The broad agentic tool loop remains available but is not the default: running the whole suite with that mode enabled exposed skipped evidence and broke provider-independent finance paths. The default uses the existing domain evidence planners, with LLM-written synthesis where useful. Treat this as a staged rollout decision, not proof that the open-ended path is production-ready.
- Draft-only task follow-up now searches the opportunity, validates its owner, and requires a deadline from the user or a recorded source before preparing a dated proposal. The write tool remains unavailable for a draft-only request; acceptance still requires the normal confirmation flow.
- The channel opportunity read uses a server-side channel filter; linked task reads can retrieve due-date context. Ambiguous top-ranked opportunities do not produce a proposal.
- Cross-edition percentage-point arithmetic is allowed only from comparable numerator/denominator evidence with the same metric and filters. D-010 threshold outputs carry sample numerator/denominator and minimum sample gates.
- Cash intent no longer mistakes descriptive “mark balances that cannot be ranked” wording for a write. Approved scenario preservation wording does not trigger a mutation refusal.

Validation from this continuation:

- `node --import tsx --test --test-reporter=dot scripts/test-*.ts`: pass (all scripted tests).
- `npm run lint`: pass.
- `npm run build`: pass with existing Vite `__dirname` and large-chunk warnings.
- `git diff --check`: pass.
- Public Render health was reachable and reported application/database readiness and 30/30 metric functions healthy. It did not report a deployed commit or exercise authenticated Analyst questions. Production revision and live answer quality therefore remain unverified.

Next handoff: inspect this branch diff, push it as a separate PR (do not push directly to `main`), wait for hosted CI, deploy through the normal pipeline, verify Render's deployed revision, then rerun all five acceptance flows in an authenticated session and record full answers, sources, warnings, and action previews. Preserve the pre-existing untracked `work/` directory; it is not part of this change.

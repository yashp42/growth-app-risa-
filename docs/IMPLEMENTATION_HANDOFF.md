# Growth Analyst implementation handoff

Updated: 2026-11-27 (IST)

## Repository and deployment

- Repository: `yashp42/growth-app-risa-`
- Branch: `main`
- Latest commit: `3f4a3aa Add atomic operational data imports`
- Render service: `https://sponsorship-growth-platform.onrender.com`
- Latest read-only health check returned `status: ok`, `database: connected`, and a fresh process uptime after the push.

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

Files added/changed for this acceptance work include `server/llm/strategyAnswers.ts`, `server/llm/basicAnalytics.ts`, `server/llm/financialAnswers.ts`, `server/llm/operationalAnswers.ts`, `server/routes/aiApi.ts`, and tests under `scripts/test-analyst-acceptance-11-15.ts`, `scripts/test-basic-analytics.ts`, and `scripts/test-stage4b.ts`.

Acceptance caveat: deterministic/mock regression tests establish routing, source selection, math-field preservation, and uncertainty handling. They do not prove current production database contents, authenticated browser behavior, or OpenRouter availability. Complete those live checks in an authenticated environment before declaring all reviewer tests passed.

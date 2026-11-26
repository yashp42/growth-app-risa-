# Stage 4 add-on: give the analyst the reference library (paste only after the Stage 4 report)

The product owner has run `db/08`, `db/09_reference_registers_part1of5` … `part5of5` in Supabase. Copy the attached `db/` files into the repo unchanged, including `SHA256SUMS`, `DATABASE_STAGE4_DATA_README.md` and `build/build_registers.py`, then verify the checksums.

## What is now in the database
- `public.source_register` (135) and `public.benchmark` (103).
- `public.scenario_reference` now has 12 rows: SC-01 to SC-05 have status `APPROVED`, and SC-06 to SC-12 have status `analysis` or `option`.
- A new **read-only schema, `ref`**:
  - `ref.dataset` has one row per dataset: dataset_id, title, source_path, sheet, record_class, status, ai_visible, row_count, columns, source_sha256 and note.
  - `ref.dataset_row` holds the rows: dataset_id, row_no and `data` JSONB, verbatim from the source.
  - `app_service` has SELECT only.

## Changes

1. **The approved-scenario views must filter by status.**
   - Every place that shows "approved scenarios" must filter `status = 'APPROVED'`. That includes the Analytics M-30 table, the Overview targets and `get_scenario`'s default.
   - Show SC-06 to SC-12 only in a collapsed section, "Other analysed scenarios (not approved)", with their `status_label`.
   - M-30 is unchanged and still returns the three approved headline values.

2. **New analyst tool: `get_dataset`.**
   - Arguments: `dataset_id`, `filter?` (a `{column: value}` object matched with JSONB containment `@>`), `columns?` (pick a subset), `limit ≤ 50`.
   - It reads `ref.dataset_row` **only when `ref.dataset.ai_visible = true`**. Otherwise it returns "not available to the assistant".
   - Every result carries `source_path`, `status`, `record_class` and `source_sha256`. The model must state the status: for example "external research, not pipeline", "frozen model output", or "analysis, not approved".
   - **New tool: `list_datasets`.** Argument: `query?`. Returns the AI-visible datasets (dataset_id, title, status and row_count) so the model can find the right one. List the main ones in the tool description:
     - `market_research.prospect_register` (37 researched companies);
     - `financial_modelling.inventory.b_pricing_summary`;
     - `data_foundation.curated_data.commercial_inventory`;
     - `data_foundation.curated_data.external_benchmarks`;
     - `strategy.resource_allocation.staffing`, `.bets` and `.scenario_capacity`;
     - `strategy.risk_register`;
     - `financial_modelling.scenario_catalogue`;
     - `strategy.d010_approved.out.s7_ranking`.
   - `get_register` also gains the kinds `source` (from source_register) and `benchmark` (from public.benchmark).
   - **System prompt addition:** "Research prospects and benchmarks are external research: never count them as pipeline or forecast. Non-approved scenarios are analysis: never present them as targets."
   - **The answer check** accepts numbers that appear in `get_dataset` results.

3. **New "Researched prospects" view** (Sponsors screen, a second tab next to the sponsor list).
   - A read-only table of the 37 rows in `market_research.prospect_register`: company, category, tier, action, attractiveness, accessibility, route class, value track, cash face value (labelled "face value, not a forecast") and research date.
   - It has filters by action and category, and each row's evidence and sources open in a drawer.
   - Banner: "External research (25 Nov 2026), not pipeline. None of these companies is in the pipeline until added."
   - Each row has an **Add as sponsor** button. It opens the normal create-sponsor form, prefilled with the name, category and city Bengaluru. This is a normal UI write with the usual permission and audit; the research row itself never changes.
   - On a sponsor's own page, the "Research" tab shows the matching prospect row, matched by name and case-insensitive, or "No research on file".

4. **Small fixes found in testing:**
   - In the Allocate receipt drawer, when the sponsor has no payment schedule items, show "No schedule items for this contract — add one first", with a button that opens the Schedule form, instead of an empty dropdown.
   - Rename the app title to "Sponsorship Growth Platform" wherever "latet" or "new" appears.

## Acceptance (label each item LIVE or MOCKED)
1. **LIVE:** Analytics shows 5 approved scenarios in the main table and 7 in the collapsed "not approved" section. M-30 is unchanged (21.23 / 26.10 / 28.64).
2. **LIVE:** "Which researched prospects should we pursue now?" lists the companies whose action is "1 Pursue now" from `get_dataset`, labelled external research, with no pipeline value attached.
3. **LIVE:** "What do other fests ask for a title sponsorship?" uses `benchmark` or `get_dataset`, reports ASK rather than ACTUAL, and cites the source IDs.
4. **LIVE:** "How many person-weeks does the stretch plan need?" uses `strategy.resource_allocation`, and the answer passes the answer check.
5. **MOCKED:** `get_dataset` on `ai_evaluation.chatbot_test_bank` returns "not available to the assistant".
6. **LIVE:** the Researched prospects tab shows 37 rows, 9 of them "1 Pursue now". Add as sponsor on Zerodha opens the prefilled form. After saving, Zerodha's sponsor page shows its research row in the Research tab.
7. tsc clean, build ok, and all tests pass.
8. Re-run the eval gate set and add T-14, T-15, T-16, T-21, T-31, T-32, T-34, T-40 and T-41. Report the pass rate.

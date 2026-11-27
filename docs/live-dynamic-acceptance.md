# Dynamic-data acceptance evidence

## Bugs found and fixed after the initial implementation

- **Opportunity form/API mismatch:** the form supplied amount, owner and starting stage in `initial_stage`; the server previously read only flat amount/owner fields and always inserted Prospecting. The server now accepts both existing flat clients and the nested form, preserves the requested open starting stage, and rejects conflicting duplicate values. The client also sends flat amount/owner fields for compatibility. Confirmed starts still require the separate contract-confirmation workflow.
- **Ignored editable fields:** metadata edits displayed support type and renewal status as editable, but the endpoint previously ignored them. They now persist on unsigned opportunities. Once a contract has been recorded, classification changes are rejected to preserve signed financial evidence.
- **Uploaded-data follow-up routing:** a short follow-up such as “Which row is largest?” inherits the immediately preceding uploaded-data question. A new explicit operational/CRM request leaves that source scope.
- **Uploaded-data ranking:** the dataset tool can sort the complete filtered cohort before limiting, page using `next_offset`, and reject unknown sort columns. This prevents the largest row outside the preview from being missed. Catalogue reads omit full row blobs to reduce free-host memory and transfer costs.

## Completed LIVE run

Run: [45966929579](https://github.com/yashp42/growth-app-risa-/actions/runs/45966929579), on the deployed demo after PR #15 merged. The run used clearly labelled synthetic fixtures in ED-2026-DEMO.

| Check | Result |
|---|---|
| Campaign create → edit → fresh database read | Passed LIVE |
| Sponsor create → edit → fresh database read | Passed LIVE |
| Task create → completed state → fresh database read | Passed LIVE |
| New cash-only opportunity changes canonical open pipeline by its entered value | Passed LIVE |
| Editing its proposed value changes the canonical total by the corresponding amount | Passed LIVE |
| Data version and current cash-outlook inputs refresh | Passed LIVE |
| Custom CSV persists; identical upload returns the same dataset | Passed LIVE |
| Reference CSV amounts remain separate from operational pipeline/cash | Passed LIVE |
| Analyst finds a newly saved campaign and answers its conversational follow-up | Passed LIVE |
| Analyst task proposal does not execute before confirmation | Passed LIVE |
| Confirmed task saves once; replay does not duplicate it | Passed LIVE |
| Operational fixtures soft-cleaned and original pipeline total restored | Passed LIVE |

Four free-model request attempts were used by the bounded Analyst probe. No paid model was introduced. Labelled synthetic CSV reference snapshots and immutable audit history remain; no test receipts, payments or contracts were created.

An earlier interrupted test left a labelled opportunity because the test harness itself sent immutable scope fields in a PATCH body. That request was corrected to put scope in the query. The exact fixture was recovered and a subsequent run verified restoration of the original pipeline total. This is not counted as a passing earlier run.

## How to repeat

`npx tsx scripts/acceptance-dynamic-live.ts --confirm-demo-tests` performs the LIVE data loop without model calls. Add `--with-ai` for the bounded new-record, follow-up and confirmed-action probe. The runner rejects an unexpected identity or scope and only cleans its uniquely named operational fixtures. Read the test script before using it on a shared demo.

## Evidence limits

The LIVE run above tested the deployed PR #15 baseline; the additional opportunity-contract and routing fixes in this PR are covered by new mocked regressions and need deployment for their own LIVE acceptance. A finite smoke suite does not establish universal chatbot accuracy or a completed full evaluation-bank release gate.

The original attached XLSX file could not be materialized in this workspace because its transfer failed with DNS. Actual-original-workbook fidelity is therefore not claimed. Representative/custom CSV parsing, mapping and persistence were tested; spreadsheets currently need CSV export. Uploaded reference data does not silently overwrite historical evidence or become reconciled collected cash.

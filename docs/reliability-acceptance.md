# Reliability acceptance before UI refinement

This checklist distinguishes implemented changes from LIVE acceptance. A CI pass is not a production accuracy claim.

## Bounded scope

| Item | Code coverage | LIVE acceptance |
|---|---|---|
| Activation inventory and pricing | Read-only `get_register(inventory)` over visible commercial inventory and pricing data; source columns/units preserved; no model required for supported questions | Check against source exports and retrieved pricing assumptions |
| Forecast versus actual | Approved scenario records and current M-01 read separately; collected cash remains unknown when non-computable | Compare scenario screen and Collections for the same edition/as-of |
| Prospect caveat | Explicit no-introduction sentence only when the cited research snapshot supports it | Review T-14, T-15, T-16 qualitatively |
| Retrieval | Existing A/B retained; candidate C removes stopwords, expands domain terminology and ranks chunk text; no model requests | Run Retrieval to compare A/B/C. Adopt only the highest measured recall; ties keep the previous preference. pg_trgm remains optional |
| Alternate phrasing and changed data | Regression cases vary question phrasing, scenario values, source prices and current receipts | Ask unfamiliar paraphrases against the deployed database |

## LIVE stopping checklist

1. Deploy the reviewed branch. Keep the existing bank, expected answers, seed data and canonical metrics unchanged.
2. Run Retrieval first. Save its report, including per-case misses and all available variant scores. An unmeasured candidate is not an improvement claim.
3. Start a fresh Gate run. If rate-limited, retain its checkpoint and retry only after the provider reset. Do not repeat runs merely to improve a score.
4. Review `NEEDS_HUMAN` cases. A document citation can be supported by a retrieved child chunk. A receipt-free reference assumption conflicts with a demo edition containing receipts and must be reviewed, never imposed on current data.
5. Complete one browser workflow: ask about an underperforming campaign, inspect current sources, ask a follow-up, propose a reversible demo task, verify no write before confirmation, accept it, reload Tasks and verify persistence/owner/deadline and audit entry. Any analytics-affecting demo change must refresh the relevant server metric after reload. Restore reversible test changes through supported UI actions.
6. Verify one missing-data refusal and one disallowed finance-write request; neither should create a proposal or fabricate a number.
7. Verify the original 2025 dataset remains available, and ask a historical question with explicit edition/date.
8. Inspect the final three-slide PDF: exactly three pages, correct name on slide one, Bengaluru justification, base/stretch model, five ranked strategies, resource/capacity constraints, and scale/change/stop thresholds. Reconcile the PDF, approved strategy and app labels.

## Limits

Free hosted model availability is not unlimited. Direct read plans reduce model use for supported questions; other diagnosis/follow-up/action requests still depend on configured free providers. Changed database fixtures and qualitative reasoning require review. Full release gates remain unchanged; a partial/gate-only report cannot claim release success.

The final strategy deck was not supplied with the latest report; only the assignment PDF was available. Its page count and contents have not been certified. New LIVE checks must run after deployment. The next work after this checklist is UI refinement, followed by final submission checks.

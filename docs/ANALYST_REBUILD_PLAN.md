# Flexible Analyst implementation map

Status: local follow-up fixes are implemented and validated in the mocked suite; production acceptance remains unverified.

## Evidence and starting state

- PR 19 is merged (69435f493016c718289fef06875657f834bddfe5). User reports these failures after deployment; do not attribute them to an old deployment without checking the server revision.
- Local checkout contains existing uncommitted PR 19 changes and untracked work/. Preserve these; establish a clean comparison against remote main before publishing.
- Current AnalystEvidencePlan delegates to bounded intent matchers and checks output headings. It does not execute or repair unmet evidence obligations.
- Operational and analytics branches precede the general model tool loop. Synthesis is an optional paragraph over a predetermined report.
- Historical comparisons compute derived deltas, but the live verifier rejects several figures. Trace the evidence and number normalization before weakening verification.
- Financial classification previously rejected any prompt containing 'mark', including descriptive language about unrankable balances.
- The read-only follow-up path could stop before record lookup; the legacy write path hardcoded 'in 2 days'.
- Optional synthesis checks numbers but not finishReason or sentence completion.

## Implementation progress (2026-11-27)

- Evidence-first domain routes are the default; `ANALYST_FLEXIBLE_INVESTIGATION=true` opts into the broad model-driven tool-planning rollout. Both use the same permission-scoped read/write tools, verifier and scope controls; cache keys include the mode.
- Recognized metrics are retrieved and computed from the selected edition before the LLM explains them. Unclassified questions can use the broader model-driven investigation path. This keeps facts dynamic while allowing natural-language reasoning; it does not store fixed answers to the acceptance prompts.
- Turn budgets increased to six model calls and 32 read/action tool executions. Requests that exceed the read budget receive an explicit instruction to report remaining gaps.
- Text generation rejects provider `length` completions and retries concise responses; tool-plan truncation gets one smaller-plan retry within the same budget. Optional synthesis also rejects a cut-off result.
- Draft-only prompts continue into the read/tool investigation path; the task write tool is withheld unless the user explicitly requests a change. Dates are extracted only when supplied by the user.
- The task proposal path no longer invents a two-day deadline. If a write is explicitly requested but no deadline is supplied or found, it reports the missing date and does not prepare a dated task.
- Opportunity reads support a server-side acquisition-channel filter; task reads can be scoped to a linked record so existing due-date evidence can be checked.
- Cross-edition percentage-point differences are accepted by the numeric verifier only when both are recomputable from same-metric, same-filter numerator/denominator rows from distinct editions.
- D-010 rule reads include experiment sample targets and observed metric numerator/denominator. Threshold bands are withheld as not evaluable when the approved minimum sample is missing or not yet met; presentation normalizes keep/change/escalate to continue/intervene/not yet evaluable.
- “Mark balances that cannot be ranked” no longer suppresses financial analysis; actual record-write requests remain subject to the write policy.
- View changes, like record writes, require a clear user request.
- Route-level mocked tests exercise a channel-scoped draft-only task request, ensure it reads the linked opportunity and withholds the write tool, and validate the sample gate and cross-edition arithmetic. These do not run the live LLM investigation loop.
- The default route now preserves the tested evidence-first planner while the flexible tool-planning path remains opt-in until its end-to-end answer coverage is proven. This was necessary because the default-flexible run skipped required cash/strategy evidence and broke existing provider-independent analytical routes.
- The full scripted suite passes with the default route; lint and production build pass. A build warning remains for Vite's `__dirname` config and large bundle chunks.
- The flexible path currently exposes the existing catalog rather than a newly typed semantic planner. Tool permissions and server validators remain authoritative. Further work is needed to represent requested outcomes and source provenance structurally and validate completeness beyond headings.

## Target request lifecycle

1. Resolve conversation references and explicit edition/as-of scope.
2. Model produces a structured investigation plan: requested outcomes, evidence needs, comparisons, uncertainties, and whether an action draft is requested.
3. Execute validated, permission-scoped read tools. The model can inspect results and request further evidence within an explicit budget. Discover available metrics and definitions before substituting a measure.
4. Calculate ratios, differences, reconciliations and ranking through typed server computations referencing source rows, editions, grains and dates. Preserve missing vs zero.
5. Produce one coherent answer covering each outcome: observation, evidence, calculation, interpretation, limitations and recommendation where requested.
6. Validate claim provenance and scope plus outcome coverage. Repair only unsupported or missing portions using further reads where possible. Preserve valid portions.
7. Build task proposals only from resolved records and user-specified or explicitly accepted scheduling inputs. Require confirmation for execution.
8. Render charts/tables with measure, edition, denominator and as-of labels matching the narrative. Report unavailable providers separately from unavailable business data.

SQL remains the authoritative computation mechanism. Model-driven investigation replaces per-question fixed answer routing. RAG retrieves approved definitions and decisions; it cannot supply missing operational transactions.

## Work packages and acceptance

### A. Request planning and tool orchestration
- Replace regex arbitration as the final decision maker with structured model planning.
- Retain deterministic metric implementations and permission checks as tools.
- Execute every requested facet; separate read-only instructions from mutations semantically.
- Allow adaptive follow-up reads and an explicit stop reason when budget or availability prevents completion.
- Acceptance: unfamiliar paraphrases, compound financial/strategy requests, and follow-ups work without new phrase-specific branches.

### B. Evidence and derived claims
- Introduce evidence identifiers including edition, class, date, grain, filter and source record.
- Register computed percentage-point deltas, rounded rates and reconciliation differences with their input references.
- Validate these computations; do not whitelist arbitrary numbers or relax isolation.
- Acceptance: historical/current tables show numerator/denominator/rate and separate edition provenance; no invented historical cash or causal conclusions.

### C. Complete financial and channel analysis
- Retrieve signed total, cash signed, in-kind, actual receipts and outstanding together when requested.
- Reconcile schedules to balances, flag uncovered amounts, and distinguish no known due date from confirmed not overdue.
- Rank overdue, due-today and future obligations with explicit rationale; separate unknown urgency.
- Discover whether cash attribution by channel exists and retrieve it when valid; otherwise explain the specific attribution gap.
- Acceptance: facts reconcile to source records and every requested measure is supplied or individually explained as unavailable.

### D. Strategy and capacity reasoning
- Retrieve all approved bets and relevant D-009/D-010 definitions.
- Apply timing and minimum-sample gates before thresholds; normalize continue/intervene/not-yet-evaluable.
- Compare capacity alternatives with observed pipeline, accessibility, workload, timing and opportunity cost.
- Clearly distinguish approved model outputs from proposed allocation and guaranteed revenue.
- Acceptance: no mutation refusal for analysis requests and no inferred success from active campaign status.

### E. Conversation and action proposals
- Persist referenced channel, metric, edition and selected records separately from narrative.
- Re-read current evidence for follow-ups and resolve ambiguity.
- Display owner name and ID; validate membership rather than assuming an unusual ID is invalid.
- Never invent a requested deadline. Missing dates require clarification or an explicitly labelled suggestion before acceptance.
- Acceptance: a three-turn diagnosis leads to a uniquely justified proposal; no write before confirmation, and safe revalidation at acceptance.

### F. Generation reliability and UI
- Reject truncated completions and repair within budget; never show an unfinished paragraph as successful synthesis.
- Keep useful verified evidence during provider failure with an honest availability state.
- Label widgets by edition and measure; avoid duplicate unlabeled channel series.
- Acceptance: provider timeout, length limit, partial evidence and verifier rejection have distinct, useful user outcomes.

### G. Verification and delivery
- Add behavior tests across paraphrases, mixed requests, missing/zero data, permission restrictions, date scopes and changed database versions.
- Integration tests must exercise orchestration through actual tool payload shapes, not only intent matching or expected headings.
- Replay user examples against deployed revision with tool traces and inspect every narrative claim.
- Keep implementation handoff updated with completed changes, exact checks, remaining failures and deployment revision.
- Do not declare acceptance from lint/build or mocked tests alone.

## Completion gate

All requested outcomes are answered or precisely bounded by evidence gaps; calculations are reproducible; follow-ups retain scope; action details are grounded; live provider and browser checks are recorded. Broad import requirements from the earlier task remain a separate backlog and are not completed by this Analyst rebuild.

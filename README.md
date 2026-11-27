# Sponsorship Growth Platform

A working growth center for the RISA Labs Growth APM assignment, Challenge B: maximize sponsorship cash collected before a Bengaluru college festival. Dashboard, campaigns, pipeline, tasks, collections and the embedded Growth Analyst use persistent application records.

**Demo:** https://sponsorship-growth-platform.onrender.com

The free host can take about a minute to wake up. Simulated, historical, research and modelled sources are labelled separately. Start with the [reviewer workflow and assignment mapping](docs/chatbot-reliability-and-reviewer-guide.md).

## Architecture and setup

React 19, TypeScript, Vite and Tailwind provide the interface; TanStack Query manages server state. One Node/Express process serves frontend and API. Supabase supplies authentication/PostgreSQL; `pg` and Zod support queries and argument validation. OpenRouter and optional Groq use server-side keys. Voice uses browser speech APIs; no server transcription service is introduced.

Use Node 22.18 or later. Copy `.env.example` to `.env`, configure server-side variables and never commit secrets.

```sh
npm ci
npm run lint
npm run build
npm start
```

Render uses `render.yaml`; health endpoint `/api/health`. The existing demo database is already loaded: **do not rerun seeds**. For a new database, follow the READMEs and prerequisites in `db/`, including schema, grants, adjustments, metrics, reference/historical/demo seeds, knowledge and reference registers. Check `metrics.parity_2025()` and all 30 metric functions.

ED-2025 is historical synthetic and read-only. ED-2026-DEMO is simulated. Preserve original inputs for unfamiliar-question and changed-data tests.

## Financial model and safeguards

Business values come from canonical database functions or approved source rows. The browser and model do not calculate dashboard totals. Cash collected means eligible reconciled and allocated receipts. Signed cash, in-kind, forecasts, research potential and open pipeline remain separate.

D-009/D-010 and checked-in references document the frozen strategy. Do not change metric definitions, historical inputs or approved assumptions to match an answer. Research face values are not forecasts; verified contact routes are not confirmed introductions. Source registers preserve ASK / ACTUAL / COST distinctions.

The browser calls Express, never PostgreSQL or model providers. Verified roles and ownership constrain reads. AI writes remain proposals: only explicit human confirmation executes a permission-checked, actor-bound transaction and audit record. Finance changes, roles, deletion and historical edits retain their existing restrictions.

## Analyst behavior

- Common financial and research reads use server plans without inference. Other questions use business task context, relevant tools and current evidence.
- Prospect recommendations use the visible research register and stored priority index, with route/uncertainty caveats and source approach fields. They do not promote targets into pipeline or forecasts.
- RAG retrieves strategy, definitions and provenance from PostgreSQL knowledge chunks. Current figures use database tools. Follow-up wording can inform retrieval; old answers are not current numeric evidence.
- Numeric checks reject unsupported amounts. Additional structured checks catch specific wrong-sponsor, wrong-metric and operational edition/date errors. They are not proof that every causal or natural-language claim is correct.
- Unsupported explanation is withheld; verified financial facts can still be restated. Missing information is explicit.
- Answer caches include authenticated identity, member, roles, class, edition, date, filters and data version. Only independent first turns reuse answers; hits still persist messages for follow-ups. Identical reads within a turn share a result.

## Free-tier operation

Default provider order is `AI_PROVIDER_ORDER=openrouter_first`; `groq_first` is optional. Explicit OpenRouter `:free` IDs are mandatory. There is no paid/automatic-model fallback or Gemini integration.

OpenRouter's free allowance is shared across free variants; switching models does not multiply it. Request counters are separate from USD credit balances. Failed attempts count conservatively. Unknown quotas remain unknown; provider windows are not added into an invented daily allowance.

Cooldowns avoid repeating failed calls, Retry-After is respected, inference attempts are bounded, output is capped and task-specific tools reduce prompt size. Common deterministic questions continue without model capacity. Free hosting/inference do not guarantee uninterrupted service.

Demo abuse protection allows 60 uncached questions per hour per identity/address; production retains 15. Evaluation has a separate server-authenticated allowance. Greetings and eligible cache hits do not consume it. These application limits differ from provider quotas.

Official constraints: [OpenRouter](https://openrouter.ai/docs/api/reference/limits), [Render](https://render.com/docs/free), [Groq](https://console.groq.com/docs/rate-limits), [Supabase search](https://supabase.com/docs/guides/database/full-text-search).

## Evaluation

```sh
npm run lint
npm run build
npx tsx --test scripts/test*.ts

# LIVE database retrieval, no inference requests
npx tsx scripts/eval-retrieval.ts --write --adopt

# LIVE deployed-demo analyst evaluation
npx tsx scripts/eval-analyst.ts --set=full

# LIVE provider / synthetic tool-selection tasks, at most eight attempts
npx tsx scripts/benchmark-free-models.ts --run
```

Set `EVAL_BASE_URL` for a deployed demo. Admin/coordination-lead users can run evaluation in Team & Settings. The runner never confirms actions: it inspects/cancels proposals, checks operational snapshots, preserves follow-up conversations and pauses on provider failures. Isolated fixtures are not injected into shared data.

API evaluation checkpoints are compressed, actor-bound administrative audit snapshots in PostgreSQL, with local JSON/Markdown exports. Completed measured retrieval comparisons are restored at startup. No migration is required. Restoration failures retain the versioned measured lexical baseline. Already-lost pre-update local-only checkpoints cannot be recovered.

The original 66-question bank, eight extra cases, expected answers, seeds and metrics are unchanged. Retrieval recall is reference coverage, not answer accuracy. Mocked tests are not live accuracy. Release gates require a completed Full run, at least 90% overall and 100% in Permissions, Action execution and Missing information, with qualitative review of subjective criteria.

Current validation evidence is recorded in the pull request. No completed live release-gate score is claimed here. The runtime checkpoint path still needs a deployed database permission smoke check.

## Sources and limitations

Source registers, benchmarks, approved scenarios, metric definitions and original strategy handoffs are in `db/`, `docs/handoff/` and the application's reference catalogue. Follow source paths/checksums for detailed calculations and provenance. Demo data changed during earlier live checks; old screenshots are not authoritative. The immutable reconciled but unallocated test receipt `RC-F4KVVQIB3D` for ₹5,00,000 does not count as collected cash.

Browser speech support varies; recognition may use the browser vendor's service. Lexical retrieval can miss passages: measure candidates before adoption. Structured financial checks cover specific patterns, not arbitrary reasoning. Duplicate/absent fixtures and subjective recommendations require human review.

Submission requires **exactly three strategy slides**, author name on slide one, the working product and this README. The [reviewer guide](docs/chatbot-reliability-and-reviewer-guide.md) maps the demonstration to all six scoring areas.

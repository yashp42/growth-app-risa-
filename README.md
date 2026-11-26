# Sponsorship Growth Platform

A sponsorship operations workspace and Growth Analyst for the RISA Labs Growth APM Challenge B. React, TypeScript and Vite are served by one Express process; Supabase Postgres is the source of business metrics.

## Run locally

Use Node 22.18 or later. Copy `.env.example` to `.env` and configure the server-side variables there. Never commit secrets.

```sh
npm ci
npm run lint
npm run build
npm start
```

Open the address printed by the server. Render uses `render.yaml`; the health endpoint is `/api/health`. First load may take up to a minute (free hosting).

The current lockfile failed `npm ci` in the Windows review environment with missing optional platform-package entries. Dependencies could not be fetched there. GitHub Linux CI subsequently installed dependencies and passed TypeScript and the Vite build. Do not substitute the native syntax check for a type check.

## Database setup

The existing demo database is already loaded: **do not rerun seeds**. For a new database, follow the database READMEs: schema, roles/grants, schema adjustments before dependent metrics, metric functions, reference seed, 2025 historical seed, 2026 simulated seed, knowledge, AI action types, then the five reference-register files. Follow their prerequisites and checksum instructions rather than guessing an order.

Verify `metrics.parity_2025()` returns 32 passing checks and that all 30 metric functions exist. ED-2025 is historical synthetic and immutable; ED-2026-DEMO is simulated. Never blend these classes or reinterpret research prospects as operational pipeline.

## Analyst and safeguards

- The browser calls Express, never the database or model provider. Provider keys remain server-side.
- Business values come from metric functions or verbatim reference rows. Formatting and chart geometry do not aggregate business metrics.
- The model selects tools and block kinds; the server supplies table/chart/KPI data and provenance.
- Numeric prose is checked against this turn's tool results. A draft that still fails verification is withheld, while grounded tables and metric cards remain available.
- AI changes are proposals. Only an explicit human Accept executes them through permission checks, actor-bound transactions and audit records. Finance changes, roles, deletes and historical data remain human-only or forbidden as specified in `CLAUDE.md`.
- `get_dataset` and `list_datasets` read only AI-visible references. Filters use JSONB containment, column projection is validated, and results carry source path, checksum and status. External benchmarks preserve ASK / ACTUAL / COST.
- Microphone metering stays local. Web Speech recognition may use the browser's recognition service; do not describe all voice recognition as guaranteed offline.
- Only configured free-tier model providers are used. Quotas and the existing 15-turn hourly cap can pause evaluation.

## Evaluation

Admin or coordination-lead users can open **Team & Settings → Run evaluation**. Run Retrieval first, then Gate set, then Full. The backend must run in demo mode for analyst evaluation.

The runner never confirms proposals. It inspects stored actions, cancels them, checks operational snapshots, preserves follow-up conversations and checkpoints progress. Resume is available after rate/quota pauses. Cases needing copied databases, duplicate-name fixtures or injected sponsor notes are **NEEDS_HUMAN** and are not injected into shared data. A partial or gate-only run cannot meet the full release gate.

```sh
# LIVE, no model requests; compare both variants and adopt higher recall (ties keep FTS)
node scripts/eval-retrieval.ts --write --adopt

# LIVE; invoke the running server's evaluation API
node scripts/eval-analyst.ts --set=gate
node scripts/eval-analyst.ts --set=full --resume

# MOCKED, no dependencies or credentials needed
node --test scripts/test-stage4-next.ts scripts/test-evaluation.ts

# With dependencies installed: existing regression suites (consult each script for LIVE prerequisites)
npx tsx --test scripts/test*.ts
```

Set `EVAL_BASE_URL` to evaluate a deployed demo service. Reports/checkpoints stay in `eval/results/`, which is ignored by Git. Download CLI reports for durability: Render's free filesystem is ephemeral, so checkpoints and adopted retrieval ranking can be lost on redeploy or restart. Run Retrieval again after redeployment. The evaluator reports when `pg_trgm` is unavailable and keeps FTS.

Recall@6 measures expected references retrieved; precision@6 divides relevant retrieved chunks by six, including empty result slots. Release gates require a completed Full run, at least 90% overall and 100% in Permissions, Action execution and Missing information. Subjective rubric items and isolated fixtures still require human review.

## Demo notes

Demo records changed during earlier LIVE checks, so screenshots and old handoff totals are not a substitute for current queries. The immutable reconciled but unallocated receipt `RC-F4KVVQIB3D` for ₹5,00,000 is a test artefact and does not count as collected cash.

## Validation of this change

- **MOCKED:** 16 new regression checks passed using Node's test runner.
- **MOCKED:** native syntax checks passed for 10 server/script files. This is not a TypeScript type check.
- **MOCKED / GitHub CI:** clean dependency install, TypeScript type checking and Vite build passed on Linux. Local Windows installation remains blocked.
- **MOCKED / GitHub CI:** the first full run passed 119 of 121 checks; the two failures concerned prompt size and safe-fallback wording and are addressed in the follow-up commit. Re-run results must be checked before merge.
- **LIVE:** not run. No new database parity, retrieval comparison, release-gate score, browser performance result or production-deployment success is claimed.

Remaining acceptance work includes the researched-prospects UI, allocation-drawer empty state, complete scenario-view review, orb/browser checks, and all LIVE evaluations. See `docs/handoff/` for their original requirements.

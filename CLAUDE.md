# CLAUDE.md: Sponsorship Growth Platform (handoff for Claude Code)

Read this first. Then read `docs/handoff/` for the stage prompts.

## What this is
This is the product build for Shantanu's **RISA Labs Growth APM take-home, Challenge B**: getting sponsorship cash in before a Bengaluru college fest.
- **Product name:** "Sponsorship Growth Platform". Never "RISA Growth Center".
- **Deadline:** 27 Nov 2026.
- **Stack:**
  - React 19, Vite, TS and Tailwind on the frontend;
  - a Node and Express server (`server.ts`, `server/`), using `pg`, zod and `@supabase/supabase-js`;
  - Supabase Postgres, project ref `mhpyeiggaesdfgzzxwuc` (Mumbai, free plan).
- **History:** built so far in Google AI Studio, which kept hitting its own usage limits. Development continues here.

## Non-negotiable rules
1. **Frozen strategy.** D-009 and D-010 are approved and frozen: base ₹21.2L, plan ₹26.1L and stretch ₹28.6L pre-fest cash (exact values 21.23 / 26.10 / 28.64).
   - Do not change metric IDs, definitions, formulas or denominators.
   - Do not change the 2025 historical dataset (it is read-only in the database).
   - Any material change to the financial model, strategy, data model or canonical metrics needs explicit approval from Shantanu.
2. **Numbers come only from the database's metric functions:** `metrics.get_metric(metric_id, record_class, edition_id, as_of, filters)`, which runs `m_01`…`m_30`. Neither the client nor the LLM computes business numbers. There are no hardcoded dashboard values.
3. **Keep the money types apart.** Cash, in-kind and signed are different; collected cash is reconciled *and* allocated receipts only. Never blend 2025 synthetic data with 2026 simulated data.
4. **Security.**
   - The browser never talks to the database or to an LLM provider.
   - Secrets live only in server environment variables, never in code, commits or the client bundle.
   - Every write runs inside `withActorTransaction`, which binds the verified user through `set_config('app.actor_member_id' / 'app.actor_auth_uid')`. The database checks this with `fn_current_actor()`.
   - No function takes an actor ID parameter.
   - There are no hard deletes, and there is an audit row for every write.
   - The finance tables change only through the SECURITY DEFINER functions.
5. **The LLM never writes to the database directly.**
   - It may only *propose* changes (`ai_action`, 21 operational types). A person must Accept, and only then does the server execute exactly the proposed payload, through the same permission-checked write path, all or nothing, with audit channel `ai_action`.
   - Payments, invoices, receipts, allocation, reconciliation, contract edits, targets, scenarios, rules, roles, deletes and 2025 data are **human-only**.
6. **Honesty.** Never claim a test passed without evidence. Label every test LIVE or MOCKED. Don't silently reconcile conflicting source documents.

## LLM setup (all free; no paid model, ever)
- **Provider chain:**
  1. Groq `openai/gpt-oss-120b` (`GROQ_MODEL`)
  2. Groq `qwen/qwen3.8-27b` (`GROQ_MODEL_FALLBACK`)
  3. OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` (`OPENROUTER_MODEL`); `OPENROUTER_MODEL_FALLBACK=inclusionai/ling-3.2-flash:free`
- **Limits.** OpenRouter's free tier allows about 50 requests a day, and only `:free` IDs are permitted. Groq's free plan allows about 1,000 requests a day per model, 8K tokens a minute and 200K tokens a day, so keep prompts lean.
- **Tools.** Read-only: `get_metric`, `get_series`, `get_scenario` (approved only), `get_register`, `search_knowledge` (Postgres full-text search over `knowledge_chunk`) and `list_records`. Terminal tools: `propose_changes` and `set_view`.
- **Guardrails:**
  - an answer check (every number must appear in a tool result from this turn);
  - temperature 0;
  - "not in the data" instead of guessing;
  - a deterministic intent router for common questions;
  - a deterministic fallback answer when the model-call cap is hit.
- **Voice** uses the browser's Web Speech API only. There must be **no** server transcription endpoint.

## Environment variables (names only; values live in `.env`, which is git-ignored, and in the host's settings)
`DATABASE_URL` (user `app_service.mhpyeiggaesdfgzzxwuc` on the transaction pooler, port 6543), `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or the publishable key), `DEMO_LOGIN_EMAIL`, `DEMO_LOGIN_PASSWORD`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_MODEL_FALLBACK`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_MODEL_FALLBACK`.
- pg: use `ssl: { rejectUnauthorized: false }`, strip `sslmode` from the URL, and use no named prepared statements.
- Demo access: on load, `POST /api/auth/demo` signs the server in to Supabase Auth as the demo user, which is linked to team member `SIM-LEAD` with roles coordination_lead, admin and finance_collections. The client sends Bearer tokens.

## Database (already live in Supabase; do NOT re-run seeds)
- Files `db/01`…`db/09` have been run, in order. `db/08_ai_action_types.sql` widens `ai_action.action_type`.
- `db/09_reference_registers_part1..5of5` added `source_register` (135 rows), `benchmark` (103), and SC-06..12 in `scenario_reference` (status `analysis` or `option`).
- It also added the read-only schema **`ref`**: `ref.dataset` (84 datasets, with record_class, status and `ai_visible`) and `ref.dataset_row` (6,153 rows, JSONB).
- The app role `app_service` has SELECT only on `ref`. The test bank is `ai_visible=false`.
- Health checks: `select count(*) filter (where passed)||' / '||count(*) from metrics.parity_2025();` must return **32 / 32**, and there must be 30 `metrics.m_NN` functions.
- Editions: `ED-2025` is historical_synthetic and read-only. `ED-2026-DEMO` is simulated: week 1 starts 26 Oct 2026, the fest is 9 Jan 2027, and T−7 is 2 Jan 2027.

## Current live values (ED-2026-DEMO, as of 26 Nov 2026), used to check screens
| Measure | Value |
|---|---|
| M-02 signed | ₹8.90L (cash ₹8.65L + in-kind ₹25,000) |
| M-01 collected | ₹2.73L (₹2,72,500) |
| M-07 outstanding | ₹5.92L |
| M-06 collected ÷ signed cash | 31.5% |
| M-21 open pipeline | ₹13.40L |
| W4 (22 Nov) M-08 | ₹4.70L, "below base gate" (base ₹5.10L, plan ₹6.40L) |
| Rules | M-19 60.0%, M-25 42.9%, M-28 7, M-29 9 |
| ED-2025 | M-02 ₹22.4L, 24 confirmed, cash not computable |

- **Bramble Active** was confirmed at ₹1.10L during testing, received ₹50,000, and has ₹60,000 outstanding.
- **Stray test receipt:** RC-F4KVVQIB3D, ₹5,00,000, reconciled but unallocated. It is immutable and does not count. Mention it in the README.
- **Open demo deals for LIVE tests:** Voltyatra O26-012 (proposal_sent) and Minutekart O26-013 (proposal_sent, ₹1,00,000). Kavya Reddy is SIM-PART.

## Where the work stands
| Stage | Status |
|---|---|
| 1A/1B (schema, roles, actor binding), 2 (metrics, seeds, parity), 3A (read path, dashboard), 3B (operational writes), 3C (finance, team) | Done and accepted LIVE |
| 4A analyst core | Accepted LIVE, with one open bug: a metric shortcut inherited a campaign filter and showed ₹80,000 instead of ₹2.73L. A fix was requested in the last AI Studio run; re-verify that a question with no campaign named returns season-wide figures. |
| 4B | Mostly built by AI Studio, but its run ended with an internal error. Start with the **audit** in `docs/handoff/AI_STUDIO_PROMPT_stage4B_finish.md` §A, then finish §B–§E. |

**Known 4B bug to fix.** "Which signed partnerships still have outstanding cash?" failed:
- the receivables query referenced `ct.sponsor_id`, a column that doesn't exist;
- the opportunities list returned 0 rows;
- the model-call cap produced a dead-end message.

Fix it as §B describes: reuse the exact Collections Receivables query.

## Remaining, in order
1. **4B finish:** `docs/handoff/AI_STUDIO_PROMPT_stage4B_finish.md`, sections A–E. The reference is Part 4B in `AI_STUDIO_PROMPT_stage4.md`.
2. **4D:** `docs/handoff/AI_STUDIO_PROMPT_stage4D_orb_ui_and_retrieval.md`. The AnalystOrb UI (Framer Motion, blur and glow, states driven by real events, mic level from a local AnalyserNode, reduced-motion support), table and chart answer blocks built from server data, and `scripts/eval-retrieval.ts`.
3. **4C:** the evaluation runner in Part 4C of `AI_STUDIO_PROMPT_stage4.md`.
   - The test bank is in `eval/`: 66 cases, plus 8 extra cases.
   - Release gates: at least 90% overall, and 100% on Permissions, Action execution and Missing information.
   - Never edit tests to make them pass.
4. **Reference-data add-on:** `docs/handoff/AI_STUDIO_PROMPT_stage4_addon_reference_data.md`. Adds `get_dataset` and `list_datasets`, filters approved scenarios, adds the Researched prospects tab, fixes the allocate-drawer empty state, and renames the leftover "latet" titles.
5. **Deploy on Render** (free web service from GitHub): add `render.yaml`. The build is `npm ci && npm run build`; the start command runs the Express server with `PORT` from the environment; the health check path is `/api/health`. Set the environment variables in Render. Note in the README: "first load may take up to a minute (free hosting)".
6. **README product section:** setup, the database load order and checks, environment variable names, how the analyst works and its guardrails, free-tier limits, the demo-data notes and the test results.

## Working method
- Small commits.
- Run `npx tsc --noEmit`, `npm run build` and the test scripts in `scripts/` before every commit.
- LIVE checks need a local `.env` (never commit it). Without one, say MOCKED.
- Before claiming any LIVE result, show the raw output.

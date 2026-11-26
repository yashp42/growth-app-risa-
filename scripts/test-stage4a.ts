import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import type { Pool, PoolClient } from 'pg';
import type { AuthDependencies } from '../server/auth.ts';
import {
  DEFAULT_OPENROUTER_MODEL_FALLBACK,
  DEFAULT_OPENROUTER_MODEL_PRIMARY,
  loadServerConfig,
  type ServerConfig,
} from '../server/config.ts';
import type { DatabasePoolState } from '../server/db.ts';
import { apiErrorHandler } from '../server/errors.ts';
import { verifyAnswerNumbers } from '../server/llm/answerCheck.ts';
import {
  createOpenRouterClient,
  QUOTA_EXHAUSTED_MESSAGE,
} from '../server/llm/openrouter.ts';
import {
  createToolAccumulator,
  executeSearchKnowledge,
} from '../server/llm/tools.ts';
import type { CanonicalRole } from '../server/permissions.ts';
import { createAiApiRouter } from '../server/routes/aiApi.ts';
import { createFoundationApiRouter } from '../server/routes/foundation.ts';

function createBaseConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 3000,
    nodeEnv: 'test',
    appEnv: 'demo',
    editionIdDefault: 'ED-2026-DEMO',
    databaseUrl: 'postgres://mock:mock@127.0.0.1:5432/mock',
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'sb_publishable_test_key',
    openrouterApiKey: 'sk-or-v1-mock-key',
    openrouterModel: DEFAULT_OPENROUTER_MODEL_PRIMARY,
    openrouterModelFallback: DEFAULT_OPENROUTER_MODEL_FALLBACK,
    demoLoginEmail: null,
    demoLoginPassword: null,
    validationErrors: [],
    validationWarnings: [],
    readiness: {
      databaseConfigured: true,
      authConfigured: true,
      demoLoginEnabled: false,
      openrouterKeyConfigured: true,
      openrouterModelConfigured: true,
      openrouterFreeTierValid: true,
      openrouterFallbackValid: true,
      paidFallbackAllowed: false,
      autoRoutingAllowed: false,
    },
    ...overrides,
  };
}

interface MockAiStore {
  dataVersion: number;
  actorMemberId: string;
  actorAuthUid: string;
  roles: CanonicalRole[];
  importBatches: Map<string, Record<string, unknown>>;
  conversations: Map<string, Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  queryLogs: Map<string, Record<string, unknown>>;
  feedback: Array<Record<string, unknown>>;
  setConfigCalls: Array<{ key: string; value: string }>;
  knowledgeChunks: Array<{
    chunk_id: string;
    doc_id: string;
    document_title: string;
    section: string;
    citation_location: string;
    decision_status: string;
    retrieval_rule: string;
    evidence_class: string;
    related_bet: string;
    related_kpi: string;
    record_class: string;
    text: string;
  }>;
}

function createMockStore(): MockAiStore {
  return {
    dataVersion: 7,
    actorMemberId: 'TM-LEAD-01',
    actorAuthUid: 'auth-lead-01',
    roles: ['coordination_lead'],
    importBatches: new Map(),
    conversations: new Map(),
    messages: [],
    queryLogs: new Map(),
    feedback: [],
    setConfigCalls: [],
    knowledgeChunks: [
      {
        chunk_id: 'KB-15.1',
        doc_id: 'DOC-08',
        document_title: 'D-009 Approved Sponsorship Baseline & Scenarios',
        section: 'Scenario Target Summary',
        citation_location: '08_D009_approved_baseline.md §2',
        decision_status: 'approved',
        retrieval_rule: 'default',
        evidence_class: 'T',
        related_bet: 'All',
        related_kpi: 'K-P-01',
        record_class: 'operating_plan',
        text: 'D-009 freezes Base scenario SC-01 expected cash target at ₹21.23L (₹21.2L) and Plan SC-02 at ₹26.1L by T-0.',
      },
      {
        chunk_id: 'KB-99.1',
        doc_id: 'DOC-07',
        document_title: 'Legacy Pre-D009 Historical Worksheet',
        section: 'Superseded Baseline',
        citation_location: '07_legacy.md §1',
        decision_status: 'superseded',
        retrieval_rule: 'contradiction_and_history_only',
        evidence_class: 'H',
        related_bet: 'All',
        related_kpi: 'K-P-01',
        record_class: 'operating_plan',
        text: 'Historical pre-D009 draft assumed ₹55.9L stretch / ₹26.1L base before decision D-009 set SC-01 Base to ₹21.23L and SC-02 Plan to ₹26.1L.',
      },
    ],
  };
}

function createMockDbState(store: MockAiStore): DatabasePoolState {
  const runSql = async (
    rawSql: string,
    params: unknown[] = []
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();

    if (sql.includes("set_config('app.")) {
      store.setConfigCalls.push({
        key: String(params[0] ?? ''),
        value: String(params[1] ?? ''),
      });
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('SELECT data_version FROM public.app_state')) {
      return { rows: [{ data_version: store.dataVersion }], rowCount: 1 };
    }

    if (sql.includes('FROM information_schema.tables')) {
      return {
        rows: [{ table_name: 'team_member' }, { table_name: 'role_assignment' }],
        rowCount: 2,
      };
    }

    if (sql.includes('FROM information_schema.columns')) {
      return {
        rows: [
          { table_name: 'team_member', column_name: 'member_id' },
          { table_name: 'team_member', column_name: 'auth_user_id' },
          { table_name: 'team_member', column_name: 'email' },
          { table_name: 'team_member', column_name: 'is_active' },
          { table_name: 'team_member', column_name: 'is_deleted' },
          { table_name: 'role_assignment', column_name: 'member_id' },
          { table_name: 'role_assignment', column_name: 'role' },
          { table_name: 'role_assignment', column_name: 'edition_id' },
          { table_name: 'role_assignment', column_name: 'is_current' },
          { table_name: 'role_assignment', column_name: 'valid_to' },
          { table_name: 'role_assignment', column_name: 'is_deleted' },
        ],
        rowCount: 11,
      };
    }

    if (sql.includes('FROM public.team_member') && sql.includes('auth_user_id')) {
      return {
        rows: [
          {
            member_id: store.actorMemberId,
            full_name: 'Riya Lead',
            email: 'lead@campusfest.in',
            is_active: true,
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM public.role_assignment')) {
      return {
        rows: store.roles.map((r) => ({ role: r })),
        rowCount: store.roles.length,
      };
    }

    if (sql.includes('FROM public.festival_edition')) {
      const requested = String(params[0] ?? 'ED-2026-DEMO');
      if (requested === 'ED-2025') {
        return {
          rows: [
            {
              edition_id: 'ED-2025',
              name: 'CampusFest 2025',
              record_class: 'historical_synthetic',
              season_start: '2025-02-01',
              preseason_start: '2025-01-15',
              starts_at: '2025-04-20T09:00:00+05:30',
              is_current: false,
            },
          ],
          rowCount: 1,
        };
      }
      return {
        rows: [
          {
            edition_id: 'ED-2026-DEMO',
            name: 'Demo season 2026-27',
            record_class: 'simulated',
            season_start: '2026-09-14',
            preseason_start: '2026-08-17',
            starts_at: '2026-11-23T09:00:00+05:30',
            is_current: true,
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM public.campaign c')) return {rows:[{campaign_id:'C-MOCK',name:'Mock campaign'}],rowCount:1};
    if (sql.includes('metrics.get_metric(')) {
      const metricId = String(params[0] ?? '');
      const recordClass = String(params[1] ?? 'simulated');
      const editionId = String(params[2] ?? 'ED-2026-DEMO');
      const asOf = String(params[3] ?? '2026-10-20');

      if (metricId === 'M-13') return {rows:[{metric_id:metricId,value:0.4,unit:'ratio',numerator:2,denominator:5,computable:true,reason:null,applied_filters:JSON.parse(String(params[4]??'{}')),record_class:recordClass,edition_id:editionId,as_of:asOf,data_version:store.dataVersion,definition_version:'1.0',series_key:null}],rowCount:1};
      if (editionId === 'ED-2025' && metricId === 'M-02') {
        return {
          rows: [
            {
              metric_id: 'M-02',
              value: 2240000,
              unit: '₹',
              numerator: 2240000,
              denominator: null,
              computable: true,
              reason: null,
              applied_filters: {},
              record_class: 'historical_synthetic',
              as_of: '2025-04-20',
              data_version: store.dataVersion,
              definition_version: '1.0',
              series_key: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (editionId === 'ED-2025' && metricId === 'M-01') {
        return {
          rows: [
            {
              metric_id: 'M-01',
              value: null,
              unit: '₹',
              numerator: null,
              denominator: null,
              computable: false,
              reason:
                'Synthetic 2025 historical dataset models signed agreements without a reconciled receipt ledger.',
              applied_filters: {},
              record_class: 'historical_synthetic',
              as_of: '2025-04-20',
              data_version: store.dataVersion,
              definition_version: '1.0',
              series_key: null,
            },
          ],
          rowCount: 1,
        };
      }

      return {
        rows: [
          {
            metric_id: metricId,
            value: metricId === 'M-02' ? 1450000 : 1120000,
            unit: '₹',
            numerator: null,
            denominator: null,
            computable: true,
            reason: null,
            applied_filters: {},
            record_class: recordClass,
            as_of: asOf,
            data_version: store.dataVersion,
            definition_version: '1.0',
            series_key: null,
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM public.scenario_reference')) {
      const allScenarios = [
        {
          scenario_id: 'SC-01',
          name: 'Base',
          status: 'APPROVED',
          expected_cash: 21.23,
          p10: 15,
          p50: 21.1,
          p90: 27.5,
          decision_id: 'D-009',
          notes: 'Approved base scenario target (SC-01 = ₹21.23L)',
        },
        {
          scenario_id: 'SC-02',
          name: 'Plan',
          status: 'APPROVED',
          expected_cash: 26.1,
          p10: 17.9,
          p50: 26,
          p90: 34.6,
          decision_id: 'D-009',
          notes: 'Approved plan scenario target (SC-02 = ₹26.1L)',
        },
        {
          scenario_id: 'SC-06',
          name: 'Unapproved Option',
          status: 'option',
          expected_cash: 31.0,
          p10: 20,
          p50: 31,
          p90: 40,
          decision_id: null,
          notes: 'Not approved option row',
        },
      ];
      const approvedOnly = sql.includes("UPPER(status) = 'APPROVED'");
      const filtered = approvedOnly
        ? allScenarios.filter((s) => s.status.toUpperCase() === 'APPROVED')
        : allScenarios;
      return { rows: filtered, rowCount: filtered.length };
    }

    if (sql.includes('FROM public.knowledge_chunk')) {
      const qRaw = String(params[0] ?? '');
      const includeHistory = !sql.includes("retrieval_rule <> 'contradiction_and_history_only'");
      const isOrMode = /\bOR\b/.test(qRaw);
      const terms = qRaw
        .split(/\bOR\b|\s+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2);

      const matches = store.knowledgeChunks
        .filter((c) => {
          if (!includeHistory && c.retrieval_rule === 'contradiction_and_history_only') {
            return false;
          }
          const haystack = `${c.document_title} ${c.section} ${c.text}`.toLowerCase();
          if (terms.length === 0) return false;
          return isOrMode
            ? terms.some((t) => haystack.includes(t))
            : terms.every((t) => haystack.includes(t));
        })
        .map((c) => ({
          ...c,
          base_rank: 0.25,
        }));
      return { rows: matches, rowCount: matches.length };
    }

    if (sql.includes('INSERT INTO public.import_batch')) {
      store.importBatches.set(String(params[0]), { batch_id: params[0] });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO public.ai_conversation')) {
      store.conversations.set(String(params[0]), {
        conversation_id: params[0],
        member_id: params[1],
        edition_id: params[2],
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('SELECT COALESCE(MAX(turn_index), 0) AS max_turn')) {
      const convId = String(params[0]);
      const count = store.messages.filter((m) => m.conversation_id === convId).length;
      return { rows: [{ max_turn: count }], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO public.ai_message')) {
      store.messages.push({
        message_id: params[0],
        conversation_id: params[1],
        turn_index: params[2],
        role: sql.includes("'user'") ? 'user' : 'assistant',
        content: params[3],
        source_ref: sql.includes('ui:growth_analyst_feedback')
          ? 'ui:growth_analyst_feedback'
          : 'ui:growth_analyst',
        created_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO public.ai_query_log')) {
      store.queryLogs.set(String(params[0]), {
        query_id: params[0],
        conversation_id: params[1],
        member_id: params[2],
        question: params[3],
        route: params[4],
        answer: params[8],
        answer_check_passed: params[9],
        record_class: 'simulated',
        edition_id: 'ED-2026-DEMO',
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('FROM public.ai_query_log') && sql.includes('WHERE q.query_id = $1')) {
      const qid = String(params[0]);
      const row = store.queryLogs.get(qid);
      return {
        rows: row
          ? [
              {
                query_id: row.query_id,
                conversation_id: row.conversation_id,
                record_class: row.record_class ?? 'simulated',
                edition_id: row.edition_id ?? 'ED-2026-DEMO',
              },
            ]
          : [],
        rowCount: row ? 1 : 0,
      };
    }

    return { rows: [], rowCount: 0 };
  };

  const client = {
    query: runSql,
    release: () => undefined,
  } as unknown as PoolClient;

  const pool = {
    query: runSql,
    connect: async () => client,
  } as unknown as Pool;

  return {
    pool,
    configured: true,
    initErrorCode: null,
  };
}

function createAuthDeps(
  store: MockAiStore,
  dbState: DatabasePoolState
): AuthDependencies {
  return {
    supabaseClient: {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: store.actorAuthUid,
              email: 'lead@campusfest.in',
              email_confirmed_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      },
    } as unknown as AuthDependencies['supabaseClient'],
    authConfigured: true,
    dbState,
    defaultEditionId: 'ED-2026-DEMO',
  };
}

async function startServer(app: express.Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

// ============================================================================
// 1. LIVE Test: OpenRouter /models public catalog check
// ============================================================================
test('[LIVE] OpenRouter /models catalog verifies both :free models exist with zero pricing & tools support', async () => {
  const config = createBaseConfig({ openrouterApiKey: null });
  const client = createOpenRouterClient(config, { startBackgroundRefresh: false });
  const verification = await client.verifyModels();
  client.stop();

  assert.equal(verification.free_tier_verified, true, verification.error ?? undefined);
  assert.equal(verification.tools_supported, true, verification.error ?? undefined);
  assert.equal(verification.fallback_verified, true, verification.error ?? undefined);
  assert.equal(verification.primary_check?.freePricing, true);
  assert.equal(verification.fallback_check?.freePricing, true);
});

// ============================================================================
// 2. MOCKED Tests: Policy enforcement, fallback, Answer Check, Search, Cache, Quota, Cap
// ============================================================================
test('[MOCKED] Startup rejects non-:free model or openrouter/auto and reports in /api/admin/health', async () => {
  const origPrimary = process.env.OPENROUTER_MODEL;
  const origFallback = process.env.OPENROUTER_MODEL_FALLBACK;
  try {
    process.env.OPENROUTER_MODEL = 'openai/gpt-4o';
    process.env.OPENROUTER_MODEL_FALLBACK = 'openrouter/auto';
    const badConfig = loadServerConfig();
    assert.equal(badConfig.readiness.openrouterFreeTierValid, false);
    assert.equal(badConfig.readiness.openrouterFallbackValid, false);
    assert.ok(badConfig.validationErrors.some((e) => e.includes(':free')));

    const client = createOpenRouterClient(badConfig, { startBackgroundRefresh: false });
    const health = await client.getHealthSnapshot(false);
    assert.equal(health.free_tier_verified, false);
    assert.equal(health.fallback_verified, false);
    await assert.rejects(
      () =>
        client.createChatCompletion({
          messages: [{ role: 'user', content: 'hi' }],
        }),
      /policy/i
    );
    client.stop();
  } finally {
    if (origPrimary === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = origPrimary;
    if (origFallback === undefined) delete process.env.OPENROUTER_MODEL_FALLBACK;
    else process.env.OPENROUTER_MODEL_FALLBACK = origFallback;
  }
});

test('[MOCKED] OpenRouter client tries fallback once on 429 and never sends models[] or openrouter/auto', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/key')) {
      return new Response(
        JSON.stringify({ data: { limit: 50, free_model_daily_requests: { limit: 50, remaining: 40 }, usage_daily: 10 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/chat/completions')) {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push({ url, body: parsed });
      assert.equal('models' in parsed, false, 'Must NEVER send models array');
      assert.notEqual(parsed.model, 'openrouter/auto');
      if (requests.length === 1) {
        return new Response('Rate limited', { status: 429 });
      }
      return new Response(
        JSON.stringify({
          model: DEFAULT_OPENROUTER_MODEL_FALLBACK,
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Ok.' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  const client = createOpenRouterClient(createBaseConfig(), {
    fetchFn: mockFetch,
    startBackgroundRefresh: false,
  });
  const res = await client.createChatCompletion({
    messages: [{ role: 'user', content: 'Test' }],
    tools: [],
  });
  client.stop();

  assert.equal(res.usedFallback, true);
  assert.equal(res.model, DEFAULT_OPENROUTER_MODEL_FALLBACK);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.model, DEFAULT_OPENROUTER_MODEL_PRIMARY);
  assert.equal(requests[1].body.model, DEFAULT_OPENROUTER_MODEL_FALLBACK);
});

test('[MOCKED] search_knowledge retries with OR when strict < 2 chunks and ranks document_title matches higher', async () => {
  const store = createMockStore();
  store.knowledgeChunks.push(
    {
      chunk_id: 'KB-15.2',
      doc_id: 'DOC-09',
      document_title: 'Weekly Channel Notes',
      section: 'Cold Outreach',
      citation_location: '09_notes.md §1',
      decision_status: 'approved',
      retrieval_rule: 'default',
      evidence_class: 'T',
      related_bet: 'B1',
      related_kpi: 'K-L-01',
      record_class: 'operating_plan',
      text: 'This section briefly mentions review pacing.',
    },
    {
      chunk_id: 'KB-15.3',
      doc_id: 'DOC-10',
      document_title: 'Approved Base Target Review',
      section: 'Targets',
      citation_location: '10_targets.md §1',
      decision_status: 'approved',
      retrieval_rule: 'default',
      evidence_class: 'T',
      related_bet: 'All',
      related_kpi: 'K-P-01',
      record_class: 'operating_plan',
      text: 'Baseline review document.',
    }
  );
  const dbState = createMockDbState(store);
  const acc = createToolAccumulator();
  // Strict AND search for "Approved Base Review UnmatchedToken" yields 0 (< 2), triggers OR fallback
  const out = await executeSearchKnowledge(
    dbState.pool!,
    { query: 'Approved Base Review UnmatchedToken', include_history: false },
    store.dataVersion,
    acc
  );

  assert.equal(out.used_or_fallback, true);
  const chunks = out.chunks as Array<{ chunk_id: string }>;
  assert.ok(chunks.length >= 2);
  // Both KB-15.1 and KB-15.3 have title matches and rank above KB-15.2 (0 title hits)
  const idx15_3 = chunks.findIndex((c) => c.chunk_id === 'KB-15.3');
  const idx15_2 = chunks.findIndex((c) => c.chunk_id === 'KB-15.2');
  assert.ok(idx15_3 !== -1 && idx15_2 !== -1 && idx15_3 < idx15_2);
});

test('[MOCKED] Answer Check catches fabricated ₹99L, ignores years/IDs/week labels, and retries + warns', () => {
  const okCheck = verifyAnswerNumbers(
    'In ED-2025, W6 signed value was ₹22.4L [M-02] with 2025 historical context.',
    {
      toolResults: [{ metric_id: 'M-02', value: 2240000, computable: true }],
      knowledgeTexts: [],
      userQuestion: 'How much did we sign in 2025?',
    }
  );
  assert.equal(okCheck.passed, true);

  const badCheck = verifyAnswerNumbers(
    'Signed value was ₹99L in 2025 [M-02].',
    {
      toolResults: [{ metric_id: 'M-02', value: 2240000, computable: true }],
      knowledgeTexts: [],
      userQuestion: 'How much did we sign in 2025?',
    }
  );
  assert.equal(badCheck.passed, false);
  assert.ok(badCheck.ungroundedClaims.some((c) => c.raw.includes('99')));
  assert.ok(badCheck.warningMessage?.includes('₹99L'));
});

test('[MOCKED] /api/ai/ask end-to-end: 2025 signed vs non-computable M-01, T-55 KB history, Answer Check retry, cache, 60/hr demo cap, quota exhausted, health', async () => {
  const store = createMockStore();
  const dbState = createMockDbState(store);
  const config = createBaseConfig();
  let llmCallCount = 0;
  let quotaRemaining = 50;

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: DEFAULT_OPENROUTER_MODEL_PRIMARY,
              pricing: { prompt: '0', completion: '0' },
              supported_parameters: ['tools', 'reasoning'],
            },
            {
              id: DEFAULT_OPENROUTER_MODEL_FALLBACK,
              pricing: { prompt: '0', completion: '0' },
              supported_parameters: ['tools', 'reasoning'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/key')) {
      return new Response(
        JSON.stringify({
          data: {
            limit: 50,
            free_model_daily_requests: { limit: 50, remaining: quotaRemaining },
            usage_daily: 50 - quotaRemaining,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/chat/completions')) {
      llmCallCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages: Array<{ role: string; content: string }>;
      };
      const lastMsg = body.messages[body.messages.length - 1];
      const userPrompt = body.messages.find((m) => m.role === 'user')?.content ?? '';

      // Tool-calling turn 1
      if (lastMsg.role === 'user' && !lastMsg.content.startsWith('Verification failed')) {
        if (
          userPrompt.includes('collect in 2025') ||
          userPrompt.includes('collected in 2025')
        ) {
          return new Response(
            JSON.stringify({
              model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'tc-1',
                        type: 'function',
                        function: {
                          name: 'get_metric',
                          arguments: JSON.stringify({ metric_id: 'M-01', edition_id: 'ED-2025' }),
                        },
                      },
                      {
                        id: 'tc-2',
                        type: 'function',
                        function: {
                          name: 'get_metric',
                          arguments: JSON.stringify({ metric_id: 'M-02', edition_id: 'ED-2025' }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (userPrompt.includes('T-55')) {
          return new Response(
            JSON.stringify({
              model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'tc-sc',
                        type: 'function',
                        function: {
                          name: 'get_scenario',
                          arguments: JSON.stringify({ scenario_id: 'SC-01' }),
                        },
                      },
                      {
                        id: 'tc-kb',
                        type: 'function',
                        function: {
                          name: 'search_knowledge',
                          arguments: JSON.stringify({ query: 'T-55 base target', include_history: true }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (userPrompt.includes('fabricate')) {
          return new Response(
            JSON.stringify({
              model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'tc-fab',
                        type: 'function',
                        function: {
                          name: 'get_metric',
                          arguments: JSON.stringify({ metric_id: 'M-02' }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      // Retry check: still returns ₹99L so server must attach warning!
      if (lastMsg.content.startsWith('Verification failed')) {
        return new Response(
          JSON.stringify({
            model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'Unverified claim ₹99L.' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Synthesis turn
      if (
        userPrompt.includes('collect in 2025') ||
        userPrompt.includes('collected in 2025')
      ) {
        return new Response(
          JSON.stringify({
            model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content:
                    'Cash collected [M-01] is not computable for ED-2025: Synthetic 2025 historical dataset models signed agreements without a reconciled receipt ledger. Signed value [M-02] in ED-2025 was ₹22.4L.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (userPrompt.includes('T-55')) {
        return new Response(
          JSON.stringify({
            model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content:
                    'Approved D-009 sets Base SC-01 at ₹21.23L and Plan SC-02 at ₹26.1L [SC-01] [SC-02] [KB-15.1] (prior ₹55.9L draft was superseded [KB-99.1]).',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (userPrompt.includes('fabricate')) {
        return new Response(
          JSON.stringify({
            model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'Signed value is ₹99L [M-02].' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          model: DEFAULT_OPENROUTER_MODEL_PRIMARY,
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Acknowledged.' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  };

  const openrouter = createOpenRouterClient(config, {
    fetchFn: mockFetch,
    startBackgroundRefresh: false,
  });
  await openrouter.verifyModels();

  const app = express();
  app.use(express.json());
  const authDeps = createAuthDeps(store, dbState);
  const { router: aiRouter } = createAiApiRouter(config, dbState, authDeps, {
    openrouter,
  });
  app.use('/api', aiRouter);
  app.use(
    '/api',
    createFoundationApiRouter(config, dbState, authDeps, async () =>
      (await openrouter.getHealthSnapshot(false)) as unknown as Record<string, unknown>
    )
  );
  app.use(apiErrorHandler);

  const srv = await startServer(app);
  try {
    // 1. Health includes verified llm block
    const hRes = await fetch(`${srv.baseUrl}/api/admin/health`);
    const health = (await hRes.json()) as { llm: Record<string, unknown> };
    assert.equal(health.llm.free_tier_verified, true);
    assert.equal(health.llm.tools_supported, true);
    assert.equal(health.llm.fallback_verified, true);

    // 2. 2025 collected vs signed
    const r2025 = await fetch(`${srv.baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        question: 'How much cash did we collect in 2025?',
        edition_id: 'ED-2025',
        as_of: '2025-04-20',
      }),
    });
    assert.equal(r2025.status, 200);
    const d2025 = (await r2025.json()) as Record<string, unknown>;
    assert.match(String(d2025.answer), /not computable/i);
    assert.match(String(d2025.answer), /₹22\.4L/);
    assert.equal(d2025.answer_check_passed, true);
    assert.equal(d2025.cached, false);

    // 3. Repeat same question -> hits answer cache with 0 LLM calls!
    const callsBeforeCache = llmCallCount;
    const r2025Cached = await fetch(`${srv.baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        question: 'How much cash did we collect in 2025?',
        edition_id: 'ED-2025',
        as_of: '2025-04-20',
      }),
    });
    const dCached = (await r2025Cached.json()) as Record<string, unknown>;
    assert.equal(dCached.cached, true);
    assert.equal(llmCallCount, callsBeforeCache);

    // 4. T-55 KB history query
    const rT55 = await fetch(`${srv.baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        question: 'What was T-55 before D-009?',
        edition_id: 'ED-2026-DEMO',
        as_of: '2026-10-20',
      }),
    });
    const dT55 = (await rT55.json()) as Record<string, unknown>;
    assert.match(String(dT55.answer), /₹21\.23L/);
    assert.match(String(dT55.answer), /₹26\.1L/);
    assert.match(String(dT55.answer), /SC-01/);
    assert.match(String(dT55.answer), /KB-15\.1/);

    // 5. Answer Check catches ₹99L, retries, attaches warning
    const rFab = await fetch(`${srv.baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        question: 'Please fabricate signed value',
        edition_id: 'ED-2026-DEMO',
        as_of: '2026-10-20',
      }),
    });
    const dFab = (await rFab.json()) as Record<string, unknown>;
    assert.equal(dFab.answer_check_passed, false);
    assert.equal(dFab.answer_check_status, 'unverified');
    assert.match(String(dFab.answer), /withheld/);
    assert.doesNotMatch(String(dFab.answer), /99L/);

    // 6. Feedback submission (append-only ai_message)
    const fbRes = await fetch(`${srv.baseUrl}/api/ai/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ query_id: dT55.query_id, rating: 'up' }),
    });
    assert.equal(fbRes.status, 200);
    assert.ok(
      store.messages.some(
        (m) =>
          m.source_ref === 'ui:growth_analyst_feedback' &&
          String(m.content).includes(String(dT55.query_id))
      ),
      'Expected feedback persisted via append-only ai_message'
    );

    // 7. Quota exhausted -> returns reset message without calling model
    quotaRemaining = 0;
    await openrouter.fetchQuota(true);
    const callsBeforeExhausted = llmCallCount;
    const rExh = await fetch(`${srv.baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        question: 'Unique quota check query',
        edition_id: 'ED-2026-DEMO',
        as_of: '2026-10-20',
      }),
    });
    const dExh = (await rExh.json()) as Record<string, unknown>;
    assert.equal(dExh.answer, QUOTA_EXHAUSTED_MESSAGE);
    assert.equal(llmCallCount, callsBeforeExhausted);

    // 8. Demo reviewers have 60 turns/hr; evaluation has a separate private bucket.
    quotaRemaining = 50;
    await openrouter.fetchQuota(true);
    let saw429 = false;
    for (let i = 0; i < 61; i += 1) {
      const rLoop = await fetch(`${srv.baseUrl}/api/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({
          question: `Cap test question #${i}`,
          edition_id: 'ED-2026-DEMO',
          as_of: '2026-10-20',
        }),
      });
      if (rLoop.status === 429) {
        saw429 = true;
        break;
      }
    }
    assert.equal(saw429, true, 'Expected 429 once 60 demo turns/hour exceeded');
    const callsBeforeGreeting=llmCallCount;
    const hello=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question:'hello',edition_id:'ED-2026-DEMO',as_of:'2026-10-20'})});
    assert.equal(hello.status,200);assert.match(String((await hello.json()).answer),/^Hi!/);assert.equal(llmCallCount,callsBeforeGreeting);
  } finally {
    openrouter.stop();
    await srv.close();
  }
});


test('[MOCKED] answer-only provider tool-protocol failures fall back without executing generated calls', async () => {
  const requests: Record<string, unknown>[]=[];
  const mockFetch:typeof fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/key'))return new Response(JSON.stringify({data:{limit:50,free_model_daily_requests: { limit: 50, remaining: 40 }}}),{status:200});
    if(url.endsWith('/chat/completions')){
      const payload=JSON.parse(String(init?.body));requests.push(payload);
      assert.equal('tools' in payload,false);
      assert.match(payload.messages.find((m:any)=>m.role==='system').content,/ANSWER-ONLY STEP/);
      if(requests.length===1)return new Response(JSON.stringify({error:{message:'Tool choice is none, but model called a tool',code:'tool_use_failed'}}),{status:400});
      return new Response(JSON.stringify({model:DEFAULT_OPENROUTER_MODEL_FALLBACK,choices:[{message:{role:'assistant',content:'Verified answer.'}}]}),{status:200});
    }
    return new Response(JSON.stringify({data:[]}),{status:200});
  };
  const client=createOpenRouterClient(createBaseConfig(),{fetchFn:mockFetch,startBackgroundRefresh:false});
  try{
    const result=await client.createChatCompletion({messages:[{role:'user',content:'Summarise the supplied results.'}]});
    assert.equal(requests.length,2);assert.equal(result.usedFallback,true);assert.equal(result.message.content,'Verified answer.');
  }finally{client.stop();}
});

test('[MOCKED] OpenRouter-first uses both configured free models before Groq and honors free counters with zero credits',async()=>{
  const calls:string[]=[];
  const client=createOpenRouterClient(createBaseConfig({aiProviderOrder:'openrouter_first',groqApiKey:'gsk-mock'}),{startBackgroundRefresh:false,fetchFn:async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/key'))return new Response(JSON.stringify({data:{limit:0,limit_remaining:0,free_model_daily_requests:{limit:50,used:0,remaining:50}}}),{status:200});
    if(url.endsWith('/chat/completions')){const req=JSON.parse(String(init?.body));calls.push(url+' '+req.model);
      if(calls.length===1)return new Response('rate limited',{status:429});
      return new Response(JSON.stringify({model:req.model,choices:[{message:{role:'assistant',content:'OK'}}]}),{status:200});}
    return new Response(JSON.stringify({data:[]}),{status:200});
  }});
  try{const result=await client.createChatCompletion({messages:[{role:'user',content:'Summarise'}]});assert.equal(result.provider,'openrouter');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.startsWith('https://openrouter.ai/')));assert.ok(calls[0].endsWith(DEFAULT_OPENROUTER_MODEL_PRIMARY));assert.ok(calls[1].endsWith(DEFAULT_OPENROUTER_MODEL_FALLBACK));}finally{client.stop();}
});

test('[MOCKED] signed analytics bypass model quota and retain permission-checked metric traces',async()=>{
 const store=createMockStore();const dbState=createMockDbState(store);let modelCalls=0;
 const client=createOpenRouterClient(createBaseConfig(),{startBackgroundRefresh:false,fetchFn:async(input)=>{
  if(String(input).endsWith('/chat/completions')){modelCalls++;throw Error('No model may be called');}
  return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,used:50,remaining:0}}}),{status:200});
 }});
 const app=express();app.use(express.json());app.use('/api',createAiApiRouter(createBaseConfig(),dbState,createAuthDeps(store,dbState),{openrouter:client}).router);app.use(apiErrorHandler);
 const srv=await startServer(app);
 try{
  const response=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question:'How much sponsorship value did we sign in 2025?',edition_id:'ED-2025',as_of:'2025-04-20'})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.token_usage.model_requests,0);assert.equal(modelCalls,0);assert.equal(body.generation_status,'complete');assert.equal(body.route,'sql');assert.equal(body.answer_check_passed,true);
  for(const id of ['M-02','M-03','M-04','M-09'])assert.ok(body.tool_calls.some((t:any)=>t.status==='ok'&&t.summary===id));
  assert.match(body.answer,/Cash-type signed value/);assert.match(body.answer,/Confirmed partnerships/);
  const campaignResponse=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question:'What is the proposal-to-win conversion for each campaign?',edition_id:'ED-2025',as_of:'2025-04-20'})});
  const campaignBody=await campaignResponse.json();assert.equal(campaignResponse.status,200,JSON.stringify(campaignBody));assert.equal(campaignBody.answer_check_passed,true);assert.equal(campaignBody.token_usage.model_requests,0);assert.equal(modelCalls,0);assert.match(campaignBody.answer,/Mock campaign \| 2 \| 5 \| 0.4 ratio/);
 }finally{client.stop();await srv.close();}
});

test('[MOCKED] prospect prioritisation, research status and verified-route answers need zero model requests',async()=>{
 const store=createMockStore();const dbState=createMockDbState(store);const original=dbState.pool!.query.bind(dbState.pool);
 const prospectRows=[{company:'Alpha',category:'Consumer fintech',action:'1 Pursue now',route_class:'V1',priority_index:73,track:'cash',introductions:0,face_value_lakh:2.5},{company:'Beta',category:'Consumer fintech',action:'2 Later',route_class:'U1',priority_index:90,track:'cash',introductions:0,face_value_lakh:4.5}];
 dbState.pool!.query=(async(sql:any,params?:any[])=>{
  if(String(sql).includes('FROM ref.dataset WHERE'))return {rows:[{dataset_id:'market_research.prospect_register',title:'Prospect register',source_path:'research.csv',status:'research',record_class:'external_research',columns:Object.keys(prospectRows[0]),row_count:2}]};
  if(String(sql).includes('FROM ref.dataset_row r'))return {rows:prospectRows.map((data,i)=>({row_no:i+1,data}))};
  return original(sql,params);
 }) as typeof original;
 let modelCalls=0;
 const client=createOpenRouterClient(createBaseConfig(),{startBackgroundRefresh:false,fetchFn:async(input)=>{
  if(String(input).endsWith('/chat/completions')){modelCalls++;throw Error('Model unavailable');}
  return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,used:50,remaining:0}}}),{status:200});
 }});
 const app=express();app.use(express.json());app.use('/api',createAiApiRouter(createBaseConfig(),dbState,createAuthDeps(store,dbState),{openrouter:client}).router);app.use(apiErrorHandler);
 const srv=await startServer(app);
 try{
  for(const question of ['Which prospects should we pursue first?','Is there any high potential sponsor that we should focus on currently?','Which brands look promising for outreach?','Is Alpha in our pipeline, and what is it worth?','Which fintech prospects have a verified route to them?']){
   const response=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question,edition_id:'ED-2026-DEMO',as_of:'2026-11-26'})});
   const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.generation_status,'complete');assert.equal(body.token_usage.model_requests,0);assert.equal(body.answer_check_passed,true,JSON.stringify(body));assert.ok(body.tool_calls.some((t:any)=>t.tool_name==='get_register'&&t.status==='ok'));assert.ok(body.tool_calls.some((t:any)=>t.tool_name==='search_knowledge'&&t.status==='ok'));assert.match(body.answer,/Alpha/);assert.doesNotMatch(body.answer,/\| Beta \|/);
  }
  assert.equal(modelCalls,0);
 }finally{client.stop();await srv.close();}
});

test('[MOCKED] cache hits persist conversation turns, isolate owners, and invalidate on changed data',async()=>{
 const store=createMockStore();const dbState=createMockDbState(store);
 const client=createOpenRouterClient(createBaseConfig(),{startBackgroundRefresh:false,fetchFn:async()=>new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,remaining:0,used:50}}}),{status:200})});
 const app=express();app.use(express.json());app.use('/api',createAiApiRouter(createBaseConfig(),dbState,createAuthDeps(store,dbState),{openrouter:client}).router);app.use(apiErrorHandler);
 const srv=await startServer(app);
 const ask=async(conversation_id?:string)=>{const res=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question:'How much sponsorship value did we sign in 2025?',edition_id:'ED-2025',as_of:'2025-04-20',conversation_id})});assert.equal(res.status,200);return res.json();};
 try {
  const first=await ask();assert.equal(first.cached,false);
  const second=await ask();assert.equal(second.cached,true);
  assert.ok(store.messages.some(m=>m.conversation_id===second.conversation_id && m.role==='user'),'cached question is persisted for follow-ups');
  const followup=await ask(second.conversation_id);assert.equal(followup.cached,false,'conversation-dependent answers bypass first-turn cache');
  store.actorMemberId='OTHER-MEMBER';store.actorAuthUid='OTHER-AUTH';
  const other=await ask();assert.equal(other.cached,false,'same roles are insufficient for owner cache sharing');
  assert.equal((await ask()).cached,true);
  store.dataVersion++;assert.equal((await ask()).cached,false);
 }finally{client.stop();await srv.close();}
});

test('[MOCKED] enriched knowledge search uses expanded bounded candidates and keeps history excluded',async()=>{
 const store=createMockStore();const dbState=createMockDbState(store);const state=createToolAccumulator();
 const result=await executeSearchKnowledge(dbState.pool as any,{query:'Can the team execute the stretch plan?'},7,state,{rankMode:'fts_enriched'});
 assert.equal(result.rank_mode,'fts_enriched');assert.equal(result.used_or_fallback,true);assert.ok((result.chunks as any[]).every(c=>c.chunk_id!=='KB-99.1'));
});
test('[MOCKED] inventory and forecast actual HTTP paths remain grounded with an exhausted model quota',async()=>{
 const store=createMockStore();const dbState=createMockDbState(store);const original=dbState.pool!.query.bind(dbState.pool);
 dbState.pool!.query=(async(sql:any,params?:any[])=>{
  if(String(sql).includes('FROM ref.dataset WHERE'))return {rows:[{dataset_id:params?.[0],title:'Inventory',source_path:'inventory.csv',columns:['asset','slots','price_lakh'],status:'approved',record_class:'model_output'}]};
  if(String(sql).includes('FROM ref.dataset_row r'))return {rows:[{row_no:1,data:{asset:'activation',slots:17,price_lakh:0.19}}]};
  return original(sql,params);
 }) as typeof original;
 let modelCalls=0;
 const client=createOpenRouterClient(createBaseConfig(),{startBackgroundRefresh:false,fetchFn:async(input)=>{
  if(String(input).endsWith('/chat/completions')){modelCalls++;throw Error('No model request allowed');}
  return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,used:50,remaining:0}}}),{status:200});
 }});
 const app=express();app.use(express.json());app.use('/api',createAiApiRouter(createBaseConfig(),dbState,createAuthDeps(store,dbState),{openrouter:client}).router);app.use(apiErrorHandler);const srv=await startServer(app);
 try{
  for(const question of ['What do activation slots cost?','Has the stretch forecast already been collected?']){
   const response=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question,edition_id:'ED-2026-DEMO',as_of:'2026-11-26'})});
   const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.token_usage.model_requests,0);assert.equal(body.answer_check_passed,true,JSON.stringify(body));assert.equal(body.generation_status,'complete');
   assert.ok(body.tool_calls.some((t:any)=>t.tool_name===(question.includes('activation')?'get_register':'get_scenario')));
  }
  assert.equal(modelCalls,0);
 }finally{client.stop();await srv.close();}
});

test('[MOCKED] provider schema rejection switches to another configured free entry instead of aborting the turn',async()=>{
 let chats=0;
 const client=createOpenRouterClient(createBaseConfig({groqApiKey:'gsk-mock'}),{startBackgroundRefresh:false,fetchFn:async(input)=>{
  if(!String(input).endsWith('/chat/completions'))return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,remaining:50}}}),{status:200});
  chats++;
  if(chats===1)return new Response(JSON.stringify({error:{message:'Tool call validation failed: parameters for tool list_records did not match schema: limit maximum got 50 want 25',code:'tool_use_failed'}}),{status:400});
  return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Read the source records.'}}]}),{status:200});
 }});
 try{const result=await client.createChatCompletion({messages:[{role:'user',content:'List open deals'}],tools:[{type:'function',function:{name:'list_records',description:'Read scoped records',parameters:{type:'object',properties:{limit:{type:'integer',maximum:25}}}}}]});assert.equal(chats,2);assert.equal(result.usedFallback,true);}
 finally{client.stop();}
});

test('[MOCKED] provider cooldown prevents repeated failed requests and reports attempted inference calls',async()=>{
 const models:string[]=[];
 const client=createOpenRouterClient(createBaseConfig(),{startBackgroundRefresh:false,fetchFn:async(input,init)=>{
  if(String(input).endsWith('/key'))return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,remaining:50,used:0}}}),{status:200});
  const req=JSON.parse(String(init?.body));models.push(req.model);
  if(req.model===DEFAULT_OPENROUTER_MODEL_PRIMARY)return new Response('temporary capacity limit',{status:429,headers:{'retry-after':'600'}});
  return new Response(JSON.stringify({model:req.model,choices:[{message:{role:'assistant',content:'OK'}}]}),{status:200});
 }});
 try {
  assert.equal((await client.createChatCompletion({messages:[{role:'user',content:'Hello'}]})).requestAttempts,2);
  assert.equal((await client.createChatCompletion({messages:[{role:'user',content:'Another question'}]})).requestAttempts,1);
  assert.deepEqual(models,[DEFAULT_OPENROUTER_MODEL_PRIMARY,DEFAULT_OPENROUTER_MODEL_FALLBACK,DEFAULT_OPENROUTER_MODEL_FALLBACK]);
 }finally{client.stop();}
});
test('[MOCKED] sponsor ranking HTTP path uses the source grain with zero model requests and renders a table',async()=>{
 const store=createMockStore(),dbState=createMockDbState(store),original=dbState.pool!.query.bind(dbState.pool);
 dbState.pool!.query=(async(sql:any,params?:any[])=>{
  if(String(sql).includes('WITH scoped AS'))return {rows:[{sponsor_id:'CHANGED-A',sponsor_name:'Current Alpha',value:'180001',position:1,total_sponsors:2,breakdown_total:'280002',canonical_total:'280002'},{sponsor_id:'CHANGED-B',sponsor_name:'Current Beta',value:'100001',position:2,total_sponsors:2,breakdown_total:'280002',canonical_total:'280002'}]};
  return original(sql,params);
 }) as typeof original;
 let calls=0;const client=createOpenRouterClient(createBaseConfig(),{startBackgroundRefresh:false,fetchFn:async(input)=>{if(String(input).endsWith('/chat/completions')){calls++;throw Error('No model needed');}return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,remaining:0,used:50}}}),{status:200});}});
 const app=express();app.use(express.json());app.use('/api',createAiApiRouter(createBaseConfig(),dbState,createAuthDeps(store,dbState),{openrouter:client}).router);app.use(apiErrorHandler);const srv=await startServer(app);
 try{const response=await fetch(srv.baseUrl+'/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer tok'},body:JSON.stringify({question:'What is the highest amount that we got from a sponsor?',edition_id:'ED-2026-DEMO',as_of:'2026-11-26'})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.answer_check_passed,true,JSON.stringify(body));assert.equal(body.token_usage.model_requests,0);assert.equal(calls,0);assert.match(body.answer,/Current Alpha/);assert.match(body.answer,/1,80,001/);assert.ok(body.blocks.some((b:any)=>b.type==='table'&&b.rows[0].sponsor_name==='Current Alpha'));}
 finally{client.stop();await srv.close();}
});


import { campaignPerformance } from './campaignPerformance.ts';
import { currentOutlook } from './outlook.ts';
import { uploadedDatasetTool } from '../uploadedDatasets.ts';
import { morphologicalRank, expandedCandidateTerms } from './lexicalSearchCandidate.ts';
import { querySponsorMetrics, SPONSOR_METRICS } from './sponsorMetrics.ts';
import { getInventory } from './financialAnswers.ts';
import { expandedTerms, lexicalRank } from './lexicalSearch.ts';
import { getProspects } from './prospects.ts';
import { z } from 'zod';
import { getDataset, listDatasets } from './referenceData.ts';
import { getKnowledgeRankMode } from './retrievalRanking.ts';
import {
  addDaysIso,
  computeCashGateStatus,
  computeGateStatus,
  computeWeekEndDates,
  extractIstDateFromTimestamp,
  formatShortDisplayDate,
  isValidIsoDate,
} from '../gates.ts';
import { evaluateRuleBand, requiredSampleFloor, type RuleMetricSnapshot } from '../ruleBands.ts';
import {
  ALLOWED_CHANNEL_GROUPS,
  coerceMetricRow,
  evaluateScopeAndRedaction,
  queryReceivablesContracts,
  toNum,
  VIEWER_RESTRICTED_METRICS,
  type CoercedMetricResult,
} from '../routes/readApi.ts';
import type { CanonicalRole } from '../permissions.ts';
import type { OpenRouterToolDefinition } from './openrouter.ts';

export interface QueryablePool {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

export interface ToolExecutionContext {
  pool: QueryablePool;
  actorMemberId: string;
  roles: CanonicalRole[];
  defaultEditionId: string;
  userSeason: {
    editionId: string;
    recordClass: 'live' | 'simulated' | 'historical_synthetic';
    asOf: string;
  };
}

export interface CollectedCitation {
  type: 'metric' | 'knowledge' | 'reference' | 'record';
  id: string;
  title?: string | null;
  doc_id?: string | null;
  chunk_id?: string | null;
  section?: string | null;
  citation_location?: string | null;
  decision_status?: string | null;
  retrieval_rule?: string | null;
  related_bet?: string | null;
  related_kpi?: string | null;
  evidence_class?: string | null;
  record_class?: string | null;
  data_version?: number | string | null;
  definition_version?: string | null;
  history?: boolean;
  status_note?: string | null;
  text?: string | null;
}

export interface ToolRunAccumulator {
  toolResults: unknown[];
  knowledgeTexts: string[];
  metricResults: CoercedMetricResult[];
  citations: CollectedCitation[];
}

export function createToolAccumulator(): ToolRunAccumulator {
  return {
    toolResults: [],
    knowledgeTexts: [],
    metricResults: [],
    citations: [],
  };
}

function stripNullsAndTruncate(val: unknown, maxTextLen = 240, maxRows = 25): unknown {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') {
    if (val.length <= maxTextLen) return val;
    return `${val.slice(0, maxTextLen - 1)}…`;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) {
    const out: unknown[] = [];
    for (const item of val.slice(0, maxRows)) {
      const cleaned = stripNullsAndTruncate(item, maxTextLen, maxRows);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const cleaned = stripNullsAndTruncate(v, maxTextLen, maxRows);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return String(val);
}

/**
 * Trim tool payloads before placing them in LLM context (≤25 rows, drop null fields,
 * truncate long strings with "…", cap serialized length <= ~2,500 tokens / 10,000 chars).
 */
export function trimToolResultForModel(obj: unknown): string {
  const cleaned = stripNullsAndTruncate(obj, 240, 25);
  let json = JSON.stringify(cleaned);
  if (json.length <= 9800) return json;

  // Shrink strings and row count iteratively if still above ~2,500 tokens
  const tighter = stripNullsAndTruncate(obj, 120, 15);
  json = JSON.stringify(tighter);
  if (json.length <= 9800) return json;

  for (const rows of [8, 4, 2, 1]) {
    json = JSON.stringify(stripNullsAndTruncate(obj, 80, rows));
    if (json.length <= 9800) return json;
  }

  // Still too large: hand the model valid JSON saying so, never a cut-off string.
  return JSON.stringify({
    ok: false,
    error_code: 'RESULT_TOO_LARGE',
    hint: 'Result too large to summarise; narrow the request (filters, fewer rows).',
  });
}

const METRIC_ID_RE = /^M-(0[1-9]|[12][0-9]|30)$/;

const MetricFiltersSchema = z
  .object({
    campaign_id: z.string().trim().min(1).optional(),
    channel_group: z
      .enum(['warm', 'inbound', 'cold', 'renewal', 'premium'])
      .optional(),
    bet_id: z.string().trim().min(1).optional(),
    scenario_id: z.string().trim().min(1).optional(),
  })
  .strict()
  .optional();

export const GetMetricArgsSchema = z
  .object({
    metric_id: z.string().trim().regex(METRIC_ID_RE, 'Must be M-01..M-30'),
    filters: MetricFiltersSchema,
    as_of: z.string().trim().optional(),
    edition_id: z.string().trim().min(1).optional(),
  })
  .strict();

export const GetSeriesArgsSchema = z
  .object({
    metric_id: z.string().trim().regex(METRIC_ID_RE, 'Must be M-01..M-30'),
    filters: MetricFiltersSchema,
    from: z.string().trim().refine(isValidIsoDate, 'from must be YYYY-MM-DD'),
    to: z.string().trim().refine(isValidIsoDate, 'to must be YYYY-MM-DD'),
    edition_id: z.string().trim().min(1).optional(),
  })
  .strict();

export const GetScenarioArgsSchema = z
  .object({
    scenario_id: z.string().trim().min(1).optional(),
  })
  .strict();

export const GetRegisterArgsSchema = z
  .object({
    kind: z.enum([
      'kpi',
      'rule',
      'experiment',
      'assumption',
      'decision',
      'bet',
      'gate',
      'source',
      'benchmark',
      'prospects',
      'inventory',
    ]),
    id: z.string().trim().min(1).optional(),
    filters: z.object({ company: z.string().trim().min(1).max(80).optional(), category: z.string().trim().min(1).max(80).optional(), action: z.string().trim().min(1).max(80).optional(), verified_route: z.boolean().optional() }).strict().optional(),
    edition_id: z.string().trim().min(1).optional(),
    as_of: z.string().trim().optional(),
  })
  .strict();

export const SearchKnowledgeArgsSchema = z
  .object({
    query: z.string().trim().min(1).max(240),
    include_history: z.boolean().optional().default(false),
    related_bet: z.string().trim().min(1).optional(),
    related_kpi: z.string().trim().min(1).optional(),
  })
  .strict();

export const ListRecordsArgsSchema = z
  .object({
    kind: z.enum([
      'opportunities',
      'tasks',
      'receivables',
      'sponsors',
      'campaigns',
      'contacts',
      'team_members',
    ]),
    summarize: z.literal('opportunity_cohort').optional(),
    state: z.enum(['open', 'confirmed', 'lost', 'signed', 'won']).optional(),
    filters: z
      .object({
        stage: z.string().trim().optional(),
        state: z.enum(['open', 'confirmed', 'lost', 'signed', 'won']).optional(),
        status: z.string().trim().optional(),
        campaign_id: z.string().trim().optional(),
        channel_group: z.enum(['warm','inbound','cold','renewal','premium']).optional(),
        sponsor_id: z.string().trim().optional(),
        overdue: z.boolean().optional(),
        owner_member_id: z.string().trim().optional(),
        linked_type: z.string().trim().optional(),
        linked_id: z.string().trim().optional(),
        search: z.string().trim().optional(),
        bet_id: z.string().trim().optional(),
      })
      .optional(),
    limit: z.number().int().min(1).max(25).optional().default(15),
    edition_id: z.string().trim().min(1).optional(),
  })
  .strict();

export const GetDatasetArgsSchema = z.object({
  dataset_id: z.string().trim().min(1).max(240),
  filter: z.record(z.string().min(1).max(160), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])).optional(),
  columns: z.array(z.string().min(1).max(160)).min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();
export const ListDatasetsArgsSchema = z.object({ query: z.string().trim().max(240).optional() }).strict();

export const SponsorMetricsArgsSchema = z.object({metric_id:z.enum(SPONSOR_METRICS),filters:MetricFiltersSchema,limit:z.number().int().min(1).max(25).default(10),edition_id:z.string().trim().optional(),as_of:z.string().refine(isValidIsoDate).optional()}).strict();

export const READ_TOOL_DEFINITIONS: OpenRouterToolDefinition[] = [
 {type:'function',function:{name:'get_campaign_performance',description:'Compare current canonical campaign cash, signed, win conversion and open pipeline metrics. No causal attribution or invented target gaps.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'get_outlook',description:'Compute an on-read current cash what-if using observed win and collection rates. Not a calibrated or approved forecast; keep approved scenarios separate. Explain the assumptions and missing data.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'list_uploaded_datasets',description:'List CSV datasets uploaded by the current user to the active edition. Use this before answering questions about imported/custom data.',parameters:{type:'object',properties:{query:{type:'string'}},additionalProperties:false}}},
 {type:'function',function:{name:'get_uploaded_dataset',description:'Read and analyse a user-uploaded reference dataset. Filtering, grouping, and aggregates run across the complete matched dataset; raw rows remain bounded and paginated. Only registered columns and supported operations are allowed. These figures never change canonical operational metrics.',parameters:{type:'object',properties:{dataset_id:{type:'string'},filter:{type:'object',additionalProperties:{type:'string'}},group_by:{type:'array',items:{type:'string'},maxItems:2},aggregates:{type:'array',items:{type:'object',properties:{operation:{type:'string',enum:['count','sum','average','minimum','maximum']},field:{type:'string'}},required:['operation'],additionalProperties:false},maxItems:5},sort_by:{type:'string'},descending:{type:'boolean'},offset:{type:'integer',minimum:0,maximum:500},limit:{type:'integer',minimum:1,maximum:25}},required:['dataset_id'],additionalProperties:false}}},
 {type:'function',function:{name:'get_sponsor_metrics',description:'Rank sponsors by database-computed cash collected (M-01), signed total (M-02), signed cash (M-03), in-kind (M-04), or unpaid cash (M-07). Full permitted cohort ranked before limiting. Do not use channel totals to answer sponsor questions.',parameters:{type:'object',properties:{metric_id:{type:'string',enum:[...SPONSOR_METRICS]},limit:{type:'integer',minimum:1,maximum:25},edition_id:{type:'string'},as_of:{type:'string'},filters:{type:'object',properties:{campaign_id:{type:'string'},channel_group:{type:'string',enum:['warm','inbound','cold','renewal','premium']},bet_id:{type:'string'}},additionalProperties:false}},required:['metric_id'],additionalProperties:false}}},
  { type: 'function', function: {
    name: 'list_datasets',
    description: 'Find AI-visible reference datasets: market_research.prospect_register; financial_modelling.inventory.b_pricing_summary; data_foundation.curated_data.commercial_inventory and external_benchmarks; strategy.resource_allocation.staffing, bets and scenario_capacity; strategy.risk_register; financial_modelling.scenario_catalogue; strategy.d010_approved.out.s7_ranking. Research is not pipeline; analysis is not an approved target.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
  } },
  { type: 'function', function: {
    name: 'get_dataset', description: 'Read an AI-visible reference dataset verbatim. State status_label and cite dataset_id. No aggregation or forecasts. Use filter for exact column:value matches; limit up to 50.',
    parameters: { type: 'object', properties: {
      dataset_id: { type: 'string' }, filter: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } },
      columns: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }, required: ['dataset_id'], additionalProperties: false },
  } },
  {
    type: 'function',
    function: {
      name: 'get_metric',
      description: 'Compute approved metric M-01..M-30 via Postgres engine.',
      parameters: {
        type: 'object',
        properties: {
          metric_id: { type: 'string', description: 'M-01..M-30' },
          filters: {
            type: 'object',
            properties: {
              campaign_id: { type: 'string' },
              channel_group: {
                type: 'string',
                enum: ['warm', 'inbound', 'cold', 'renewal', 'premium'],
              },
              bet_id: { type: 'string' },
              scenario_id: { type: 'string' },
            },
            additionalProperties: false,
          },
          as_of: { type: 'string', description: 'YYYY-MM-DD' },
          edition_id: { type: 'string' },
        },
        required: ['metric_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_series',
      description: 'Weekly metric time series between ISO dates.',
      parameters: {
        type: 'object',
        properties: {
          metric_id: { type: 'string', description: 'M-01..M-30' },
          filters: {
            type: 'object',
            properties: {
              campaign_id: { type: 'string' },
              channel_group: {
                type: 'string',
                enum: ['warm', 'inbound', 'cold', 'renewal', 'premium'],
              },
              bet_id: { type: 'string' },
              scenario_id: { type: 'string' },
            },
            additionalProperties: false,
          },
          from: { type: 'string' },
          to: { type: 'string' },
          edition_id: { type: 'string' },
        },
        required: ['metric_id', 'from', 'to'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_scenario',
      description: 'Approved D-009 scenarios (SC-01..SC-03).',
      parameters: {
        type: 'object',
        properties: {
          scenario_id: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_register',
      description: 'Read kpi, rule, experiment, assumption, decision, bet, gate, source, benchmark, inventory or prospects. Rule rows include the linked approved experiment sample target and latest metric numerator/denominator; check those before applying a threshold. Inventory reads commercial inventory and pricing source rows; id may select activation. Prospects are external research targets, not pipeline or forecasts; verified routes are not introductions. Use filters for company, category, action or verified_route. Benchmarks are external research: preserve ASK vs ACTUAL vs COST.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['kpi', 'rule', 'experiment', 'assumption', 'decision', 'bet', 'gate', 'source', 'benchmark', 'prospects', 'inventory'],
          },
          id: { type: 'string' },
          filters: { type: 'object', properties: { company: { type: 'string' }, category: { type: 'string' }, action: { type: 'string' }, verified_route: { type: 'boolean' } }, additionalProperties: false },
          edition_id: { type: 'string' },
          as_of: { type: 'string' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Search strategy/benchmark docs (KB-01..KB-18). Set include_history=true only for older numbers.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          include_history: { type: 'boolean' },
          related_bet: { type: 'string' },
          related_kpi: { type: 'string' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_records',
      description:
        'List at most 25 RBAC-scoped records; limit must be 1..25. Opportunities can be filtered by originating campaign channel_group (warm, inbound, cold, renewal, premium), campaign, stage, owner, sponsor, bet or open/confirmed/lost state. Tasks can be filtered by their linked record type and ID to retrieve recorded due dates and status. Use get_sponsor_metrics for financial rankings, not a partial record listing. Records: (opportunities with state=open|confirmed|lost, tasks, receivables per active contract, sponsors, campaigns, contacts, team_members).',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'opportunities',
              'tasks',
              'receivables',
              'sponsors',
              'campaigns',
              'contacts',
              'team_members',
            ],
          },
          summarize: { type: 'string', enum: ['opportunity_cohort'], description: 'Aggregate the entire filtered opportunities cohort. Returns counts of opportunities and distinct sponsors, and the signed value range when permitted.' },
          filters: {
            type: 'object',
            properties: {
              stage: { type: 'string' },
              state: {
                type: 'string',
                enum: ['open', 'confirmed', 'lost'],
              },
              status: { type: 'string' },
              campaign_id: { type: 'string' },
              channel_group: { type: 'string', enum: ['warm','inbound','cold','renewal','premium'], description: 'Filter by the originating campaign channel group.' },
              sponsor_id: { type: 'string' },
              overdue: { type: 'boolean' },
              owner_member_id: { type: 'string' },
              linked_type: { type: 'string', description: 'Related record type for tasks.' },
              linked_id: { type: 'string', description: 'Related record ID for tasks.' },
              search: { type: 'string' },
              bet_id: { type: 'string' },
            },
          },
          limit: { type: 'integer', minimum: 1, maximum: 25 },
          edition_id: { type: 'string' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
];

async function resolveEditionFromPool(
  pool: QueryablePool,
  editionId: string
): Promise<{
  edition_id: string;
  name: string;
  record_class: 'live' | 'simulated' | 'historical_synthetic';
  starts_at: string;
  season_start: string | null;
}> {
  const res = await pool.query<{
    edition_id: string;
    name: string;
    record_class: string;
    starts_at: Date | string;
    season_start: Date | string | null;
  }>(
    `SELECT edition_id, name, record_class, starts_at, season_start
       FROM public.festival_edition
      WHERE edition_id = $1 AND NOT is_deleted
      LIMIT 1`,
    [editionId]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`Unknown edition "${editionId}".`);
  }
  return {
    edition_id: row.edition_id,
    name: row.name,
    record_class: row.record_class as 'live' | 'simulated' | 'historical_synthetic',
    starts_at:
      row.starts_at instanceof Date
        ? row.starts_at.toISOString()
        : String(row.starts_at),
    season_start: row.season_start
      ? row.season_start instanceof Date
        ? row.season_start.toISOString().slice(0, 10)
        : String(row.season_start).slice(0, 10)
      : null,
  };
}

async function getCurrentDataVersion(pool: QueryablePool): Promise<number> {
  const res = await pool.query<{ data_version: string | number }>(
    `SELECT data_version FROM public.app_state WHERE id = 1`
  );
  return Number(res.rows[0]?.data_version ?? 1);
}

function buildOrQueryFromStrict(rawQuery: string): string | null {
  const tokens = rawQuery
    .replace(/[^a-zA-Z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !/^(or|and|not)$/i.test(t));
  const unique = Array.from(new Set(tokens)).slice(0, 8);
  if (unique.length < 2) return null;
  return unique.join(' OR ');
}

function scoreTitleMatch(title: string | null | undefined, queryWords: string[]): number {
  if (!title || queryWords.length === 0) return 0;
  const lower = title.toLowerCase();
  let hits = 0;
  for (const w of queryWords) {
    if (lower.includes(w.toLowerCase())) hits += 1;
  }
  return hits;
}

/**
 * 'fts' (default): strict websearch FTS with an OR fallback, title boost.
 * 'fts_trgm': also matches and ranks by pg_trgm similarity of the query to the
 * chunk's document title and section (needs the pg_trgm extension). Chosen by
 * scripts/eval-retrieval.ts; never by the model.
 */
export type KnowledgeRankMode = 'fts' | 'fts_trgm' | 'fts_enriched' | 'fts_morph';

export async function executeSearchKnowledge(
  pool: QueryablePool,
  rawArgs: unknown,
  dataVersion: number,
  acc: ToolRunAccumulator,
  opts: { rankMode?: KnowledgeRankMode } = {}
): Promise<Record<string, unknown>> {
  const args = SearchKnowledgeArgsSchema.parse(rawArgs);
  const rankMode = opts.rankMode ?? getKnowledgeRankMode();
  const trgm = rankMode === 'fts_trgm';
  const candidate = rankMode === 'fts_morph';
  const enriched = rankMode === 'fts_enriched' || candidate;
  const historyClause = args.include_history
    ? ''
    : `AND retrieval_rule <> 'contradiction_and_history_only'
       AND decision_status NOT IN ('superseded', 'superseded_mapping')`;

  const baseParams: unknown[] = [args.query];
  let betClause = '';
  let kpiClause = '';
  if (args.related_bet) {
    baseParams.push(args.related_bet);
    betClause = `AND (related_bet ILIKE '%' || $${baseParams.length} || '%' OR related_bet = 'All')`;
  }
  if (args.related_kpi) {
    baseParams.push(args.related_kpi);
    kpiClause = `AND related_kpi ILIKE '%' || $${baseParams.length} || '%'`;
  }

  let trgmParamIndex = 0;
  if (trgm) {
    baseParams.push(args.query);
    trgmParamIndex = baseParams.length;
  }

  const querySql = (tsQueryParamIndex: number) => `
    SELECT chunk_id, doc_id, document_title, section, citation_location,
           decision_status, retrieval_rule, evidence_class, related_bet,
           related_kpi, record_class, text,
           ts_rank_cd(tsv, websearch_to_tsquery('english', $${tsQueryParamIndex})) AS base_rank
           ${trgm ? `, GREATEST(similarity(COALESCE(document_title, ''), $${trgmParamIndex}), similarity(COALESCE(section, ''), $${trgmParamIndex})) AS trgm_sim` : ''}
      FROM public.knowledge_chunk
     WHERE NOT is_deleted
       AND valid_to IS NULL
       ${historyClause}
       ${betClause}
       ${kpiClause}
       AND (tsv @@ websearch_to_tsquery('english', $${tsQueryParamIndex})
            ${trgm ? `OR similarity(COALESCE(document_title, ''), $${trgmParamIndex}) > 0.12 OR similarity(COALESCE(section, ''), $${trgmParamIndex}) > 0.12` : ''})
     ORDER BY base_rank ${trgm ? '+ GREATEST(similarity(COALESCE(document_title, \'\'), $' + trgmParamIndex + '), similarity(COALESCE(section, \'\'), $' + trgmParamIndex + '))' : ''} DESC, chunk_id ASC
     LIMIT ${candidate ? 256 : enriched ? 96 : 12}`;

  const strictRes = await pool.query<Record<string, unknown>>(
    querySql(1),
    baseParams
  );
  let rows = [...strictRes.rows];
  let usedOrFallback = false;

  // Special prompt rule: if strict search returns < 2 chunks, retry once with same words joined by OR,
  // and rank chunks whose doc title matches higher.
  if (enriched || rows.length < 2) {
    const orQuery = candidate ? expandedCandidateTerms(args.query).join(' OR ') : enriched ? expandedTerms(args.query).join(' OR ') : buildOrQueryFromStrict(args.query);
    if (orQuery) {
      usedOrFallback = true;
      const orParams = [orQuery, ...baseParams.slice(1)];
      const orRes = await pool.query<Record<string, unknown>>(
        querySql(1),
        orParams
      );
      const seen = new Set(rows.map((r) => String(r.chunk_id)));
      for (const r of orRes.rows) {
        if (!seen.has(String(r.chunk_id))) {
          seen.add(String(r.chunk_id));
          rows.push(r);
        }
      }
    }
  }

  const queryWords = args.query
    .replace(/[^a-zA-Z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  rows.sort((a, b) => {
    const aTitleHits = scoreTitleMatch(
      a.document_title as string | undefined,
      queryWords
    );
    const bTitleHits = scoreTitleMatch(
      b.document_title as string | undefined,
      queryWords
    );
    const aScore =
      Number(a.base_rank ?? 0) + aTitleHits * 0.5 + (trgm ? Number(a.trgm_sim ?? 0) : 0);
    const bScore =
      Number(b.base_rank ?? 0) + bTitleHits * 0.5 + (trgm ? Number(b.trgm_sim ?? 0) : 0);
    return bScore - aScore;
  });

  if (candidate) rows = morphologicalRank(args.query, rows);
  else if (enriched) rows = lexicalRank(args.query, rows);
  const topChunks = rows.slice(0, 6).map((r) => {
    const decisionStatus = String(r.decision_status ?? '');
    const retrievalRule = String(r.retrieval_rule ?? 'default');
    const isHistory =
      retrievalRule === 'contradiction_and_history_only' ||
      decisionStatus === 'superseded' ||
      decisionStatus === 'superseded_mapping';
    const statusNote =
      decisionStatus === 'proposed'
        ? 'proposed, not approved'
        : isHistory
          ? 'historical / superseded record — cite only as history'
          : null;

    acc.knowledgeTexts.push(String(r.text ?? ''));
    acc.citations.push({
      type: 'knowledge',
      id: String(r.chunk_id),
      chunk_id: String(r.chunk_id),
      doc_id: String(r.doc_id ?? ''),
      title: (r.document_title as string | null) ?? null,
      section: (r.section as string | null) ?? null,
      citation_location: (r.citation_location as string | null) ?? null,
      decision_status: decisionStatus,
      retrieval_rule: retrievalRule,
      related_bet: (r.related_bet as string | null) ?? null,
      related_kpi: (r.related_kpi as string | null) ?? null,
      evidence_class: (r.evidence_class as string | null) ?? null,
      record_class: (r.record_class as string | null) ?? null,
      data_version: dataVersion,
      history: isHistory,
      status_note: statusNote,
      text: String(r.text ?? ''),
    });

    return {
      chunk_id: String(r.chunk_id),
      doc_id: String(r.doc_id),
      document_title: r.document_title ?? null,
      section: r.section ?? null,
      citation_location: r.citation_location ?? null,
      decision_status: decisionStatus,
      retrieval_rule: retrievalRule,
      history: isHistory,
      status_note: statusNote,
      related_bet: r.related_bet ?? null,
      related_kpi: r.related_kpi ?? null,
      evidence_class: r.evidence_class ?? null,
      text: String(r.text ?? ''),
    };
  });

  const payload = {
    source: 'knowledge_chunk_fts',
    rank_mode: rankMode,
    query: args.query,
    include_history: args.include_history,
    used_or_fallback: usedOrFallback,
    record_class: 'knowledge_base',
    edition_id: 'ALL',
    as_of: null,
    data_version: dataVersion,
    chunks: topChunks,
  };
  acc.toolResults.push(payload);
  return payload;
}

export async function executeReadTool(
  toolName: string,
  rawArgs: unknown,
  ctx: ToolExecutionContext,
  acc: ToolRunAccumulator
): Promise<Record<string, unknown>> {
  const dataVersion = await getCurrentDataVersion(ctx.pool);
  const profile = evaluateScopeAndRedaction(ctx.roles);

  if(toolName==='get_campaign_performance'){z.object({}).strict().parse(rawArgs);const out={...await campaignPerformance(ctx),data_version:dataVersion};acc.toolResults.push(out);return out;}
  if(toolName==='get_outlook'){z.object({}).strict().parse(rawArgs);const out={...await currentOutlook(ctx),data_version:dataVersion};acc.toolResults.push(out);return out;}
  if (toolName === 'list_uploaded_datasets' || toolName === 'get_uploaded_dataset') {
    const args=z.object({dataset_id:z.string().max(100).optional(),query:z.string().max(120).optional(),filter:z.record(z.string(),z.string()).optional(),sort_by:z.string().max(100).optional(),descending:z.boolean().optional(),offset:z.number().int().min(0).max(500).optional(),limit:z.number().int().min(1).max(25).optional()}).strict().parse(rawArgs);
    if(toolName==='get_uploaded_dataset'&&!args.dataset_id)throw Error('dataset_id is required.');
    const payload=await uploadedDatasetTool(ctx.pool,{actorMemberId:ctx.actorMemberId,editionId:ctx.userSeason.editionId,recordClass:ctx.userSeason.recordClass,dataVersion},args);
    acc.toolResults.push(payload);
    return payload;
  }
  if (toolName === 'get_dataset' || toolName === 'list_datasets') {
    const context = { asOf: ctx.userSeason.asOf, dataVersion };
    const payload = toolName === 'get_dataset'
      ? await getDataset(ctx.pool, GetDatasetArgsSchema.parse(rawArgs), context)
      : await listDatasets(ctx.pool, ListDatasetsArgsSchema.parse(rawArgs).query ?? '', context);
    acc.toolResults.push(payload);
    if (payload.available !== false) acc.citations.push({
      type: 'reference', id: String(payload.dataset_id ?? 'ref.dataset'),
      title: String(payload.title ?? 'Reference dataset catalogue'),
      citation_location: String(payload.source_path ?? 'ref.dataset'),
      decision_status: String(payload.status_label ?? payload.status ?? 'reference'),
      record_class: String(payload.record_class), data_version: dataVersion,
    });
    return payload;
  }

  if (toolName === 'get_sponsor_metrics') {
    const args=SponsorMetricsArgsSchema.parse(rawArgs);
    if(args.filters?.scenario_id)throw new Error('Sponsor actuals cannot be filtered by forecast scenario.');
    const ed=await resolveEditionFromPool(ctx.pool,args.edition_id??ctx.userSeason.editionId);
    const asOf=args.as_of??(ed.edition_id==='ED-2025'?'2025-04-20':ctx.userSeason.asOf);
    const result=await querySponsorMetrics({...ctx,userSeason:{editionId:ed.edition_id,recordClass:ed.record_class,asOf}},args.metric_id,args.filters??{},args.limit);
    const payload={...result,source:'list_sponsor_metrics',kind:'sponsor_metrics',metric_id:args.metric_id,unit:'INR',title:'Sponsors by '+({'M-01':'cash collected','M-02':'signed value','M-03':'signed cash','M-04':'in-kind value','M-07':'outstanding cash'}[args.metric_id]),scope:profile.opportunitiesScope==='own'||profile.sponsorsScope==='own'||profile.contractsScope==='own'?'own':'all',edition_id:ed.edition_id,record_class:ed.record_class,as_of:asOf,data_version:dataVersion};
    acc.toolResults.push(payload);acc.citations.push({type:'record',id:'sponsor_metrics:'+args.metric_id,title:payload.title,record_class:ed.record_class,data_version:dataVersion});
    return payload;
  }

  if (toolName === 'get_metric') {
    const args = GetMetricArgsSchema.parse(rawArgs);
    const editionId = args.edition_id ?? ctx.userSeason.editionId;
    const ed = await resolveEditionFromPool(ctx.pool, editionId);
    const asOf =
      args.as_of && isValidIsoDate(args.as_of)
        ? args.as_of
        : ed.edition_id === 'ED-2025' && ed.edition_id !== ctx.userSeason.editionId
          ? '2025-04-20'
          : ctx.userSeason.asOf;

    if (profile.isViewerOnly && VIEWER_RESTRICTED_METRICS.has(args.metric_id)) {
      const restricted = {
        source: 'metrics.get_metric',
        record_class: ed.record_class,
        edition_id: ed.edition_id,
        as_of: asOf,
        data_version: dataVersion,
        rows: [
          {
            metric_id: args.metric_id,
            value: null,
            unit: null,
            numerator: null,
            denominator: null,
            computable: false,
            reason: 'Restricted for viewer role',
            applied_filters: args.filters ?? {},
            record_class: ed.record_class,
            edition_id: ed.edition_id,
            as_of: asOf,
            data_version: dataVersion,
            definition_version: null,
            series_key: null,
          },
        ],
      };
      acc.toolResults.push(restricted);
      return restricted;
    }

    const cleanFilters: Record<string, string> = {};
    if (args.filters) {
      for (const [k, v] of Object.entries(args.filters)) {
        if (v !== undefined) {
          if (k === 'channel_group' && !ALLOWED_CHANNEL_GROUPS.has(v)) {
            throw new Error(`Invalid channel_group "${v}".`);
          }
          cleanFilters[k] = v;
        }
      }
    }

    const qRes = await ctx.pool.query<Record<string, unknown>>(
      `SELECT * FROM metrics.get_metric($1, $2, $3, $4::date, $5::jsonb)`,
      [
        args.metric_id,
        ed.record_class,
        ed.edition_id,
        asOf,
        JSON.stringify(cleanFilters),
      ]
    );
    const rows = qRes.rows.map(coerceMetricRow);
    for (const r of rows) {
      acc.metricResults.push(r);
      acc.citations.push({
        type: 'metric',
        id: r.metric_id,
        title: `${r.metric_id} (${ed.edition_id}, as of ${asOf})`,
        record_class: r.record_class,
        data_version: r.data_version ?? dataVersion,
        definition_version: r.definition_version,
      });
    }

    const payload = {
      source: 'metrics.get_metric',
      record_class: ed.record_class,
      edition_id: ed.edition_id,
      as_of: asOf,
      data_version: dataVersion,
      rows,
    };
    acc.toolResults.push(payload);
    return payload;
  }

  if (toolName === 'get_series') {
    const args = GetSeriesArgsSchema.parse(rawArgs);
    const editionId = args.edition_id ?? ctx.userSeason.editionId;
    const ed = await resolveEditionFromPool(ctx.pool, editionId);

    if (profile.isViewerOnly && VIEWER_RESTRICTED_METRICS.has(args.metric_id)) {
      const restricted = {
        source: 'metrics.get_metric',
        record_class: ed.record_class,
        edition_id: ed.edition_id,
        as_of: args.to,
        data_version: dataVersion,
        computable: false,
        reason: 'Restricted for viewer role',
        series: [],
      };
      acc.toolResults.push(restricted);
      return restricted;
    }

    const dates: string[] = [];
    if (ed.season_start) {
      const weeks = computeWeekEndDates(ed.season_start, 10);
      for (const w of weeks) {
        if (w.week_end >= args.from && w.week_end <= args.to) {
          dates.push(w.week_end);
        }
      }
    }
    if (dates.length === 0) {
      let cursor = args.from;
      while (cursor <= args.to && dates.length < 16) {
        dates.push(cursor);
        cursor = addDaysIso(cursor, 7);
      }
      if (dates[dates.length - 1] !== args.to && dates.length < 16) {
        dates.push(args.to);
      }
    }

    const filterJson = JSON.stringify(args.filters ?? {});
    const series: Array<{ as_of: string; rows: CoercedMetricResult[] }> = [];
    for (const d of dates) {
      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT * FROM metrics.get_metric($1, $2, $3, $4::date, $5::jsonb)`,
        [args.metric_id, ed.record_class, ed.edition_id, d, filterJson]
      );
      series.push({
        as_of: d,
        rows: qRes.rows.map(coerceMetricRow),
      });
    }

    acc.citations.push({
      type: 'metric',
      id: args.metric_id,
      title: `${args.metric_id} weekly series (${args.from} to ${args.to})`,
      record_class: ed.record_class,
      data_version: dataVersion,
    });

    const payload = {
      source: 'metrics.get_metric_series',
      metric_id: args.metric_id,
      record_class: ed.record_class,
      edition_id: ed.edition_id,
      as_of: args.to,
      data_version: dataVersion,
      series,
    };
    acc.toolResults.push(payload);
    return payload;
  }

  if (toolName === 'get_scenario') {
    const args = GetScenarioArgsSchema.parse(rawArgs);
    const params: unknown[] = [];
    const where: string[] = ['NOT is_deleted', "UPPER(status) = 'APPROVED'"];
    if (args.scenario_id) {
      params.push(args.scenario_id);
      where.push(`scenario_id = $${params.length}`);
    }

    const qRes = await ctx.pool.query<Record<string, unknown>>(
      `SELECT scenario_id, name, status, status_label, expected_cash, p10, p50, p90,
              window_pw, preseason_pw, decision_id, output_checksum, source_ref
         FROM public.scenario_reference
        WHERE ${where.join(' AND ')}
        ORDER BY scenario_id`,
      params
    );

    const scenarios = qRes.rows.map((r) => ({
      ...r,
      expected_cash: toNum(r.expected_cash),
      p10: toNum(r.p10),
      p50: toNum(r.p50),
      p90: toNum(r.p90),
      window_pw: toNum(r.window_pw),
      preseason_pw: toNum(r.preseason_pw),
    }));

    for (const s of scenarios) {
      acc.citations.push({
        type: 'reference',
        id: String((s as Record<string, unknown>).scenario_id),
        title: `${String((s as Record<string, unknown>).scenario_id)} · ${String((s as Record<string, unknown>).name ?? '')}`,
        decision_status: String((s as Record<string, unknown>).status ?? 'reference'),
        record_class: 'model_output',
        data_version: dataVersion,
      });
    }

    const payload = {
      source: 'scenario_reference',
      cash_unit: 'INR_lakh',
      record_class: 'model_output',
      edition_id: ctx.userSeason.editionId,
      as_of: ctx.userSeason.asOf,
      data_version: dataVersion,
      scenarios,
    };
    acc.toolResults.push(payload);
    return payload;
  }

  if (toolName === 'get_register') {
    const args = GetRegisterArgsSchema.parse(rawArgs);
    if (args.kind === 'inventory') {
      if(args.filters)throw new Error('Use id to select an inventory asset.');
      const payload=await getInventory(ctx.pool,args.id,{asOf:ctx.userSeason.asOf,dataVersion});
      acc.toolResults.push(payload);
      for(const data of payload.datasets as Record<string,unknown>[]){if(data.available===true){acc.toolResults.push(data);acc.citations.push({type:'reference',id:String(data.dataset_id),title:String(data.title),record_class:String(data.record_class),data_version:dataVersion});}}
      return payload;
    }
    if (args.kind === 'prospects') {
      const payload = await getProspects(ctx.pool, args.filters ?? (args.id ? {company:args.id} : {}), {asOf:ctx.userSeason.asOf,dataVersion});
      acc.toolResults.push(payload);
      if(payload.available === true) acc.citations.push({type:'reference',id:'market_research.prospect_register',title:'Prospect research register',record_class:'external_research',data_version:dataVersion});
      return payload;
    }
    if (args.filters) throw new Error('Register filters are only supported for prospects.');
    if (args.kind === 'source' || args.kind === 'benchmark') {
      const source = args.kind === 'source';
      const table = source ? 'source_register' : 'benchmark';
      const pk = source ? 'source_id' : 'benchmark_id';
      const fields = source
        ? 'source_id, url, publisher, source_date, accessed_at, record_class, source_ref, evidence_class'
        : 'benchmark_id, source_id, festival, city, edition_year, asset_type, price_low, price_high, value_kind, stated_footfall, excluded_from_central, record_class, source_ref, evidence_class';
      const result = await ctx.pool.query<Record<string, unknown>>(
        'SELECT ' + fields + ' FROM public.' + table + ' WHERE NOT is_deleted' + (args.id ? ' AND ' + pk + ' = $1' : '') + ' ORDER BY ' + pk + ' LIMIT 40', args.id ? [args.id] : []);
      const payload = { source: table, kind: args.kind, status: 'External research, not pipeline or forecast; preserve ASK / ACTUAL / COST', record_class: 'external_research',
        edition_id: 'REFERENCE', as_of: ctx.userSeason.asOf, data_version: dataVersion, rows: result.rows };
      acc.toolResults.push(payload);
      for (const row of result.rows) acc.citations.push({ type: 'reference', id: String(row[pk]), title: String(row.festival ?? row.publisher ?? row[pk]), record_class: 'external_research', data_version: dataVersion });
      return payload;
    }

    const editionId = args.edition_id ?? ctx.userSeason.editionId;
    const ed = await resolveEditionFromPool(ctx.pool, editionId);
    const asOf =
      args.as_of && isValidIsoDate(args.as_of)
        ? args.as_of
        : ed.edition_id === 'ED-2025' && ed.edition_id !== ctx.userSeason.editionId
          ? '2025-04-20'
          : ctx.userSeason.asOf;

    if (args.kind === 'gate') {
      const targetsRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT tv.target_id, tv.edition_id, tv.kpi_id, kd.name AS kpi_name,
                kd.metric_id, tv.scenario_id, sr.name AS scenario_name,
                tv.period, tv.target_value, tv.decision_id, tv.record_class
           FROM public.target_version tv
           LEFT JOIN public.kpi_definition kd ON kd.kpi_id = tv.kpi_id AND NOT kd.is_deleted
           LEFT JOIN public.scenario_reference sr ON sr.scenario_id = tv.scenario_id AND NOT sr.is_deleted
          WHERE tv.edition_id = $1 AND NOT tv.is_deleted
            AND tv.valid_from < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
            AND (tv.valid_to IS NULL OR tv.valid_to >= (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
          ORDER BY tv.kpi_id, tv.period, tv.scenario_id NULLS LAST`,
        [ed.edition_id, asOf]
      );

      const weekSchedule = ed.season_start
        ? computeWeekEndDates(ed.season_start, 10).map((w) => ({
            ...w,
            passed: w.week_end <= asOf,
          }))
        : [];
      const weekEndByPeriod = new Map<string, string>();
      for (const w of weekSchedule) {
        weekEndByPeriod.set(w.period, w.week_end);
      }

      const gateWeekPeriods = ['W4', 'W5', 'W6', 'W7', 'W8', 'W9'];
      const m08ByPeriod = new Map<string, CoercedMetricResult>();
      for (const period of gateWeekPeriods) {
        const weekEnd = weekEndByPeriod.get(period);
        if (weekEnd && weekEnd <= asOf) {
          const mRes = await ctx.pool.query<Record<string, unknown>>(
            `SELECT * FROM metrics.get_metric('M-08', $1, $2, $3::date, '{}'::jsonb)`,
            [ed.record_class, ed.edition_id, weekEnd]
          );
          if (mRes.rows[0]) {
            m08ByPeriod.set(period, coerceMetricRow(mRes.rows[0]));
          }
        }
      }

      let m06Snapshot: CoercedMetricResult | null = null;
      if (!profile.isViewerOnly) {
        const m06Res = await ctx.pool.query<Record<string, unknown>>(
          `SELECT * FROM metrics.get_metric('M-06', $1, $2, $3::date, '{}'::jsonb)`,
          [ed.record_class, ed.edition_id, asOf]
        );
        if (m06Res.rows[0]) {
          m06Snapshot = coerceMetricRow(m06Res.rows[0]);
        }
      }

      const baseByPeriod = new Map<string, number>();
      const planByPeriod = new Map<string, number>();
      let cashGateTarget: number | null = null;
      for (const row of targetsRes.rows) {
        const val = toNum(row.target_value);
        const periodKey = row.period ? String(row.period).toUpperCase() : '';
        if (row.kpi_id === 'K-G-01' && val !== null) {
          if (row.scenario_id === 'SC-01') baseByPeriod.set(periodKey, val);
          if (row.scenario_id === 'SC-02') planByPeriod.set(periodKey, val);
        }
        if (row.kpi_id === 'K-G-02' && val !== null) {
          cashGateTarget = val;
        }
      }

      const weeklyEvaluation = gateWeekPeriods.map((period) => {
        const weekEnd = weekEndByPeriod.get(period) ?? null;
        const baseTarget = baseByPeriod.get(period) ?? null;
        const planTarget = planByPeriod.get(period) ?? null;
        const metric = m08ByPeriod.get(period) ?? null;
        const actualValue = metric && metric.computable ? metric.value : null;
        const passed = Boolean(weekEnd && weekEnd <= asOf);
        return {
          period,
          week_end: weekEnd,
          passed,
          base_target: baseTarget,
          plan_target: planTarget,
          actual_value: actualValue,
          computable: metric?.computable ?? false,
          status: passed
            ? computeGateStatus(actualValue, baseTarget, planTarget)
            : 'unavailable',
        };
      });

      const festDateIst = extractIstDateFromTimestamp(ed.starts_at);
      const cashGateDueDate = festDateIst ? addDaysIso(festDateIst, -7) : null;
      const isHistorical = ed.record_class === 'historical_synthetic';
      const isCashGateBeforeDue =
        !isHistorical && Boolean(cashGateDueDate && asOf < cashGateDueDate);

      const cashGateStatus = isCashGateBeforeDue
        ? computeCashGateStatus(null, cashGateTarget, {
            asOf,
            dueDate: cashGateDueDate,
            isHistorical,
          })
        : m06Snapshot && m06Snapshot.computable && cashGateTarget !== null
          ? computeCashGateStatus(m06Snapshot.value, cashGateTarget, {
              asOf,
              dueDate: cashGateDueDate,
              isHistorical,
            })
          : 'unavailable';

      acc.citations.push({
        type: 'reference',
        id: 'K-G-01 / K-G-02',
        title: `Gates (${ed.edition_id}, as of ${asOf})`,
        record_class: ed.record_class,
        data_version: dataVersion,
      });

      const payload = {
        source: 'gates_evaluation',
        record_class: ed.record_class,
        edition_id: ed.edition_id,
        as_of: asOf,
        data_version: dataVersion,
        weekly_pacing: weeklyEvaluation,
        historical_qualified_goal: isHistorical ? toNum(targetsRes.rows.find(r=>r.kpi_id==='K-H-01')?.target_value) : null,
        cash_gate: {
          kpi_id: 'K-G-02',
          metric_id: 'M-06',
          threshold: cashGateTarget ?? 0.85,
          due_date: cashGateDueDate,
          actual_value: m06Snapshot?.value ?? null,
          computable: m06Snapshot?.computable ?? false,
          reason:
            m06Snapshot?.reason ??
            (profile.isViewerOnly ? 'Restricted for viewer role' : null),
          status: cashGateStatus,
        },
      };
      acc.toolResults.push(payload);
      return payload;
    }

    if (args.kind === 'rule') {
      const RULE_METRIC_OVERRIDE: Record<string, string> = {
        'EX-B1a': 'M-19',
        'EX-B2': 'M-25',
        'EX-B2 (gate)': 'M-06',
        'EX-B4a': 'M-28',
        'EX-B3a': 'M-29',
      };
      const params: unknown[] = [];
      let idClause = '';
      if (args.id) {
        params.push(args.id);
        idClause = `AND (tr.rule_id = $1 OR tr.kpi_id = $1 OR kd.bet_id = $1)`;
      }
      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT tr.rule_id, tr.kpi_id, tr.evaluate_at, tr.keep_if, tr.change_if,
                tr.escalate_if, tr.response, tr.owner_role, tr.decision_id, tr.rule_status,
                kd.name AS kpi_name, kd.bet_id, kd.metric_id,
                ex.experiment_id, ex.sample_size, ex.population, ex.time_limit
           FROM public.threshold_rule tr
           LEFT JOIN public.kpi_definition kd
             ON kd.kpi_id = tr.kpi_id AND kd.valid_to IS NULL AND NOT kd.is_deleted
           LEFT JOIN public.experiment ex
             ON ex.rule_id = tr.rule_id AND ex.record_class = 'operating_plan' AND NOT ex.is_deleted
          WHERE tr.valid_to IS NULL AND NOT tr.is_deleted ${idClause}
          ORDER BY tr.rule_id`,
        params
      );

      const metricCache = new Map<string, CoercedMetricResult>();
      for (const row of qRes.rows) {
        const mId =
          RULE_METRIC_OVERRIDE[String(row.rule_id)] ??
          (row.metric_id ? String(row.metric_id) : null);
        if (
          mId &&
          METRIC_ID_RE.test(mId) &&
          !metricCache.has(mId) &&
          (!profile.isViewerOnly || !VIEWER_RESTRICTED_METRICS.has(mId))
        ) {
          const mRes = await ctx.pool.query<Record<string, unknown>>(
            `SELECT * FROM metrics.get_metric($1, $2, $3, $4::date, '{}'::jsonb)`,
            [mId, ed.record_class, ed.edition_id, asOf]
          );
          if (mRes.rows[0]) {
            metricCache.set(mId, coerceMetricRow(mRes.rows[0]));
          }
        }
      }

      const festDateIst = extractIstDateFromTimestamp(ed.starts_at);
      const cashGateDueDate = festDateIst ? addDaysIso(festDateIst, -7) : null;
      const isHistorical = ed.record_class === 'historical_synthetic';
      const cashGateNotDueMessage =
        !isHistorical && cashGateDueDate && asOf < cashGateDueDate
          ? `Not yet due: evaluated on ${formatShortDisplayDate(cashGateDueDate)}`
          : null;

      const rules = qRes.rows.map((row) => {
        const ruleId = String(row.rule_id);
        const effectiveMetricId =
          RULE_METRIC_OVERRIDE[ruleId] ??
          (row.metric_id ? String(row.metric_id) : null);
        const restricted =
          Boolean(effectiveMetricId) &&
          profile.isViewerOnly &&
          VIEWER_RESTRICTED_METRICS.has(effectiveMetricId!);
        const metricRow =
          effectiveMetricId && !restricted
            ? metricCache.get(effectiveMetricId) ?? null
            : null;
        const snapshot: RuleMetricSnapshot | null = restricted
          ? {
              metric_id: effectiveMetricId,
              value: null,
              computable: false,
              reason: 'Restricted for viewer role',
            }
          : metricRow
            ? {
                metric_id: effectiveMetricId,
                value: metricRow.value,
                computable: metricRow.computable,
                reason: metricRow.reason,
              }
            : null;
        const ev = evaluateRuleBand(
          ruleId,
          snapshot,
          ruleId === 'EX-B2 (gate)'
            ? { notDueMessage: cashGateNotDueMessage }
            : undefined
        );
        const minSample = requiredSampleFloor(row.sample_size);
        const observedSample = metricRow?.denominator;
        const sampleIncomplete = minSample !== null && (
          observedSample === null || observedSample === undefined ||
          !Number.isFinite(Number(observedSample)) || Number(observedSample) < minSample
        );
        const finalEvaluation = sampleIncomplete
          ? { band: 'unavailable' as const, status_label: `insufficient sample (${observedSample ?? 'unknown'}/${minSample})`, severity: 'neutral' as const }
          : ev;
        return {
          ...row,
          metric_id: effectiveMetricId,
          current_value: metricRow?.value ?? null,
          current_numerator: metricRow?.numerator ?? null,
          current_denominator: metricRow?.denominator ?? null,
          current_unit: metricRow?.unit ?? null,
          computable: metricRow?.computable ?? false,
          reason: metricRow?.reason ?? (restricted ? 'Restricted for viewer role' : null),
          band: finalEvaluation.band,
          status_label: finalEvaluation.status_label,
          severity: finalEvaluation.severity,
        };
      });

      acc.citations.push({
        type: 'reference',
        id: args.id ?? 'threshold_rule',
        title: `Operating threshold rules (${ed.edition_id})`,
        record_class: ed.record_class,
        data_version: dataVersion,
      });

      const payload = {
        source: 'rules_evaluation',
        record_class: ed.record_class,
        edition_id: ed.edition_id,
        as_of: asOf,
        data_version: dataVersion,
        rules,
      };
      acc.toolResults.push(payload);
      return payload;
    }

    const querySpec: Record<
      'kpi' | 'experiment' | 'assumption' | 'decision' | 'bet',
      { sql: string; pk: string; table: string }
    > = {
      kpi: {
        table: 'kpi_definition',
        pk: 'kpi_id',
        sql: `SELECT kpi_id, name, bet_id, kpi_type, definition, grain, frequency, metric_id
                FROM public.kpi_definition WHERE valid_to IS NULL AND NOT is_deleted`,
      },
      experiment: {
        table: 'experiment',
        pk: 'experiment_id',
        sql: `SELECT experiment_id, bet_id, hypothesis, population, intervention,
                     sample_size, time_limit, primary_kpi_id, rule_id, status
                FROM public.experiment WHERE NOT is_deleted`,
      },
      assumption: {
        table: 'model_assumption',
        pk: 'assumption_id',
        sql: `SELECT assumption_id, variable, frozen_value, unit, uncertainty,
                     status, rationale, validation_method, evidence_class
                FROM public.model_assumption WHERE NOT is_deleted`,
      },
      decision: {
        table: 'decision_record',
        pk: 'decision_id',
        sql: `SELECT decision_id, title, status, approved_at, approved_by,
                     superseded_by_id, document_uri, evidence_class
                FROM public.decision_record WHERE NOT is_deleted`,
      },
      bet: {
        table: 'bet',
        pk: 'bet_id',
        sql: `SELECT bet_id, name, rank, decision_id, scenarios
                FROM public.bet WHERE NOT is_deleted`,
      },
    };

    const spec = querySpec[args.kind];
    const params: unknown[] = [];
    let extra = '';
    if (args.id) {
      params.push(args.id);
      extra = ` AND ${spec.pk} = $1`;
    }
    const qRes = await ctx.pool.query<Record<string, unknown>>(
      `${spec.sql}${extra} ORDER BY ${spec.pk} LIMIT 40`,
      params
    );

    acc.citations.push({
      type: 'reference',
      id: args.id ?? spec.table,
      title: `${args.kind} register`,
      record_class: 'operating_plan',
      data_version: dataVersion,
    });

    const payload = {
      source: spec.table,
      record_class: 'operating_plan',
      edition_id: ed.edition_id,
      as_of: asOf,
      data_version: dataVersion,
      rows: qRes.rows,
    };
    acc.toolResults.push(payload);
    return payload;
  }

  if (toolName === 'search_knowledge') {
    return executeSearchKnowledge(ctx.pool, rawArgs, dataVersion, acc);
  }

  if (toolName === 'list_records') {
    const args = ListRecordsArgsSchema.parse(rawArgs);
    const editionId = args.edition_id ?? ctx.userSeason.editionId;
    const ed = await resolveEditionFromPool(ctx.pool, editionId);
    const limit = Math.min(25, Math.max(1, args.limit ?? 15));
    const f = {
      ...(args.filters ?? {}),
      ...(args.state && !args.filters?.state ? { state: args.state } : {}),
    };

    if (args.summarize && args.kind !== 'opportunities') throw new Error('Cohort summary requires opportunities.');
    let rows: Record<string, unknown>[] = [];

    if (args.kind === 'opportunities') {
      if (profile.opportunitiesScope === 'none') {
        throw new Error('Your role does not permit viewing opportunities.');
      }
      const asOfDate =
        ed.edition_id === 'ED-2025' && ed.edition_id !== ctx.userSeason.editionId ? '2025-04-20' : ctx.userSeason.asOf;
      const eodCutoff = `${asOfDate}T23:59:59.999+05:30`;
      const params: unknown[] = [ed.edition_id, ed.record_class, eodCutoff];
      const where = [
        'o.edition_id = $1',
        'o.record_class = $2',
        'NOT o.is_deleted',
        'sv.stage IS NOT NULL',
      ];
      if (profile.opportunitiesScope === 'own') {
        params.push(ctx.actorMemberId);
        where.push(`sv.owner_member_id = $${params.length}`);
      }
      if (f.owner_member_id) {
        params.push(f.owner_member_id);
        where.push(`sv.owner_member_id = $${params.length}`);
      }
      if (f.stage) {
        params.push(f.stage);
        where.push(`sv.stage = $${params.length}`);
      }
      if (f.state) {
        const normalizedState =
          f.state === 'signed' || f.state === 'won' ? 'confirmed' : f.state;
        if (normalizedState === 'open') {
          where.push(
            `sv.stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')`
          );
        } else if (normalizedState === 'confirmed') {
          where.push(`sv.stage = 'partner_confirmed'`);
        } else if (normalizedState === 'lost') {
          where.push(
            `sv.stage NOT IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed')`
          );
        }
      }
      if (f.campaign_id) {
        params.push(f.campaign_id);
        where.push(`o.originating_campaign_id = $${params.length}`);
      }
      if (f.channel_group) {
        params.push(f.channel_group);
        where.push(`ch.channel_group = $${params.length}`);
      }
      if (f.sponsor_id) {
        params.push(f.sponsor_id);
        where.push(`o.sponsor_id = $${params.length}`);
      }
      if (f.bet_id) {
        params.push(f.bet_id);
        where.push(`o.bet_id = $${params.length}`);
      }
      if (f.search) {
        params.push(`%${f.search}%`);
        where.push(
          `(sp.display_name ILIKE $${params.length} OR o.name ILIKE $${params.length})`
        );
      }

      const cohort = `           FROM public.opportunity o
           JOIN public.sponsor sp ON sp.sponsor_id = o.sponsor_id
           LEFT JOIN public.campaign c ON c.campaign_id = o.originating_campaign_id AND NOT c.is_deleted
           LEFT JOIN public.channel ch ON ch.channel_id = c.channel_id
           LEFT JOIN LATERAL (
             SELECT * FROM public.opportunity_stage_version osv
              WHERE osv.opportunity_id = o.opportunity_id
                AND osv.valid_from <= $3::timestamptz
                AND NOT osv.is_deleted
              ORDER BY osv.valid_from DESC, osv.history_id DESC LIMIT 1
           ) sv ON true
           LEFT JOIN public.team_member tm ON tm.member_id = sv.owner_member_id
          WHERE ${where.join(' AND ')}
`;
      if (args.summarize) {
        const summary = await ctx.pool.query<Record<string, unknown>>(
          `SELECT COUNT(*)::int AS opportunities, COUNT(DISTINCT o.sponsor_id)::int AS sponsors,
                  MIN(sv.confirmed_value) FILTER (WHERE sv.stage = 'partner_confirmed') AS min_signed_value,
                  MAX(sv.confirmed_value) FILTER (WHERE sv.stage = 'partner_confirmed') AS max_signed_value
             ${cohort}`, params);
        rows = summary.rows.map(row => ({
          opportunities: row.opportunities,
          sponsors: row.sponsors,
          min_signed_value: profile.redactFinancials ? null : toNum(row.min_signed_value),
          max_signed_value: profile.redactFinancials ? null : toNum(row.max_signed_value),
        }));
      } else {
        params.push(limit);
        const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT o.opportunity_id, o.name, o.sponsor_id, sp.display_name AS sponsor_name,
                o.originating_campaign_id AS campaign_id, o.bet_id, o.support_type,
                sv.stage,
                CASE
                  WHEN sv.stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating') THEN 'open'
                  WHEN sv.stage = 'partner_confirmed' THEN 'confirmed'
                  ELSE 'lost'
                END AS state,
                sv.proposed_value, sv.confirmed_value,
                sv.owner_member_id, tm.full_name AS owner_name,
                sv.valid_from AS stage_since, o.created_at
           ${cohort}
          ORDER BY sv.valid_from DESC NULLS LAST, o.created_at DESC
          LIMIT $${params.length}`,
        params
      );
        rows = qRes.rows.map((r) => ({
          ...r,
          proposed_value: toNum(r.proposed_value),
          confirmed_value: toNum(r.confirmed_value),
        }));
      }
    } else if (args.kind === 'tasks') {
      if (profile.tasksScope === 'none') {
        throw new Error('Your role does not permit viewing tasks.');
      }
      const params: unknown[] = [ed.edition_id, ed.record_class, limit];
      const where = [
        't.edition_id = $1',
        't.record_class = $2',
        'NOT t.is_deleted',
      ];
      if (profile.tasksScope === 'own') {
        params.push(ctx.actorMemberId);
        where.push(`t.owner_member_id = $${params.length}`);
      }
      if (f.owner_member_id) {
        params.push(f.owner_member_id);
        where.push(`t.owner_member_id = $${params.length}`);
      }
      if (f.linked_type) {
        params.push(f.linked_type);
        where.push(`t.linked_type = $${params.length}`);
      }
      if (f.linked_id) {
        params.push(f.linked_id);
        where.push(`t.linked_id = $${params.length}`);
      }
      if (f.status) {
        params.push(f.status);
        where.push(`t.status = $${params.length}`);
      }
      if (f.bet_id) {
        params.push(f.bet_id);
        where.push(`t.bet_id = $${params.length}`);
      }
      if (f.overdue) {
        where.push(`t.status IN ('open', 'in_progress', 'blocked') AND t.due_at < now()`);
      }
      if (f.search) {
        params.push(`%${f.search}%`);
        where.push(`t.title ILIKE $${params.length}`);
      }

      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT t.task_id, t.title, t.task_type, t.status, t.linked_type, t.linked_id,
                t.bet_id, t.owner_member_id, tm.full_name AS owner_name,
                t.due_at, t.completed_at
           FROM public.task t
           LEFT JOIN public.team_member tm ON tm.member_id = t.owner_member_id
          WHERE ${where.join(' AND ')}
          ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
          LIMIT $3`,
        params
      );
      rows = qRes.rows;
    } else if (args.kind === 'receivables') {
      if (profile.redactFinancials || profile.contractsScope === 'none') {
        throw new Error(
          'Your role is not permitted to view contracts or receivables.'
        );
      }
      const contractRows = await queryReceivablesContracts(ctx.pool, {
        editionId: ed.edition_id,
        recordClass: ed.record_class,
        profile,
        actorMemberId: ctx.actorMemberId,
        sponsorId: f.sponsor_id ?? null,
        activeOnly: true,
        orderBy: 'outstanding',
        limit,
      });
      const filteredContracts = f.search
        ? contractRows.filter(
            (c) =>
              c.sponsor_name.toLowerCase().includes(f.search!.toLowerCase()) ||
              c.opportunity_name.toLowerCase().includes(f.search!.toLowerCase())
          )
        : contractRows;
      let scheduleByContract = new Map<string, Record<string, unknown>[]>();
      const visibleContractIds = filteredContracts.map((c) => c.contract_id);
      if (profile.scheduleScope !== 'none' && visibleContractIds.length) {
        const scheduleResult = await ctx.pool.query<Record<string, unknown>>(
          `SELECT contract_id, schedule_item_id, kind, due_date, amount_due,
                  allocated_amount, remaining_amount
             FROM public.payment_schedule_item_status_view
            WHERE record_class = $2
              AND contract_id = ANY($1::text[])
            ORDER BY due_date ASC, schedule_item_id ASC`,
          [visibleContractIds, ed.record_class]
        );
        scheduleByContract = new Map();
        for (const item of scheduleResult.rows) {
          const key = String(item.contract_id);
          const list = scheduleByContract.get(key) ?? [];
          list.push({
            schedule_item_id: item.schedule_item_id,
            kind: item.kind,
            due_date: item.due_date instanceof Date ? item.due_date.toISOString().slice(0, 10) : item.due_date,
            amount_due: toNum(item.amount_due),
            allocated_amount: toNum(item.allocated_amount),
            remaining_amount: toNum(item.remaining_amount),
          });
          scheduleByContract.set(key, list);
        }
      }
      rows = filteredContracts.map((c) => {
        const schedule = scheduleByContract.get(c.contract_id) ?? [];
        const scheduleSummary = schedule
          .filter(item => Number(item.remaining_amount) > 0 && item.due_date)
          .map(item => `${String(item.due_date).slice(0, 10)} (${Number(item.remaining_amount).toLocaleString('en-IN')} remaining)`)
          .join('; ');
        return ({
        contract_id: c.contract_id,
        sponsor_id: c.sponsor_id,
        sponsor_name: c.sponsor_name,
        opportunity_id: c.opportunity_id,
        opportunity_name: c.opportunity_name,
        payment_terms: c.payment_terms,
        signed_at: c.signed_at,
        cash_signed: c.cash_signed,
        cash_received: c.cash_received,
        outstanding: c.outstanding,
        overdue_amount: c.overdue_amount,
        payment_schedule: schedule,
        payment_schedule_summary: scheduleSummary || null,
        status: c.status,
        owner_name: c.owner_name,
      });
      });
    } else if (args.kind === 'sponsors') {
      if (profile.sponsorsScope === 'none') {
        throw new Error('Your role does not permit viewing sponsors.');
      }
      const params: unknown[] = [ed.record_class, limit];
      const where = ['s.record_class = $1', 'NOT s.is_deleted'];
      if (profile.sponsorsScope === 'own') {
        params.push(ctx.actorMemberId);
        where.push(`(oa.member_id = $${params.length} OR s.created_by = $${params.length})`);
      }
      if (f.status) {
        params.push(f.status);
        where.push(`s.lifecycle_status = $${params.length}`);
      }
      if (f.search) {
        params.push(`%${f.search}%`);
        where.push(`s.display_name ILIKE $${params.length}`);
      }
      // Deliberately omit s.gstin
      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT s.sponsor_id, s.display_name, s.category_id, s.lifecycle_status,
                s.first_source, s.city, oa.member_id AS owner_member_id,
                tm.full_name AS owner_name, s.created_at
           FROM public.sponsor s
           LEFT JOIN LATERAL (
             SELECT member_id FROM public.ownership_assignment oax
              WHERE oax.subject_type = 'sponsor'
                AND oax.subject_id = s.sponsor_id
                AND oax.record_class = s.record_class
                AND oax.valid_to IS NULL AND NOT oax.is_deleted
              ORDER BY oax.valid_from DESC LIMIT 1
           ) oa ON true
           LEFT JOIN public.team_member tm ON tm.member_id = oa.member_id
          WHERE ${where.join(' AND ')}
          ORDER BY s.display_name ASC
          LIMIT $2`,
        params
      );
      rows = qRes.rows;
    } else if (args.kind === 'campaigns') {
      const params: unknown[] = [ed.edition_id, ed.record_class, limit];
      const where = [
        'c.edition_id = $1',
        'c.record_class = $2',
        'NOT c.is_deleted',
      ];
      if (f.status) {
        params.push(f.status);
        where.push(`c.status = $${params.length}`);
      }
      if (f.bet_id) {
        params.push(f.bet_id);
        where.push(`c.bet_id = $${params.length}`);
      }
      if (f.search) {
        params.push(`%${f.search}%`);
        where.push(`c.name ILIKE $${params.length}`);
      }
      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT c.campaign_id, c.name, c.status, c.bet_id, ch.channel_group,
                c.owner_member_id, tm.full_name AS owner_name,
                c.planned_start, c.planned_end, c.created_at
           FROM public.campaign c
           LEFT JOIN public.channel ch ON ch.channel_id = c.channel_id
           LEFT JOIN public.team_member tm ON tm.member_id = c.owner_member_id
          WHERE ${where.join(' AND ')}
          ORDER BY c.created_at DESC
          LIMIT $3`,
        params
      );
      rows = qRes.rows;
    } else if (args.kind === 'contacts') {
      if (profile.redactPii || profile.sponsorsScope === 'none') {
        throw new Error(
          'Contact personal details are restricted for your role.'
        );
      }
      const params: unknown[] = [ed.record_class, limit];
      const where = ['ct.record_class = $1', 'NOT ct.is_deleted'];
      if (profile.sponsorsScope === 'own') {
        params.push(ctx.actorMemberId);
        where.push(
          `EXISTS (
            SELECT 1 FROM public.ownership_assignment oa
             WHERE oa.subject_type = 'sponsor'
               AND oa.subject_id = ct.sponsor_id
               AND oa.member_id = $${params.length}
               AND oa.valid_to IS NULL AND NOT oa.is_deleted
          )`
        );
      }
      if (f.sponsor_id) {
        params.push(f.sponsor_id);
        where.push(`ct.sponsor_id = $${params.length}`);
      }
      if (f.search) {
        params.push(`%${f.search}%`);
        where.push(
          `(ct.full_name ILIKE $${params.length} OR sp.display_name ILIKE $${params.length})`
        );
      }
      // Deliberately omit phone numbers
      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT ct.contact_id, ct.sponsor_id, sp.display_name AS sponsor_name,
                ct.full_name, ct.job_title, ct.decision_role, ct.email,
                ct.opted_out_at
           FROM public.contact ct
           JOIN public.sponsor sp ON sp.sponsor_id = ct.sponsor_id
          WHERE ${where.join(' AND ')}
          ORDER BY ct.full_name ASC
          LIMIT $2`,
        params
      );
      rows = qRes.rows;
    } else if (args.kind === 'team_members') {
      const params: unknown[] = [ed.edition_id, ed.record_class, limit];
      const where = [
        'tm.record_class = $2',
        'tm.is_active = true',
        'NOT tm.is_deleted',
      ];
      if (f.search) {
        params.push(`%${f.search}%`);
        where.push(`tm.full_name ILIKE $${params.length}`);
      }
      // Deliberately omit email and auth_user_id PII
      const qRes = await ctx.pool.query<Record<string, unknown>>(
        `SELECT tm.member_id, tm.full_name, ra.role
           FROM public.team_member tm
           LEFT JOIN public.role_assignment ra
             ON ra.member_id = tm.member_id
            AND ra.edition_id = $1
            AND ra.is_current = true
            AND ra.valid_to IS NULL
            AND NOT ra.is_deleted
          WHERE ${where.join(' AND ')}
          ORDER BY tm.full_name ASC
          LIMIT $3`,
        params
      );
      rows = qRes.rows;
    }

    acc.citations.push({
      type: 'record',
      id: `${args.kind}:${ed.edition_id}`,
      title: `${args.kind} (${rows.length} rows, ${ed.edition_id})`,
      record_class: ed.record_class,
      data_version: dataVersion,
    });

    const payload = {
      source: `list_${args.kind}`,
      kind: args.kind,
      record_class: ed.record_class,
      edition_id: ed.edition_id,
      as_of: ctx.userSeason.asOf,
      data_version: dataVersion,
      count: rows.length,
      rows,
      // A name search that finds nothing is stated explicitly, so the answer
      // says "no record of ..." instead of inventing details (guardrail D6).
      ...(f.search ? { search: f.search } : {}),
      ...(f.state ? { state: f.state === 'signed' || f.state === 'won' ? 'confirmed' : f.state } : {}),
      ...(f.search && rows.length === 0
        ? { no_record: `I have no record of "${f.search}" in ${args.kind} (${ed.edition_id}).` }
        : {}),
    };
    acc.toolResults.push(payload);
    return payload;
  }

  throw new Error(`Unknown read tool "${toolName}".`);
}

import { z } from 'zod';
import {
  addDaysIso,
  computeWeekEndDates,
  isValidIsoDate,
} from '../gates.ts';
import type { CanonicalRole } from '../permissions.ts';
import {
  ALLOWED_CHANNEL_GROUPS,
  coerceMetricRow,
  evaluateScopeAndRedaction,
  queryReceivablesContracts,
  toNum,
  VIEWER_RESTRICTED_METRICS,
  type CoercedMetricResult,
} from '../routes/readApi.ts';
import {
  resolveCampaign,
  resolveTeamMember,
  type EntityAmbiguityItem,
} from './actions.ts';
import type { OpenRouterToolDefinition } from './openrouter.ts';
import type { QueryablePool } from './tools.ts';

const METRIC_ID_RE = /^M-(0[1-9]|[12][0-9]|30)$/;

const CHANNEL_GROUP_LIST: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'warm', label: 'Warm (introductions & referrals)' },
  { id: 'inbound', label: 'Inbound (web form)' },
  { id: 'renewal', label: 'Renewal (past sponsors)' },
  { id: 'premium', label: 'Premium (pre-season inventory)' },
  { id: 'cold', label: 'Cold (email & LinkedIn)' },
];

const METRIC_LABELS: Record<string, string> = {
  'M-01': 'Cash collected before fest',
  'M-02': 'Signed sponsorship value',
  'M-03': 'Signed cash-type value',
  'M-04': 'In-kind value',
  'M-05': 'Gross signed value',
  'M-06': 'Collection rate',
  'M-07': 'Outstanding cash',
  'M-08': 'Signed value pacing',
  'M-09': 'Signed cash vs Base',
  'M-10': 'Signed cash vs Plan',
  'M-21': 'Open pipeline value',
  'M-22': 'Weighted pipeline value',
  'M-23': 'Meetings booked',
  'M-24': 'Proposals sent',
};

const SetViewFilterSchema = z
  .object({
    campaign_id: z.string().trim().min(1).optional(),
    channel_group: z
      .enum(['warm', 'inbound', 'cold', 'renewal', 'premium'])
      .optional(),
    bet_id: z.string().trim().min(1).optional(),
    scenario_id: z.string().trim().min(1).optional(),
    owner_member_id: z.string().trim().min(1).optional(),
    // Names are accepted and resolved on the server ("Kavya" -> SIM-PART).
    owner_name: z.string().trim().min(1).optional(),
    campaign_name: z.string().trim().min(1).optional(),
    stage: z.string().trim().min(1).optional(),
  })
  .strict()
  .optional();

function normalizeWidgetRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  if (out.kind === undefined && out.type !== undefined) {
    out.kind = out.type;
  }
  delete out.type;
  if (out.group_by === undefined && out.by !== undefined) {
    out.group_by = out.by;
  }
  delete out.by;
  if (out.entity === undefined && out.list_kind !== undefined) {
    out.entity = out.list_kind;
  }
  delete out.list_kind;
  return out;
}

const WidgetRequestSchema = z.preprocess(
  normalizeWidgetRaw,
  z
    .object({
      kind: z.enum(['metric_by', 'series', 'table']),
      title: z.string().trim().min(1).max(160),
      metric_id: z.string().trim().regex(METRIC_ID_RE).optional(),
      group_by: z.enum(['campaign', 'channel_group', 'bet']).optional(),
      entity: z
        .enum(['opportunities', 'tasks', 'campaigns', 'sponsors', 'receivables'])
        .optional(),
      from: z.string().trim().refine(isValidIsoDate).optional(),
      to: z.string().trim().refine(isValidIsoDate).optional(),
      stage: z.string().trim().min(1).optional(),
      status: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(15).optional(),
    })
    .strict()
);

export const SetViewArgsSchema = z
  .object({
    screen: z
      .enum([
        'overview',
        'campaigns',
        'sponsors',
        'pipeline',
        'analytics',
        'collections',
        'tasks',
      ])
      .default('analytics'),
    title: z.string().trim().min(1).max(160).optional(),
    edition_id: z.string().trim().min(1).optional(),
    as_of: z.string().trim().refine(isValidIsoDate).optional(),
    filters: SetViewFilterSchema,
    pinned_metrics: z
      .array(z.string().trim().regex(METRIC_ID_RE))
      .max(8)
      .optional()
      .default([]),
    widgets: z.array(WidgetRequestSchema).max(4).optional().default([]),
  })
  .strict();

export const SET_VIEW_TOOL_DEFINITION: OpenRouterToolDefinition = {
  type: 'function',
  function: {
    name: 'set_view',
    description:
      'Render a custom grounded dashboard view (screen, filters, up to 8 pinned KPIs, metric_by/series/table widgets).',
    parameters: {
      type: 'object',
      properties: {
        screen: {
          type: 'string',
          enum: [
            'overview',
            'campaigns',
            'sponsors',
            'pipeline',
            'analytics',
            'collections',
            'tasks',
          ],
        },
        title: { type: 'string' },
        edition_id: { type: 'string' },
        as_of: { type: 'string' },
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
            owner_member_id: { type: 'string', description: 'member id or name' },
            owner_name: { type: 'string', description: 'team member name, e.g. Kavya' },
            campaign_name: { type: 'string' },
            stage: { type: 'string' },
          },
          additionalProperties: false,
        },
        pinned_metrics: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string' },
        },
        widgets: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['metric_by', 'series', 'table'],
              },
              title: { type: 'string' },
              metric_id: { type: 'string' },
              group_by: {
                type: 'string',
                enum: ['campaign', 'channel_group', 'bet'],
              },
              entity: {
                type: 'string',
                enum: [
                  'opportunities',
                  'tasks',
                  'campaigns',
                  'sponsors',
                  'receivables',
                ],
              },
              from: { type: 'string' },
              to: { type: 'string' },
              stage: { type: 'string' },
              status: { type: 'string' },
              limit: { type: 'integer', minimum: 1, maximum: 15 },
            },
            required: ['kind', 'title'],
            additionalProperties: false,
          },
        },
      },
      required: ['screen'],
      additionalProperties: false,
    },
  },
};

function makeRestrictedMetric(
  metricId: string,
  editionId: string,
  recordClass: string,
  asOf: string,
  dataVersion: number,
  filters: Record<string, string>
): CoercedMetricResult {
  return {
    metric_id: metricId,
    value: null,
    unit: null,
    numerator: null,
    denominator: null,
    computable: false,
    reason: 'Restricted for viewer role',
    applied_filters: filters,
    record_class: recordClass,
    edition_id: editionId,
    as_of: asOf,
    data_version: dataVersion,
    definition_version: null,
    series_key: null,
  };
}

function formatMetricSummaryValue(m: CoercedMetricResult): string {
  if (!m.computable || m.value === null) {
    return `Not computable (${m.reason || 'unavailable'})`;
  }
  if (m.unit === 'INR' || m.unit === '₹') {
    return `₹${Number(m.value).toLocaleString('en-IN')}`;
  }
  if (m.unit === 'ratio' || m.unit === '%') {
    const pct = m.value <= 1 ? m.value * 100 : m.value;
    return `${pct.toFixed(1)}%`;
  }
  return `${m.value}${m.unit ? ` ${m.unit}` : ''}`;
}

export async function executeSetView(
  rawArgs: unknown,
  ctx: {
    actorMemberId: string;
    roles: CanonicalRole[];
    editionId: string;
    recordClass: 'live' | 'simulated' | 'historical_synthetic';
    asOf: string;
    pool: QueryablePool;
  }
): Promise<{
  /** Absent when an id/name could not be resolved; the answer then asks which. */
  viewSpec?: Record<string, unknown>;
  answer: string;
  toolPayload: Record<string, unknown>;
  metricResults: CoercedMetricResult[];
}> {
  const args = SetViewArgsSchema.parse(rawArgs ?? {});
  const profile = evaluateScopeAndRedaction(ctx.roles);

  const verRes = await ctx.pool.query<{ data_version: string | number }>(
    `SELECT data_version FROM public.app_state WHERE id = 1`
  );
  const dataVersion = Number(verRes.rows[0]?.data_version ?? 1);

  const targetEditionId = args.edition_id ?? ctx.editionId;
  const edRes = await ctx.pool.query<{
    edition_id: string;
    record_class: string;
    season_start: Date | string | null;
  }>(
    `SELECT edition_id, record_class, season_start
       FROM public.festival_edition
      WHERE edition_id = $1 AND NOT is_deleted
      LIMIT 1`,
    [targetEditionId]
  );
  const edRow = edRes.rows[0];
  const editionId = edRow?.edition_id ?? targetEditionId;
  const recordClass = (edRow?.record_class ??
    ctx.recordClass) as 'live' | 'simulated' | 'historical_synthetic';
  const seasonStart = edRow?.season_start
    ? edRow.season_start instanceof Date
      ? edRow.season_start.toISOString().slice(0, 10)
      : String(edRow.season_start).slice(0, 10)
    : null;
  const asOf =
    args.as_of ?? (editionId === 'ED-2025' ? '2025-04-20' : ctx.asOf);

  const cleanFilters: Record<string, string> = {};
  if (args.filters) {
    for (const [k, v] of Object.entries(args.filters)) {
      if (v) {
        if (k === 'channel_group' && !ALLOWED_CHANNEL_GROUPS.has(v)) {
          throw new Error(`Invalid channel_group "${v}".`);
        }
        cleanFilters[k] = v;
      }
    }
  }

  // Validate every id against the database, resolving names the same way
  // propose_changes does. Nothing is rendered if any id is unknown or ambiguous.
  if (!edRow) {
    throw new Error(`Unknown edition_id "${targetEditionId}".`);
  }
  const unresolved: EntityAmbiguityItem[] = [];
  const ownerQuery = cleanFilters.owner_name ?? cleanFilters.owner_member_id;
  delete cleanFilters.owner_name;
  delete cleanFilters.owner_member_id;
  if (ownerQuery) {
    const m = await resolveTeamMember(ctx.pool, ownerQuery, 'owner_member_id');
    if (m.ok) cleanFilters.owner_member_id = m.id;
    else unresolved.push(m.ambiguity);
  }
  const campaignQuery = cleanFilters.campaign_name ?? cleanFilters.campaign_id;
  delete cleanFilters.campaign_name;
  delete cleanFilters.campaign_id;
  if (campaignQuery) {
    const c = await resolveCampaign(ctx.pool, campaignQuery, editionId, recordClass);
    if (c.ok) cleanFilters.campaign_id = c.id;
    else unresolved.push(c.ambiguity);
  }
  if (cleanFilters.bet_id) {
    const q = cleanFilters.bet_id;
    const b = await ctx.pool.query<{ bet_id: string; name: string }>(
      `SELECT bet_id, name FROM public.bet
        WHERE NOT is_deleted AND (bet_id = $1 OR LOWER(name) LIKE LOWER($2))
        ORDER BY bet_id LIMIT 10`,
      [q, `%${q}%`]
    );
    const exact = b.rows.find((r) => r.bet_id === q);
    if (exact || b.rows.length === 1) cleanFilters.bet_id = (exact ?? b.rows[0]).bet_id;
    else
      unresolved.push({
        field: 'bet_id',
        query: q,
        not_found: b.rows.length === 0 ? true : undefined,
        candidates: b.rows.map((r) => ({ id: r.bet_id, label: `${r.name} (${r.bet_id})` })),
      });
  }
  if (cleanFilters.scenario_id) {
    const s = await ctx.pool.query<{ scenario_id: string }>(
      `SELECT scenario_id FROM public.scenario_reference
        WHERE scenario_id = $1 AND status = 'APPROVED' AND NOT is_deleted LIMIT 1`,
      [cleanFilters.scenario_id]
    );
    if (!s.rows[0])
      unresolved.push({
        field: 'scenario_id',
        query: cleanFilters.scenario_id,
        not_found: true,
        candidates: [],
      });
  }
  if (unresolved.length > 0) {
    const lines = unresolved.map((u) =>
      u.not_found
        ? `- No ${u.field.replace(/_id$/, '')} matches "${u.query}"${u.field === 'scenario_id' ? ' among approved scenarios' : ''}.`
        : `- "${u.query}" matches several: ${u.candidates.map((c) => c.label).join(', ')}. Which one did you mean?`
    );
    return {
      answer: `I didn't change the view. Please clarify:\n${lines.join('\n')}`,
      toolPayload: {
        status: unresolved.every((u) => u.not_found) ? 'not_found' : 'ambiguous',
        unresolved,
      },
      metricResults: [],
    };
  }

  const metricFilterOnly = (
    extra: Record<string, string> = {}
  ): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const k of ['campaign_id', 'channel_group', 'bet_id', 'scenario_id']) {
      if (cleanFilters[k]) out[k] = cleanFilters[k];
    }
    return { ...out, ...extra };
  };

  const queryMetric = async (
    metricId: string,
    extraFilters: Record<string, string> = {},
    overrideAsOf?: string
  ): Promise<CoercedMetricResult> => {
    const mergedFilters = metricFilterOnly(extraFilters);
    if (profile.isViewerOnly && VIEWER_RESTRICTED_METRICS.has(metricId)) {
      return makeRestrictedMetric(
        metricId,
        editionId,
        recordClass,
        overrideAsOf ?? asOf,
        dataVersion,
        mergedFilters
      );
    }
    const qRes = await ctx.pool.query<Record<string, unknown>>(
      `SELECT * FROM metrics.get_metric($1, $2, $3, $4::date, $5::jsonb)`,
      [
        metricId,
        recordClass,
        editionId,
        overrideAsOf ?? asOf,
        JSON.stringify(mergedFilters),
      ]
    );
    return qRes.rows[0]
      ? coerceMetricRow(qRes.rows[0])
      : {
          metric_id: metricId,
          value: null,
          unit: null,
          numerator: null,
          denominator: null,
          computable: false,
          reason: 'No metric result returned.',
          applied_filters: mergedFilters,
          record_class: recordClass,
          edition_id: editionId,
          as_of: overrideAsOf ?? asOf,
          data_version: dataVersion,
          definition_version: null,
          series_key: null,
        };
  };

  const collectedMetrics: CoercedMetricResult[] = [];
  const pinnedMetrics: Array<{
    metric_id: string;
    label: string;
    result: CoercedMetricResult;
  }> = [];

  for (const mId of args.pinned_metrics) {
    const result = await queryMetric(mId);
    collectedMetrics.push(result);
    pinnedMetrics.push({
      metric_id: mId,
      label: METRIC_LABELS[mId] ?? mId,
      result,
    });
  }

  const widgets: Array<Record<string, unknown>> = [];
  const summaryLines: string[] = [];

  for (let i = 0; i < args.widgets.length; i += 1) {
    const w = args.widgets[i];
    const widgetId = `ai-w-${i + 1}`;

    if (w.kind === 'metric_by') {
      const metricId = w.metric_id ?? 'M-02';
      const groupBy = w.group_by ?? 'channel_group';
      const totalMetric = await queryMetric(metricId);
      if (!pinnedMetrics.some((p) => p.metric_id === metricId)) {
        collectedMetrics.push(totalMetric);
      }

      const rows: Array<Record<string, unknown>> = [];
      if (groupBy === 'channel_group') {
        for (const ch of CHANNEL_GROUP_LIST) {
          const m = await queryMetric(metricId, { channel_group: ch.id });
          rows.push({
            key: ch.id,
            label: ch.label,
            metric_id: metricId,
            value: m.value,
            unit: m.unit,
            computable: m.computable,
            reason: m.reason,
          });
        }
      } else if (groupBy === 'campaign') {
        const cRes = await ctx.pool.query<{
          campaign_id: string;
          name: string;
          channel_group: string | null;
        }>(
          `SELECT c.campaign_id, c.name, ch.channel_group
             FROM public.campaign c
             LEFT JOIN public.channel ch ON ch.channel_id = c.channel_id
            WHERE c.edition_id = $1 AND c.record_class = $2 AND NOT c.is_deleted
            ORDER BY c.campaign_id ASC
            LIMIT 12`,
          [editionId, recordClass]
        );
        for (const c of cRes.rows) {
          const m = await queryMetric(metricId, { campaign_id: c.campaign_id });
          rows.push({
            key: c.campaign_id,
            label: `${c.name} (${c.campaign_id})`,
            channel_group: c.channel_group,
            metric_id: metricId,
            value: m.value,
            unit: m.unit,
            computable: m.computable,
            reason: m.reason,
          });
        }
      } else if (groupBy === 'bet') {
        const bRes = await ctx.pool.query<{ bet_id: string; name: string }>(
          `SELECT bet_id, name FROM public.bet WHERE NOT is_deleted ORDER BY rank ASC, bet_id ASC LIMIT 10`
        );
        for (const b of bRes.rows) {
          const m = await queryMetric(metricId, { bet_id: b.bet_id });
          rows.push({
            key: b.bet_id,
            label: `${b.bet_id} · ${b.name}`,
            metric_id: metricId,
            value: m.value,
            unit: m.unit,
            computable: m.computable,
            reason: m.reason,
          });
        }
      }

      widgets.push({
        id: widgetId,
        kind: 'metric_by',
        title: w.title,
        metric_id: metricId,
        group_by: groupBy,
        total_value: totalMetric.value,
        unit: totalMetric.unit,
        computable: totalMetric.computable,
        reason: totalMetric.reason,
        rows,
      });

      const nonZero = rows
        .filter((r) => typeof r.value === 'number' && Number(r.value) > 0)
        .map(
          (r) =>
            `${String(r.key)}: ${
              totalMetric.unit === 'INR' || totalMetric.unit === '₹'
                ? `₹${Number(r.value).toLocaleString('en-IN')}`
                : String(r.value)
            }`
        );
      summaryLines.push(
        `${w.title} [${metricId} total ${formatMetricSummaryValue(totalMetric)}]` +
          (nonZero.length > 0 ? ` — ${nonZero.join(', ')}` : '')
      );
    } else if (w.kind === 'series') {
      const metricId = w.metric_id ?? 'M-08';
      const toDate = w.to ?? asOf;
      const fromDate = w.from ?? seasonStart ?? addDaysIso(toDate, -42);

      const dates: string[] = [];
      if (seasonStart) {
        for (const wk of computeWeekEndDates(seasonStart, 10)) {
          if (wk.week_end >= fromDate && wk.week_end <= toDate) {
            dates.push(wk.week_end);
          }
        }
      }
      if (dates.length === 0) {
        let cur = fromDate;
        while (cur <= toDate && dates.length < 12) {
          dates.push(cur);
          cur = addDaysIso(cur, 7);
        }
        if (dates[dates.length - 1] !== toDate && dates.length < 12) {
          dates.push(toDate);
        }
      }

      const rows: Array<Record<string, unknown>> = [];
      for (const d of dates) {
        const m = await queryMetric(metricId, {}, d);
        rows.push({
          as_of: d,
          value: m.value,
          unit: m.unit,
          computable: m.computable,
          reason: m.reason,
        });
      }
      widgets.push({
        id: widgetId,
        kind: 'series',
        title: w.title,
        metric_id: metricId,
        dates,
        rows,
      });
      summaryLines.push(
        `${w.title} [${metricId} across ${dates.length} checkpoints ending ${toDate}]`
      );
    } else if (w.kind === 'table') {
      const entity = w.entity ?? 'opportunities';
      const limit = Math.min(15, Math.max(1, w.limit ?? 10));
      let rows: Array<Record<string, unknown>> = [];
      let restricted = false;
      let restrictedReason: string | null = null;

      if (entity === 'receivables') {
        if (profile.redactFinancials || profile.contractsScope === 'none') {
          restricted = true;
          restrictedReason =
            'Receivables and contracts are restricted for viewer roles.';
        } else {
          const contractRows = await queryReceivablesContracts(ctx.pool, {
            editionId,
            recordClass,
            profile,
            actorMemberId: ctx.actorMemberId,
            activeOnly: true,
            orderBy: 'outstanding',
            limit,
          });
          rows = contractRows.map((c) => ({
            contract_id: c.contract_id,
            sponsor_name: c.sponsor_name,
            opportunity_name: c.opportunity_name,
            payment_terms: c.payment_terms,
            cash_signed: c.cash_signed,
            cash_received: c.cash_received,
            outstanding: c.outstanding,
            overdue_amount: c.overdue_amount,
            status: c.status,
          }));
        }
      } else if (entity === 'opportunities') {
        if (profile.opportunitiesScope === 'none') {
          restricted = true;
          restrictedReason = 'Opportunities are restricted for your role.';
        } else {
          const params: unknown[] = [editionId, recordClass, limit];
          const where = [
            'o.edition_id = $1',
            'o.record_class = $2',
            'NOT o.is_deleted',
          ];
          if (profile.opportunitiesScope === 'own') {
            params.push(ctx.actorMemberId);
            where.push(`sv.owner_member_id = $${params.length}`);
          }
          if (cleanFilters.owner_member_id) {
            params.push(cleanFilters.owner_member_id);
            where.push(`sv.owner_member_id = $${params.length}`);
          }
          const stageFilter = w.stage ?? cleanFilters.stage;
          if (stageFilter) {
            params.push(stageFilter);
            where.push(`sv.stage = $${params.length}`);
          }
          if (cleanFilters.campaign_id) {
            params.push(cleanFilters.campaign_id);
            where.push(`o.originating_campaign_id = $${params.length}`);
          }
          if (cleanFilters.bet_id) {
            params.push(cleanFilters.bet_id);
            where.push(`o.bet_id = $${params.length}`);
          }
          const qRes = await ctx.pool.query<Record<string, unknown>>(
            `SELECT o.opportunity_id, sp.display_name AS sponsor_name, o.name,
                    sv.stage, sv.proposed_value, sv.confirmed_value,
                    tm.full_name AS owner_name
               FROM public.opportunity o
               JOIN public.sponsor sp ON sp.sponsor_id = o.sponsor_id
               LEFT JOIN LATERAL (
                 SELECT stage, proposed_value, confirmed_value, owner_member_id
                   FROM public.opportunity_stage_version osv
                  WHERE osv.opportunity_id = o.opportunity_id AND NOT osv.is_deleted
                  ORDER BY osv.valid_from DESC, osv.history_id DESC LIMIT 1
               ) sv ON true
               LEFT JOIN public.team_member tm ON tm.member_id = sv.owner_member_id
              WHERE ${where.join(' AND ')}
              ORDER BY sv.valid_from DESC NULLS LAST
              LIMIT $3`,
            params
          );
          rows = qRes.rows.map((r) => ({
            ...r,
            proposed_value: toNum(r.proposed_value),
            confirmed_value: toNum(r.confirmed_value),
          }));
        }
      } else if (entity === 'tasks') {
        if (profile.tasksScope === 'none') {
          restricted = true;
          restrictedReason = 'Tasks are restricted for your role.';
        } else {
          const params: unknown[] = [editionId, recordClass, limit];
          const where = [
            't.edition_id = $1',
            't.record_class = $2',
            'NOT t.is_deleted',
          ];
          if (profile.tasksScope === 'own') {
            params.push(ctx.actorMemberId);
            where.push(`t.owner_member_id = $${params.length}`);
          }
          if (cleanFilters.owner_member_id) {
            params.push(cleanFilters.owner_member_id);
            where.push(`t.owner_member_id = $${params.length}`);
          }
          if (w.status) {
            params.push(w.status);
            where.push(`t.status = $${params.length}`);
          }
          if (cleanFilters.bet_id) {
            params.push(cleanFilters.bet_id);
            where.push(`t.bet_id = $${params.length}`);
          }
          const qRes = await ctx.pool.query<Record<string, unknown>>(
            `SELECT t.task_id, t.title, t.task_type, t.status, t.due_at,
                    tm.full_name AS owner_name
               FROM public.task t
               LEFT JOIN public.team_member tm ON tm.member_id = t.owner_member_id
              WHERE ${where.join(' AND ')}
              ORDER BY t.due_at ASC NULLS LAST
              LIMIT $3`,
            params
          );
          rows = qRes.rows;
        }
      } else if (entity === 'campaigns') {
        const params: unknown[] = [editionId, recordClass, limit];
        const where = [
          'c.edition_id = $1',
          'c.record_class = $2',
          'NOT c.is_deleted',
        ];
        if (cleanFilters.bet_id) {
          params.push(cleanFilters.bet_id);
          where.push(`c.bet_id = $${params.length}`);
        }
        const qRes = await ctx.pool.query<Record<string, unknown>>(
          `SELECT c.campaign_id, c.name, ch.channel_group, c.bet_id, c.status
             FROM public.campaign c
             LEFT JOIN public.channel ch ON ch.channel_id = c.channel_id
            WHERE ${where.join(' AND ')}
            ORDER BY c.campaign_id ASC
            LIMIT $3`,
          params
        );
        rows = qRes.rows;
      } else if (entity === 'sponsors') {
        if (profile.sponsorsScope === 'none') {
          restricted = true;
          restrictedReason = 'Sponsors are restricted for your role.';
        } else {
          const qRes = await ctx.pool.query<Record<string, unknown>>(
            `SELECT s.sponsor_id, s.display_name, s.lifecycle_status, s.city
               FROM public.sponsor s
              WHERE s.record_class = $1 AND NOT s.is_deleted
              ORDER BY s.display_name ASC
              LIMIT $2`,
            [recordClass, limit]
          );
          rows = qRes.rows;
        }
      }

      widgets.push({
        id: widgetId,
        kind: 'table',
        title: w.title,
        entity,
        restricted,
        reason: restrictedReason,
        rows,
      });
      summaryLines.push(
        restricted
          ? `${w.title}: ${restrictedReason}`
          : `${w.title} (${rows.length} ${entity} rows)`
      );
    }
  }

  const resolvedTitle =
    args.title ||
    (widgets[0] ? String(widgets[0].title) : `Custom ${args.screen} view`);

  const viewSpec = {
    screen: args.screen,
    title: resolvedTitle,
    edition_id: editionId,
    record_class: recordClass,
    as_of: asOf,
    data_version: dataVersion,
    filters: cleanFilters,
    pinned_metrics: pinnedMetrics,
    widgets,
  };

  const pinnedSummary = pinnedMetrics.map(
    (p) => `${p.label} [${p.metric_id}]: ${formatMetricSummaryValue(p.result)}`
  );
  const allSummary = [...pinnedSummary, ...summaryLines];
  const answer =
    `Rendered dashboard view "${resolvedTitle}" (${editionId}, ${recordClass}, as of ${asOf}, data v${dataVersion})` +
    (allSummary.length > 0 ? `:\n- ${allSummary.join('\n- ')}` : '.');

  return {
    viewSpec,
    answer,
    toolPayload: {
      screen: args.screen,
      title: resolvedTitle,
      edition_id: editionId,
      record_class: recordClass,
      as_of: asOf,
      data_version: dataVersion,
      pinned_count: pinnedMetrics.length,
      widget_count: widgets.length,
    },
    metricResults: collectedMetrics,
  };
}

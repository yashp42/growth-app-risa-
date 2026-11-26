import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownAnswer } from '../src/components/analyst/MarkdownAnswer.tsx';

function md(text: string): string {
  return renderToStaticMarkup(createElement(MarkdownAnswer, null, text));
}

test('[MOCKED] Chat answers render GitHub Markdown: tables, bold and lists, with no raw | or **', () => {
  const html = md(
    [
      '**Outstanding cash** by sponsor [M-07]:',
      '',
      '| Sponsor | Outstanding |',
      '|---|---:|',
      '| Bramble Active | ₹60,000 |',
      '',
      '- Total: **₹5,92,500**',
      '1. first',
    ].join('\n')
  );
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>Sponsor<\/th>/);
  assert.match(html, /<td[^>]*>Bramble Active<\/td>/);
  assert.match(html, /<strong[^>]*>Outstanding cash<\/strong>/);
  assert.match(html, /<ul/);
  assert.match(html, /<ol/);
  const visibleText = html.replace(/<[^>]+>/g, '');
  assert.ok(!visibleText.includes('|'), 'no raw table pipes');
  assert.ok(!visibleText.includes('**'), 'no raw bold markers');
});

test('[MOCKED] Markdown rendering is sanitized: raw HTML is dropped and javascript: links are neutralised', () => {
  const html = md(
    'Hi <script>alert(1)</script><img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://example.com)'
  );
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img/i.test(html));
  assert.ok(!/onerror/i.test(html));
  assert.ok(!/javascript:/i.test(html));
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

// ---------------------------------------------------------------------------
// Change cards: titles, contract lines and ₹ formatting
// ---------------------------------------------------------------------------
import { ActionConfirmationDialog } from '../src/components/analyst/ActionConfirmationDialog.tsx';
import { ProposedBatchCard } from '../src/components/analyst/ProposedActionCard.tsx';
import { formatContractLine, formatFieldValue, formatInr, formatInrLakh } from '../src/lib/displayFormat.ts';
import { confirmDialogTitle } from '../src/services/analystApi.ts';
import type { AiActionRecord, AiPermissionProfile } from '../src/types/analyst.ts';

const minutekartConfirm: AiActionRecord = {
  ai_action_id: 'AIA-TEST1',
  batch_id: 'AIB-TEST1',
  action_type: 'confirm_deal',
  permission_level: 'L5',
  status: 'proposed',
  payload: {
    opportunity_id: 'O26-013',
    signed_at: '2026-11-26',
    payment_terms: 'standard_50_50',
    signed_value_total: 100000,
    lines: [{ consideration_type: 'cash', value: 100000 }],
  },
  affected_summary: 'Confirm deal Minutekart 2026-27 at ₹1,00,000 (standard_50_50)',
  field_diffs: [
    { field: 'stage', before: 'proposal_sent', after: 'partner_confirmed' },
    { field: 'signed_value_total', before: 0, after: 100000 },
    { field: 'contract_lines', before: [], after: [{ consideration_type: 'cash', value: 100000 }] },
  ],
};

const leadProfile: AiPermissionProfile = {
  canUseAnalyst: true,
  canConfirmTaskAction: true,
  canConfirmInteractionOrMeeting: true,
  canConfirmSponsorContactUpsert: true,
  canViewFinancialMetrics: true,
  canViewAdminAuditLogs: true,
  isViewerRestricted: false,
  verifiedByServer: true,
  roles: ['coordination_lead'],
  currentMemberId: 'SIM-LEAD',
};

test('[MOCKED] ₹ formatting: Indian grouping for exact amounts, lakh matches the dashboard (₹5.92L, ₹2.73L)', () => {
  assert.equal(formatInr(592500), '₹5,92,500');
  assert.equal(formatInr(100000), '₹1,00,000');
  assert.equal(formatInr(60000), '₹60,000');
  assert.equal(formatInrLakh(592500), '₹5.92L');
  assert.equal(formatInrLakh(272500), '₹2.73L');
  assert.equal(formatInrLakh(1340000), '₹13.40L');
  assert.equal(formatContractLine({ consideration_type: 'cash', value: 100000 }), 'Cash · ₹1,00,000');
  assert.equal(formatContractLine({ consideration_type: 'in_kind', value: 25000 }), 'In-kind · ₹25,000');
  assert.equal(formatFieldValue('signed_value_total', 100000), '₹1,00,000');
  assert.equal(formatFieldValue('due_at', '2026-11-27T18:00:00+05:30'), 'Fri 27 Nov 2026, 18:00 IST');
});

test('[MOCKED] Confirm dialog: title "Confirm deal" (no duplicate verb) and contract lines as rows, not JSON', () => {
  assert.equal(confirmDialogTitle('confirm_deal'), 'Confirm deal');
  assert.equal(confirmDialogTitle('create_task'), 'Confirm: Create task');
  const html = renderToStaticMarkup(
    createElement(ActionConfirmationDialog, {
      action: minutekartConfirm,
      onConfirm: () => undefined,
      onClose: () => undefined,
    })
  );
  assert.match(html, />Confirm deal</);
  assert.ok(!/Confirm confirm/i.test(html));
  assert.match(html, /Cash · ₹1,00,000/);
  assert.ok(!html.includes('consideration_type'), 'no raw JSON keys');
  assert.ok(!html.includes('{&quot;'), 'no JSON objects');
});

test('[MOCKED] Change card: before → after with ₹ grouping and contract lines rendered as rows', () => {
  for (const status of ['proposed', 'executed'] as const) {
    const html = renderToStaticMarkup(
      createElement(ProposedBatchCard, {
        actions: [{ ...minutekartConfirm, status }],
        permissionProfile: leadProfile,
        onConfirmAll: () => undefined,
        onCancelAll: () => undefined,
      })
    );
    assert.match(html, /Cash · ₹1,00,000/, status);
    assert.match(html, /₹1,00,000/);
    assert.ok(!html.includes('consideration_type'), `${status}: no raw JSON keys`);
    assert.ok(!html.includes('{&quot;'), `${status}: no JSON objects`);
  }
});

// ---------------------------------------------------------------------------
// 4D answer blocks (server data only; the client formats and sorts)
// ---------------------------------------------------------------------------
import { AnswerBlocks } from '../src/components/analyst/AnswerBlocks.tsx';
import type { AnswerBlock } from '../src/types/answerBlocks.ts';

test('[MOCKED] 4D blocks render: sortable table, bar, line and KPI, each with its source chip and data version', () => {
  const blocks: AnswerBlock[] = [
    {
      type: 'table',
      title: 'Receivables by active contract',
      columns: [
        { key: 'sponsor_name', label: 'Sponsor', format: 'text' },
        { key: 'outstanding', label: 'Outstanding', format: 'inr' },
      ],
      rows: [{ sponsor_name: 'Bramble Active', outstanding: 60000 }],
      source: 'list_receivables',
      data_version: 61,
      edition_id: 'ED-2026-DEMO',
    },
    {
      type: 'bar',
      title: 'Cash collected by campaign',
      metric_id: 'M-01',
      unit: 'INR',
      total: 272500,
      series: [
        { label: 'C26-WARM', value: 150000, computable: true },
        { label: 'C26-B3', value: 122500, computable: true },
      ],
      source: 'set_view · metrics.get_metric',
      data_version: 61,
    },
    {
      type: 'line',
      title: 'Cash collected by week',
      metric_id: 'M-01',
      unit: 'INR',
      series: [
        { x: '2026-11-01', y: 50000 },
        { x: '2026-11-08', y: null },
        { x: '2026-11-15', y: 272500 },
      ],
      source: 'metrics.get_metric_series',
      data_version: 61,
    },
    { type: 'kpi', metric_id: 'M-07', label: 'Outstanding cash', value: 592500, unit: 'INR', computable: true, source: 'metrics.get_metric', data_version: 61 },
    { type: 'kpi', metric_id: 'M-01', label: 'Cash collected', value: null, unit: 'INR', computable: false, reason: 'No receipts in 2025 synthetic data', source: 'metrics.get_metric', data_version: 61 },
  ];
  const html = renderToStaticMarkup(createElement(AnswerBlocks, { blocks }));
  assert.match(html, /<table/);
  assert.match(html, /Bramble Active/);
  assert.match(html, /₹60,000/);
  assert.match(html, /aria-sort="none"/, 'sortable headers');
  assert.match(html, /list_receivables · data v61/);
  assert.match(html, /aria-label="Cash collected by campaign bar chart"/);
  assert.match(html, /₹1,50,000/);
  assert.match(html, /Total \[M-01\]: <span[^>]*>₹2,72,500/);
  assert.match(html, /<svg[^>]*aria-label="Cash collected by week line chart"/);
  assert.match(html, /<polyline/);
  assert.match(html, /₹5.92L/);
  assert.match(html, /₹5,92,500/);
  assert.match(html, /Not computable/);
  assert.match(html, /No receipts in 2025 synthetic data/);
});

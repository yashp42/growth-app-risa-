import type { ToolRunAccumulator } from './tools.ts';

export type BasicAnalyticsIntent = 'signed' | 'campaign_conversion';
export function basicAnalyticsIntent(question: string, hasFilters = false): BasicAnalyticsIntent | null {
  if (hasFilters) return null;
  const q = question.trim().replace(/[?!.]+$/, '').toLowerCase();
  if (/^(?:how much sponsorship value did we sign(?: in \d{4})?|(?:what is (?:the |our )?)?(?:signed sponsorship value|signed total|total signed)(?: in \d{4})?)$/.test(q)) return 'signed';
  if (/^(?:what is |show (?:me )?)?(?:the )?proposal[- ]to[- ]win conversion (?:for each|by) campaign$/.test(q)) return 'campaign_conversion';
  return null;
}
const cell = (v: unknown) => String(v ?? '—').split('|').join(String.fromCharCode(92) + '|').replace(/[\r\n]/g, ' ');
const money = (v: unknown) => v === null || v === undefined ? 'Not computable' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
type Read = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Fixed read plans, using the same permission-checked tools as model turns. No model requests. */
export async function answerBasicAnalytics(intent: BasicAnalyticsIntent, read: Read, acc: ToolRunAccumulator): Promise<string> {
  const lines: string[] = [];
  if (intent === 'signed') {
    lines.push('| Measure | Value | Source |', '|---|---:|---|');
    for (const [id, label] of [['M-02','Total signed sponsorship value'],['M-03','Cash-type signed value'],['M-04','In-kind signed value'],['M-09','Confirmed partnerships (opportunities)']]) {
      const result = await read('get_metric', { metric_id: id });
      const row = (result.rows as Record<string, unknown>[] | undefined)?.[0];
      if (!row) throw new Error('Metric source returned no row: ' + id);
      const value = row.computable && row.value !== null ? (id === 'M-09' ? cell(row.value) : money(row.value)) : 'Not computable: ' + cell(row.reason);
      lines.push('| ' + label + ' | ' + value + ' | [' + id + '] |');
    }
    lines.push('', 'Signed commitments are distinct from cash collected.');
    await read('search_knowledge', { query: 'signed sponsorship cash type in kind synthetic dataset payment records' });
  } else {
    const campaigns = await read('list_records', { kind: 'campaigns', limit: 25 });
    const rows = campaigns.rows as Record<string, unknown>[] | undefined;
    if (!rows || rows.length >= 25) throw new Error('Campaign listing may be truncated; narrow the scope before comparing campaigns.');
    lines.push('| Campaign | Wins (numerator) | Proposals (denominator) | Conversion (source value) | Source |', '|---|---:|---:|---:|---|');
    for (const campaign of rows) {
      if (!campaign.campaign_id) throw new Error('Campaign source omitted its identifier');
      const result = await read('get_metric', { metric_id: 'M-13', filters: { campaign_id: String(campaign.campaign_id) } });
      const row = (result.rows as Record<string, unknown>[] | undefined)?.[0];
      if (!row) throw new Error('Campaign metric source returned no row');
      lines.push('| ' + cell(campaign.name ?? campaign.campaign_id) + ' | ' + cell(row.numerator) + ' | ' + cell(row.denominator) + ' | ' + (row.computable ? cell(row.value) + ' ' + cell(row.unit) : 'Not computable: ' + cell(row.reason)) + ' | [M-13] |');
    }
    if (!rows.length) lines.push('', 'No campaigns were returned for this edition.');
    lines.push('', 'The metric uses an opportunity-level denominator; brand-level counts are a different grain.');
    await read('search_knowledge', { query: 'proposal win conversion campaign opportunity brand level warm introductions upsell' });
  }
  const chunks = acc.citations.filter(c => c.type === 'knowledge' && !c.history);
  if (chunks.length) {
    lines.push('', 'Source notes:');
    for (const c of chunks) lines.push('> [' + cell(c.id) + '] ' + cell(c.text));
  } else lines.push('', 'No matching knowledge note was retrieved; the metric sources above remain authoritative.');
  return lines.join('\n');
}

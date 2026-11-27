import type { ToolRunAccumulator } from './tools.ts';

export type BasicAnalyticsIntent = 'signed' | 'campaign_conversion' | 'historical_funnel_compare' | 'channel_performance' | 'channel_why' | 'channel_actions';
export function basicAnalyticsIntent(question: string, hasFilters = false, previousQuestion = ''): BasicAnalyticsIntent | null {
  if (hasFilters) return null;
  if (/\b(?:three|3)\b/.test(question.toLowerCase()) && /\bactions?\b/i.test(question) && /\b(?:based on|that diagnosis|this diagnosis)\b/i.test(question) && /\bchannel\b/i.test(previousQuestion) && /\bwhy\b/i.test(previousQuestion)) return 'channel_actions';
  if (/\bwhy\b/i.test(question) && /\bchannel\b/i.test(question) && /\b(?:strongest|better|performing)\b/i.test(question) && /\bchannel\b/i.test(previousQuestion)) return 'channel_why';
  if (/\bchannel\b/i.test(question) && /\b(?:strongest|best|leading|top)\b/i.test(question) && /\b(?:acquisition|results|performance|performing)\b/i.test(question)) return 'channel_performance';
  if (/\b2025\b/i.test(question) && /\b2026\b/i.test(question) && /\b(funnel|conversion|channel|acquisition)\b/i.test(question)) return 'historical_funnel_compare';
  if (/\b(?:19\d{2}|20(?:0\d|1\d|2[0-4]|[3-9]\d))\b/.test(question)) return null;
  const q = question.trim().replace(/[?!.]+$/, '').toLowerCase();
  if (/^(?:what(?:'s| is) (?:the |our )?(?:total )?signed sponsorship value|show (?:me )?(?:the |our )?signed total|how much have we signed)(?: (?:in|for) 202[56])?$/.test(q)) return 'signed';
  if (/^(?:compare|show|give me) (?:the )?proposal[- ]to[- ]win conversion (?:across|by|for each) campaigns?$/.test(q)) return 'campaign_conversion';
  if (/^(?:how much sponsorship value did we sign(?: in \d{4})?|(?:what is (?:the |our )?)?(?:signed sponsorship value|signed total|total signed)(?: in \d{4})?)$/.test(q)) return 'signed';
  if (/^(?:what is |show (?:me )?)?(?:the )?proposal[- ]to[- ]win conversion (?:for each|by) campaign$/.test(q)) return 'campaign_conversion';
  if (/\b(?:weakest|lowest|worst|best|highest)\b.*\bproposal[- ]to[- ]win conversion\b.*\bcampaign\b|\bcampaign\b.*\bproposal[- ]to[- ]win conversion\b/i.test(q)) return 'campaign_conversion';
  return null;
}
const cell = (v: unknown) => String(v ?? '—').split('|').join(String.fromCharCode(92) + '|').replace(/[\r\n]/g, ' ');
const money = (v: unknown) => v === null || v === undefined ? 'Not computable' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
type Read = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Fixed read plans, using the same permission-checked tools as model turns. No model requests. */
export async function answerBasicAnalytics(intent: BasicAnalyticsIntent, read: Read, acc: ToolRunAccumulator): Promise<string> {
  const lines: string[] = [];
  if (intent === 'channel_performance' || intent === 'channel_why' || intent === 'channel_actions') {
    const channels=['warm','inbound','cold'];
    const evidence=new Map<string,Record<string,unknown>>();
    for(const channel of channels){
      const result=await read('get_metric',{metric_id:'M-13',filters:{channel_group:channel}});
      const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
      if(!row)throw new Error('Channel win-rate source returned no row: '+channel);
      evidence.set(channel,row);
    }
    const ranked=channels.map(channel=>({channel,row:evidence.get(channel)!})).filter(x=>x.row.computable&&x.row.value!=null).sort((a,b)=>Number(b.row.value)-Number(a.row.value));
    if(intent==='channel_performance'){
      lines.push('Proposal-to-win comparison by acquisition channel (M-13; opportunity grain):','', '| Channel | Confirmed wins | Proposals | Proposal-to-win rate |','|---|---:|---:|---:|');
      for(const channel of channels){const r=evidence.get(channel)!;lines.push(`| ${channel} | ${cell(r.numerator)} | ${cell(r.denominator)} | ${r.computable&&r.value!=null?(Number(r.value)*100).toFixed(1)+'%':'Unavailable: '+cell(r.reason)} |`);}
      const leader=ranked[0];
      if(leader){const tied=ranked.filter(x=>Number(x.row.value)===Number(leader.row.value)).map(x=>x.channel);const volumeLeader=[...ranked].sort((a,b)=>Number(b.row.numerator)-Number(a.row.numerator))[0];lines.push('',`Highest observed proposal-to-win rate: **${tied.join(' and ')}** (${cell(leader.row.numerator)} wins from ${cell(leader.row.denominator)} proposals).`);if(volumeLeader&&volumeLeader.channel!==leader.channel)lines.push(`By total confirmed wins, **${volumeLeader.channel}** leads with ${cell(volumeLeader.row.numerator)} vs ${cell(leader.row.numerator)}; the rate leader has a smaller sample. Compare sample sizes before treating the rate difference as durable.`);else lines.push('Compare sample sizes before treating this as a durable advantage.');}
      lines.push('','This ranks proposal conversion, not total acquisition quality or causal channel effect. A higher rate on a smaller cohort can coexist with fewer total wins.');
    }else if(intent==='channel_why'){
      const leader=ranked[0];
      lines.push('**What the data proves:** the current M-13 numerator, denominator and rate for each channel are listed here.');
      for(const channel of channels){const r=evidence.get(channel)!;lines.push(`- ${channel}: ${cell(r.numerator)} wins / ${cell(r.denominator)} proposals; ${r.computable&&r.value!=null?(Number(r.value)*100).toFixed(1)+'%':'not computable ('+cell(r.reason)+')'}. [M-13]`);}
      if(leader)lines.push('',`The highest observed rate is ${leader.channel}; this is an association in the current data, not proof that the channel caused the difference.`);
      lines.push('', '**What is inference:** differences could reflect lead mix, qualification, follow-up execution, or sample size. The records do not establish which mechanism caused the result. Check comparable lead quality and stage timing before changing channel investment.');
    }else{
      const leader=ranked[0]?.channel;
      lines.push('Recommended actions for this week — proposals only; nothing has been created or changed.');
      lines.push(`1. Review every open ${leader??'warm/inbound'} opportunity with its owner and agree a dated next step. Reason: this uses the strongest observed proposal-conversion channel in the current cohort. Move M-21 open pipeline toward a later stage; measure by comparing the same channel’s open value and stage counts at week end.`);
      lines.push('2. Run a small, controlled follow-up test in the strongest channel before increasing volume. Reason: observed conversion is not causal and may be a small sample. Measure M-12 proposals ÷ met brands and M-13 wins ÷ proposals for the test cohort against its starting denominators.');
      const cold=evidence.get('cold')!;
      const coldText=cold.computable?`${cell(cold.numerator)} wins from ${cell(cold.denominator)} proposals`:cell(cold.reason);
      lines.push(`3. Audit cold-channel qualification and follow-up records before assigning more capacity there. Current evidence: ${coldText} [M-13]. Measure M-11 meeting rate and M-13 proposal-to-win on the next comparable cohort; keep or stop based on those observations, not a presumed cause.`);
      lines.push('', 'These are recommendations only; no tasks or campaigns were executed.');
    }
    lines.push('', 'Source: current selected edition and as-of date; all channel rates use M-13’s opportunity-level denominator.');
  } else if (intent === 'historical_funnel_compare') {
    const editionIds=['ED-2025','ED-2026-DEMO'];
    const stageDefs=[['M-11','Meeting rate by channel'],['M-12','Proposal rate by channel (brand-level)'],['M-13','Proposal-to-win rate (opportunity-level)']];
    const channels=['warm','inbound','cold'];
    const paired=new Map<string,Record<string,unknown>>();
    lines.push('Historical 2025 and simulated 2026 are evaluated as separate editions; no rows are pooled. Stage definitions and grains differ, so compare like-for-like only.');
    for(const edition_id of editionIds){
      lines.push('',`### ${edition_id==='ED-2025'?'2025 historical':'2026 simulated'} (${edition_id})`,'| Channel | Stage | Numerator | Denominator | Rate |','|---|---|---:|---:|---:|');
      for(const channel of channels) for(const [id,label] of stageDefs){
        const result=await read('get_metric',{metric_id:id,edition_id,filters:{channel_group:channel}});
        const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
        if(!row)throw new Error(`Missing ${id} result for ${edition_id}/${channel}`);
        paired.set(`${edition_id}:${channel}:${id}`,row);
        const rate=row.computable&&row.value!=null?(Number(row.value)*100).toFixed(1)+'%':'Unavailable: '+cell(row.reason);
        lines.push(`| ${channel} | ${label} [${id}] | ${cell(row.numerator)} | ${cell(row.denominator)} | ${rate} |`);
      }
    }
    lines.push('', '### Directional comparison');
    for(const channel of channels)for(const [id,label] of stageDefs){
      const old=paired.get(`ED-2025:${channel}:${id}`),current=paired.get(`ED-2026-DEMO:${channel}:${id}`);
      if(!old?.computable||!current?.computable||old.value==null||current.value==null){lines.push(`- ${channel}, ${label}: no like-for-like rate comparison because at least one edition lacks a computable observation.`);continue;}
      const delta=(Number(current.value)-Number(old.value))*100;
      const movement=Math.abs(delta)<0.05?'is unchanged':delta>0?`improved ${delta.toFixed(1)} percentage points`:`declined ${Math.abs(delta).toFixed(1)} percentage points`;
      const n25=Number(old.denominator),n26=Number(current.denominator);
      const caution=Math.min(n25,n26)<10?'At least one denominator is under 10, so treat this as a small-sample directional signal.':'Both denominators are at least 10, but this is still descriptive, not a significance or causal test.';
      lines.push(`- ${channel}, ${label}: ${movement} (${(Number(old.value)*100).toFixed(1)}% → ${(Number(current.value)*100).toFixed(1)}%; denominators ${cell(old.numerator)}/${cell(old.denominator)} → ${cell(current.numerator)}/${cell(current.denominator)}). ${caution}`);
    }
    lines.push('', 'Interpretation limits: meeting rate is met brands ÷ touched brands; proposal rate is proposed brands ÷ met brands; proposal-to-win is won opportunities ÷ proposal-stage opportunities. These rates have different denominators and must not be combined into one funnel count. Different data availability, cohort sizes and attribution can explain apparent movement; this comparison shows association, not causation.');
    await read('search_knowledge',{query:'2025 historical channel funnel calibration data availability sample size stage denominators'});
  } else if (intent === 'signed') {
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
    const conversions:Array<{name:string;wins:unknown;proposals:unknown;value:number}>=[];
    lines.push('| Campaign | Wins (numerator) | Proposals (denominator) | Conversion (source value) | Source |', '|---|---:|---:|---:|---|');
    for (const campaign of rows) {
      if (!campaign.campaign_id) throw new Error('Campaign source omitted its identifier');
      const result = await read('get_metric', { metric_id: 'M-13', filters: { campaign_id: String(campaign.campaign_id) } });
      const row = (result.rows as Record<string, unknown>[] | undefined)?.[0];
      if (!row) throw new Error('Campaign metric source returned no row');
      if (row.computable && Number.isFinite(Number(row.value))) conversions.push({name:cell(campaign.name ?? campaign.campaign_id),wins:row.numerator,proposals:row.denominator,value:Number(row.value)});
      lines.push('| ' + cell(campaign.name ?? campaign.campaign_id) + ' | ' + cell(row.numerator) + ' | ' + cell(row.denominator) + ' | ' + (row.computable ? cell(row.value) + ' ' + cell(row.unit) : 'Not computable: ' + cell(row.reason)) + ' | [M-13] |');
    }
    if (conversions.length) {
      const weakest=[...conversions].sort((a,b)=>a.value-b.value)[0];
      lines.unshift(`**Weakest proposal-to-win conversion:** ${weakest.name} — ${cell(weakest.wins)} wins from ${cell(weakest.proposals)} proposals (${weakest.value}${weakest.value<=1?' ratio':''}). Review the owner’s next follow-up and proposal quality before changing the campaign. [M-13]`, '');
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

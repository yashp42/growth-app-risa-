import { isValidIsoDate } from '../gates.ts';
import type { ToolRunAccumulator } from './tools.ts';

export type BasicAnalyticsIntent = 'signed' | 'signed_cash_followup' | 'partnership_counts' | 'deal_size' | 'target_pacing' | 'campaign_conversion' | 'campaign_leakage' | 'funnel_bottleneck' | 'handoff_explanation' | 'named_campaign_funnel' | 'campaign_pair' | 'historical_funnel_compare' | 'channel_performance' | 'channel_why' | 'channel_actions' | 'channel_full_diagnosis';
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
export function historicalPacingDate(question: string): string | undefined {
  if (!/\b(?:against|versus|vs|progress|pacing|on track)\b/i.test(question) ||
      !/\b(?:target|goal|plan)s?\b/i.test(question) ||
      /\b(?:change|update|create|delete|move|set|approve|compare)\b/i.test(question)) return;
  return explicitHistoricalDate(question);
}
export function historicalSignedDate(question:string):string|undefined{
  if(!/\b(?:as of|by|on|through)\b/i.test(question)||
     !/\b(?:partnerships?|sponsorships?|deals?|signed value)\b/i.test(question)||
     !/\b(?:confirmed|sign(?:ed)?|how much|for how much)\b/i.test(question)||
     /\b(?:change|compare|create|update|delete|move|mark|approve)\b/i.test(question))return;
  return explicitHistoricalDate(question);
}
function explicitHistoricalDate(question:string):string|undefined{
  const iso = question.match(/\b2025-\d{2}-\d{2}\b/)?.[0];
  const named = question.match(/\b(\d{1,2})(?:st|nd|rd|th)?[ -]([a-z]{3,9})[, ]+2025\b/i);
  const month = named ? months.findIndex(m => m === named[2].toLowerCase() || m.slice(0,3) === named[2].toLowerCase()) + 1 : 0;
  const date = iso ?? (named && month ? `2025-${String(month).padStart(2,'0')}-${named[1].padStart(2,'0')}` : '');
  if (isValidIsoDate(date)) return date;
}
function namedCampaignFunnelSubject(question: string): string | undefined {
  return question.match(/^\s*(?:is|was)\s+(.{2,100}?)\s+(?:failing|struggling|weaker)\s+(?:at|on|with)\s+(?:reach|outreach|responses?)\s+or\s+(?:at\s+)?(?:closing|wins?|conversion)[?!.]*\s*$/i)?.[1];
}
function campaignPair(question: string): string[] | undefined {
  const pair=question.match(/^\s*compare\s+(.{2,80}?)\s+(?:with|to|versus|vs)\s+(.{2,80}?)[?!.]*\s*$/i);
  if(!pair||!pair.slice(1).every(name=>/\b(?:campaign|referrals?|introductions?|linkedin|form|email|revival)\b/i.test(name)))return;
  return pair.slice(1);
}
export function basicAnalyticsIntent(question: string, hasFilters = false, previousQuestion = ''): BasicAnalyticsIntent | null {
  if (hasFilters) return null;
  if (historicalPacingDate(question)) return 'target_pacing';
  if (historicalSignedDate(question)) return 'signed';
  const fullContext = `${question}\n${previousQuestion}`;
  if (/\b(?:three|3)\b/.test(question.toLowerCase()) && /\bactions?\b/i.test(question) && /\b(?:based on|that diagnosis|this diagnosis)\b/i.test(question) && /\bchannel\b/i.test(previousQuestion) && /\bwhy\b/i.test(previousQuestion)) return 'channel_actions';
  if (/\bwhy\b/i.test(question) && /\bchannel\b/i.test(question) && /\b(?:strongest|better|performing)\b/i.test(question) && /\bchannel\b/i.test(previousQuestion)) return 'channel_why';
  if (/\bchannel\b/i.test(fullContext) && /\bwhy\b/i.test(fullContext) && /\b(?:three|3)\b/i.test(fullContext) && /\bactions?\b/i.test(fullContext) && /\b(?:based on|that diagnosis|this diagnosis)\b/i.test(fullContext) && /\bwhy\b/i.test(question) && /\bactions?\b/i.test(question)) return 'channel_full_diagnosis';
  if (/\bchannel\b/i.test(question) && /\b(?:strongest|best|leading|top)\b/i.test(question) && /\b(?:acquisition|results|performance|performing)\b/i.test(question)) return 'channel_performance';
  if (/\b2025\b/i.test(question) && /\b2026\b/i.test(question) && /\b(funnel|conversion|channel|acquisition)\b/i.test(question)) return 'historical_funnel_compare';
  if (/^why\b/i.test(question) && /\b(?:handoff|qualified leads?|qualified brands?)\b/i.test(fullContext) &&
      /\b(?:leak\w*|drop\w*|lost|stalled)\b/i.test(question)) return 'handoff_explanation';
  if (namedCampaignFunnelSubject(question)) return 'named_campaign_funnel';
  if (campaignPair(question)) return 'campaign_pair';
  const leakage = /\b(?:leak(?:ing|s|age)?|los(?:e|ing|t)|drop[- ]?off|bottlenecks?)\b/i.test(question);
  if (leakage && /\b(?:funnel|handoff)\b/i.test(question) && !/\b(?:why|compare|update|change|create)\b/i.test(question)) {
    return /\bcampaigns?\b/i.test(question) ? 'campaign_leakage' : 'funnel_bottleneck';
  }
  if (/\b(?:campaigns?|channels?)\b/i.test(question) && /\bqualified\s+(?:(?:sponsorship\s+)?(?:leads?|opportunities|prospects?)|brands?)\b/i.test(question) && /\b(?:leak(?:ing|age)?|los(?:e|ing|t)|drop[- ]?off|before\s+(?:they\s+)?(?:become|turn\s+into))\b/i.test(question)) return 'campaign_leakage';
  if (/\b(?:19\d{2}|20(?:0\d|1\d|2[0-4]|[3-9]\d))\b/.test(question)) return null;
  const q = question.trim().replace(/[?!.]+$/, '').toLowerCase();
  if (/^(?:how many|count|number of|show (?:me )?(?:the )?(?:number of)?)\b/.test(q) &&
      /\bconfirmed\b/.test(q) && /\b(?:deals|partnerships|opportunities|sponsors|brands)\b/.test(q) &&
      !/\b(?:by|per|campaign|channel|owner|compare|target)\b/.test(q)) return 'partnership_counts';
  if (/^(?:what (?:is|was) (?:our |the )?|show (?:me )?(?:our |the )?)?(?:typical|average|mean|median) (?:won |signed )?deal size(?: in 202[56])?$/.test(q)) return 'deal_size';
  if (/^(?:and )?how much of (?:that|it) was cash(?:[- ]type)?$/.test(q) &&
      basicAnalyticsIntent(previousQuestion) === 'signed') return 'signed_cash_followup';
  if (/^(?:what(?:'s| is) (?:the |our )?(?:total )?signed sponsorship value|show (?:me )?(?:the |our )?signed total|how much have we signed)(?: (?:in|for) 202[56])?$/.test(q)) return 'signed';
  if (/^(?:compare|show|give me) (?:the )?proposal[- ]to[- ]win conversion (?:across|by|for each) campaigns?$/.test(q)) return 'campaign_conversion';
  if (/^(?:how much sponsorship value did we sign(?: in \d{4})?|(?:what is (?:the |our )?)?(?:signed sponsorship value|signed total|total signed)(?: in \d{4})?)$/.test(q)) return 'signed';
  if (/^(?:what is |show (?:me )?)?(?:the )?proposal[- ]to[- ]win conversion (?:for each|by) campaign$/.test(q)) return 'campaign_conversion';
  if (/\b(?:weakest|lowest|worst|best|highest)\b.*\bproposal[- ]to[- ]win conversion\b.*\bcampaign\b|\bcampaign\b.*\bproposal[- ]to[- ]win conversion\b/i.test(q)) return 'campaign_conversion';
  return null;
}
const cell = (v: unknown) => String(v ?? '—').split('|').join(String.fromCharCode(92) + '|').replace(/[\r\n]/g, ' ');
const firstRow = (result: Record<string, unknown>) => (result.rows as Record<string, unknown>[] | undefined)?.[0];
const money = (v: unknown) => v === null || v === undefined ? 'Not computable' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
type Read = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Fixed read plans, using the same permission-checked tools as model turns. No model requests. */
export async function answerBasicAnalytics(intent: BasicAnalyticsIntent, read: Read, acc: ToolRunAccumulator, options: {question?: string; historical?: boolean} = {}): Promise<string> {
  const lines: string[] = [];
  if (intent === 'channel_performance' || intent === 'channel_why' || intent === 'channel_actions' || intent === 'channel_full_diagnosis') {
    const channels=['warm','inbound','cold'];
    const evidence=new Map<string,Record<string,unknown>>();
    for(const channel of channels){
      const result=await read('get_metric',{metric_id:'M-13',filters:{channel_group:channel}});
      const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
      if(!row)throw new Error('Channel win-rate source returned no row: '+channel);
      evidence.set(channel,row);
    }
    const ranked=channels.map(channel=>({channel,row:evidence.get(channel)!})).filter(x=>x.row.computable&&x.row.value!=null).sort((a,b)=>Number(b.row.value)-Number(a.row.value));
    if(intent==='channel_performance' || intent==='channel_full_diagnosis'){
      lines.push('Proposal-to-win comparison by acquisition channel (M-13; opportunity grain):','', '| Channel | Confirmed wins | Proposals | Proposal-to-win rate |','|---|---:|---:|---:|');
      for(const channel of channels){const r=evidence.get(channel)!;lines.push(`| ${channel} | ${cell(r.numerator)} | ${cell(r.denominator)} | ${r.computable&&r.value!=null?(Number(r.value)*100).toFixed(1)+'%':'Unavailable: '+cell(r.reason)} |`);}
      const leader=ranked[0];
      if(leader){const tied=ranked.filter(x=>Number(x.row.value)===Number(leader.row.value)).map(x=>x.channel);const volumeLeader=[...ranked].sort((a,b)=>Number(b.row.numerator)-Number(a.row.numerator))[0];lines.push('',`Highest observed proposal-to-win rate: **${tied.join(' and ')}** (${cell(leader.row.numerator)} wins from ${cell(leader.row.denominator)} proposals).`);if(volumeLeader&&volumeLeader.channel!==leader.channel)lines.push(`By total confirmed wins, **${volumeLeader.channel}** leads with ${cell(volumeLeader.row.numerator)} vs ${cell(leader.row.numerator)}; the rate leader has a smaller sample. Compare sample sizes before treating the rate difference as durable.`);else lines.push('Compare sample sizes before treating this as a durable advantage.');}
      lines.push('','This ranks proposal conversion, not total acquisition quality or causal channel effect. A higher rate on a smaller cohort can coexist with fewer total wins.');
      if(options.historical){
        lines.push('', 'Synthetic historical edition. The attribution rule for the preceding rates uses the opportunity’s originating campaign. First-touch rates below attribute each brand to its first recorded campaign [M-14].',
         '| Channel | Won brands | First-touched brands | First-touch win rate |','|---|---:|---:|---:|');
        for(const channel of channels){
          const r=firstRow(await read('get_metric',{metric_id:'M-14',filters:{channel_group:channel}}));
          lines.push(`| ${channel} | ${cell(r?.numerator)} | ${cell(r?.denominator)} | ${r?.computable&&r.value!=null?(Number(r.value)*100).toFixed(1)+'%':'Unavailable'} |`);
        }
        const list=await read('list_records',{kind:'campaigns',limit:25});
        const warm=((list.rows??[]) as Record<string,unknown>[]).filter(r=>r.channel_group==='warm');
        if(Number(list.count??0)<25&&warm.length){
          lines.push('', '**Warm campaigns**','| Campaign | Brands won / touched (first touch) [M-14] | Won opportunities [M-13] |','|---|---:|---:|');
          for(const c of warm){
            const filters={campaign_id:String(c.campaign_id)};
            const [brand,opp]=await Promise.all(['M-14','M-13'].map(async metric_id=>firstRow(await read('get_metric',{metric_id,filters}))));
            lines.push(`| ${cell(c.name)} | ${cell(brand?.numerator)} / ${cell(brand?.denominator)} | ${cell(opp?.numerator)} |`);
          }
        }
        await read('search_knowledge',{query:'conversion bimodal warm inbound every brand proposal won cold won none deal origin first touch',related_kpi:'K-F-03'});
      }
      if(intent==='channel_full_diagnosis'){
        const leader=ranked[0]?.channel;
        lines.push('', '**What the data proves:**');
        for(const channel of channels){const r=evidence.get(channel)!;lines.push(`- ${channel}: ${cell(r.numerator)} wins / ${cell(r.denominator)} proposals; ${r.computable&&r.value!=null?(Number(r.value)*100).toFixed(1)+'%':'not computable ('+cell(r.reason)+')'}. [M-13]`);}
        lines.push('',`**What is inference:** ${leader??'No channel'} has the highest computable rate in this snapshot. The records do not prove why; lead mix, qualification and follow-up execution are hypotheses to test.`);
        lines.push('', '**Three actions for this week — recommendations only:**',
          `- Review every open ${leader??'warm or inbound'} opportunity with its owner and set a dated next step. Measure movement in M-21 open pipeline and stage counts at week end.`,
          '- Run a small, controlled follow-up test before increasing channel volume. Compare M-12 meeting-to-proposal and M-13 proposal-to-win using the same cohort definitions.',
          '- Audit cold-channel qualification and follow-up before assigning it more effort. Compare M-11 meeting rate and M-13 proposal-to-win on the next comparable cohort.',
          'No tasks or campaigns were created or changed.');
      }
    }else if(intent==='channel_why'){
      const leader=ranked[0];
      lines.push('**What the data proves:** the current M-13 numerator, denominator and rate for each channel are listed here.');
      for(const channel of channels){const r=evidence.get(channel)!;lines.push(`- ${channel}: ${cell(r.numerator)} wins / ${cell(r.denominator)} proposals; ${r.computable&&r.value!=null?(Number(r.value)*100).toFixed(1)+'%':'not computable ('+cell(r.reason)+')'}. [M-13]`);}
      if(leader)lines.push('',`The highest observed rate is ${leader.channel}; this is an association in the current data, not proof that the channel caused the difference.`);
      lines.push('', '**What is inference:** differences could reflect lead mix, qualification, follow-up execution, or sample size. The records do not establish which mechanism caused the result. Check comparable lead quality and stage timing before changing channel investment.');
    }else{
      const leader=ranked[0]?.channel;
      lines.push('Recommended actions for this week — proposals only; nothing has been created or changed.');
      lines.push(`- Review every open ${leader??'warm/inbound'} opportunity with its owner and agree a dated next step. Reason: this uses the strongest observed proposal-conversion channel in the current cohort. Move M-21 open pipeline toward a later stage; measure by comparing the same channel’s open value and stage counts at week end.`);
      lines.push('- Run a small, controlled follow-up test in the strongest channel before increasing volume. Reason: observed conversion is not causal and may be a small sample. Measure M-12 proposals ÷ met brands and M-13 wins ÷ proposals for the test cohort against its starting denominators.');
      const cold=evidence.get('cold')!;
      const coldText=cold.computable?`${cell(cold.numerator)} wins from ${cell(cold.denominator)} proposals`:cell(cold.reason);
      lines.push(`- Audit cold-channel qualification and follow-up records before assigning more capacity there. Current evidence: ${coldText} [M-13]. Measure M-11 meeting rate and M-13 proposal-to-win on the next comparable cohort; keep or stop based on those observations, not a presumed cause.`);
      lines.push('', 'These are recommendations only; no tasks or campaigns were executed.');
    }
    lines.push('', 'Source: selected edition and as-of date. M-13 uses an opportunity-level denominator.'+(options.historical?' M-14 uses a brand-level first-touch denominator.':''));
  } else if (intent === 'historical_funnel_compare') {
    const editionIds=['ED-2025','ED-2026-DEMO'];
    const stageDefs=[['M-11','Meeting rate by channel'],['M-12','Proposal rate by channel (brand-level)'],['M-13','Proposal-to-win rate (opportunity-level)']];
    const channels=['warm','inbound','cold'];
    const paired=new Map<string,Record<string,unknown>>();
    lines.push('Historical 2025 and simulated 2026 are evaluated as separate editions; no rows are pooled. Stage definitions and grains differ, so compare like-for-like only.');
    let comparisonAsOf='';
    for(const edition_id of editionIds){
      lines.push('',`### ${edition_id==='ED-2025'?'2025 historical':'2026 simulated'} (${edition_id})`,'| Channel | Stage | Numerator | Denominator | Rate |','|---|---|---:|---:|---:|');
      for(const channel of channels) for(const [id,label] of stageDefs){
        const result=await read('get_metric',{metric_id:id,edition_id,filters:{channel_group:channel}});
        if(edition_id==='ED-2026-DEMO'&&typeof result.as_of==='string')comparisonAsOf=result.as_of;
        const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
        if(!row)throw new Error(`Missing ${id} result for ${edition_id}/${channel}`);
        paired.set(`${edition_id}:${channel}:${id}`,row);
        const rate=row.computable&&row.value!=null?(Number(row.value)*100).toFixed(1)+'%':'Unavailable: '+cell(row.reason);
        lines.push(`| ${channel} | ${label} [${id}] | ${cell(row.numerator)} | ${cell(row.denominator)} | ${rate} |`);
      }
    }
    lines.push('', '### Directional comparison');
    const derivedEvidence:Record<string,unknown>[]=[];
    for(const channel of channels)for(const [id,label] of stageDefs){
      const old=paired.get(`ED-2025:${channel}:${id}`),current=paired.get(`ED-2026-DEMO:${channel}:${id}`);
      if(!old?.computable||!current?.computable||old.value==null||current.value==null){lines.push(`- ${channel}, ${label}: no like-for-like rate comparison because at least one edition lacks a computable observation.`);continue;}
      const delta=(Number(current.value)-Number(old.value))*100;
      const movement=Math.abs(delta)<0.05?'is unchanged':delta>0?`improved ${delta.toFixed(1)} percentage points`:`declined ${Math.abs(delta).toFixed(1)} percentage points`;
      const n25=Number(old.denominator),n26=Number(current.denominator);
      const caution=Math.min(n25,n26)<10?'At least one denominator is under 10, so treat this as a small-sample directional signal.':'Both denominators are at least 10, but this is still descriptive, not a significance or causal test.';
      derivedEvidence.push({channel,metric_id:id,delta_percentage_points:Number(delta.toFixed(1)),sample_caution_floor:10,rate_2025:Number(old.value),rate_2026:Number(current.value)});
      lines.push(`- ${channel}, ${label}: ${movement} (${(Number(old.value)*100).toFixed(1)}% → ${(Number(current.value)*100).toFixed(1)}%; denominators ${cell(old.numerator)}/${cell(old.denominator)} → ${cell(current.numerator)}/${cell(current.denominator)}). ${caution}`);
    }
    if(derivedEvidence.length)acc.toolResults.push({source:'server_derived_funnel_comparison',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:comparisonAsOf,rows:derivedEvidence});
    lines.push('', 'Interpretation limits: meeting rate is met brands ÷ touched brands; proposal rate is proposed brands ÷ met brands; proposal-to-win is won opportunities ÷ proposal-stage opportunities. These rates have different denominators and must not be combined into one funnel count. Different data availability, cohort sizes and attribution can explain apparent movement; this comparison shows association, not causation.');
    await read('search_knowledge',{query:'2025 historical channel funnel calibration data availability sample size stage denominators'});
  } else if (intent === 'named_campaign_funnel') {
    const subject=namedCampaignFunnelSubject(options.question ?? '');
    if (!subject) return 'Which campaign would you like to diagnose?';
    const result=await read('list_records',{kind:'campaigns',limit:25,filters:{search:subject}});
    const candidates=(result.rows as Record<string,unknown>[]|undefined) ?? [];
    const exact=candidates.filter(c=>String(c.name).toLowerCase()===subject.toLowerCase());
    const campaign=exact.length===1 && candidates.length<25 ? exact[0] : candidates.length===1 ? candidates[0] : undefined;
    if (!campaign) {
      return candidates.length ? 'Several campaigns match. Which campaign do you mean?' : 'No matching campaign was found in the selected edition.';
    }
    const filters={campaign_id:String(campaign.campaign_id)};
    const [reach,meet,close]=await Promise.all(['M-23','M-11','M-13'].map(async metric_id=>firstRow(await read('get_metric',{metric_id,filters}))));
    lines.push('**'+cell(campaign.name)+'**', '');
    if (reach?.computable) lines.push(`- Reach: ${cell(reach.denominator)} brands touched, ${cell(reach.numerator)} responded (${Math.round(Number(reach.value)*100)}%). [M-23]`);
    else lines.push('- Reach and response: unavailable. [M-23]');
    if (meet?.computable) lines.push(`- Meetings: ${cell(meet.numerator)} brands met. [M-11]`);
    if (close?.computable) lines.push(`- Closing: ${cell(close.numerator)} wins from ${cell(close.denominator)} proposals. [M-13]`);
    else lines.push('- Closing: no comparable proposal-to-win result. [M-13]');
    if (Number(reach?.numerator)>0 && Number(close?.denominator)>0 && close?.computable && Number(close.numerator)===0) {
      lines.push('', 'Closing is the clearest observed bottleneck. The campaign reached and engaged brands and sent proposals, but recorded zero wins. The cause of the failure is unknown from these counts.');
    } else lines.push('', 'These stages have different denominators. A stronger conclusion needs comparable campaigns and evidence about why individual deals stalled.');
    await read('search_knowledge',{query:'historical campaign results brands touched responded met proposals wins '+String(campaign.name).slice(0,100)});
  } else if (intent === 'campaign_pair') {
    const pair=campaignPair(options.question??'');
    if(!pair)return 'Which two campaigns would you like to compare?';
    const list=await read('list_records',{kind:'campaigns',limit:25});
    const candidates=(list.rows??[]) as Record<string,unknown>[];
    if(candidates.length>=25)return 'The campaign list is too broad for a unique comparison. Please use specific campaign filters.';
    const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const selected=pair.map(input=>{
      const words=normalize(input).split(' ').filter(t=>!['the','campaign'].includes(t));
      const matches=candidates.filter(c=>{
        const name=normalize(String(c.name)+' '+String(c.channel_group??'')).split(' ');
        return words.length>0&&words.every(t=>name.includes(t));
      });
      return matches.length===1?matches[0]:undefined;
    });
    if(selected.some(x=>!x)||selected[0]?.campaign_id===selected[1]?.campaign_id)return 'I could not uniquely match two different campaigns. Please use their full names.';
    const ids=['M-11','M-12','M-13','M-17','M-02','M-15'];
    const rows=await Promise.all(selected.map(async c=>{
      const filter={campaign_id:String(c!.campaign_id)};
      const metrics=await Promise.all(ids.map(async metric_id=>firstRow(await read('get_metric',{metric_id,filters:filter}))));
      return {name:cell(c!.name),metrics};
    }));
    const ratio=(r:Record<string,unknown>|undefined)=>r?.computable?`${cell(r.numerator)} / ${cell(r.denominator)}`:'Unavailable';
    const value=(r:Record<string,unknown>|undefined)=>r?.computable&&r.value!=null?money(r.value):'Unavailable';
    lines.push('| Campaign | Met / touched brands [M-11] | Proposed / met brands [M-12] | Wins / proposals [M-13] | Qualified without opportunity [M-17] | Total signed [M-02] | Mean signed deal [M-15] |',
      '|---|---:|---:|---:|---:|---:|---:|');
    for(const {name,metrics:[meet,proposal,win,handoff,signed,average]} of rows){
      lines.push(`| ${name} | ${ratio(meet)} | ${ratio(proposal)} | ${ratio(win)} | ${ratio(handoff)} | ${value(signed)} | ${value(average)} |`);
    }
    const stages=rows.map(({metrics:m})=>({allClose:m[2]?.computable&&Number(m[2].value)===1, leaks:m[3]?.computable&&Number(m[3].numerator)>0}));
    if(stages.every(x=>x.allClose&&x.leaks))lines.push('', 'Both campaigns won every recorded proposal and had qualified leads without an opportunity. Review handoff before changing the proposal process.');
    lines.push('Reach and handoff are counted by brand; wins are counted by opportunity. Small samples can make these rates unstable. Signed value measures commitments.');
    if(options.historical)await read('search_knowledge',{query:'historical campaign results creator network referrals partner interest form brands touched met proposals won'});
  } else if (intent === 'handoff_explanation') {
    await read('search_knowledge',{query:'handoff leak late qualification season clustering owner workload recorded fit drop reason unknown',related_kpi:'K-F-05'});
    const note=acc.citations.find(c=>c.id==='KB-06.7' && !c.history);
    lines.push('The records do not establish why qualified leads dropped out. Check owner notes and missing drop reasons before attributing the leak to a person or channel.');
    if(options.historical && typeof note?.text==='string') {
      const finding=note.text.match(/The records rule out [\s\S]+$/)?.[0];
      if(finding) lines.push('', 'The synthetic 2025 analysis reports: “'+cell(finding)+'” [KB-06.7]');
    } else if(note) lines.push('', 'The historical study can suggest checks, but it does not establish a cause for the selected edition. [KB-06.7]');
    lines.push('Track each qualified lead through the approved handoff deadline and require a reason when a lead is dropped.');
  } else if (intent === 'funnel_bottleneck') {
    const [handoff, cold] = await Promise.all([
      read('get_metric',{metric_id:'M-17'}),
      read('get_metric',{metric_id:'M-13',filters:{channel_group:'cold'}}),
    ]);
    const leak=firstRow(handoff), win=firstRow(cold);
    if (leak?.computable && leak.value != null) {
      lines.push(`Warm and inbound handoff: **${cell(leak.numerator)} of ${cell(leak.denominator)} qualified brands** had no opportunity (${Math.round(Number(leak.value)*100)}%). [M-17]`);
    } else lines.push('The warm and inbound handoff rate is unavailable for this scope. [M-17]');
    if (win?.computable && win.value != null) {
      lines.push(`Cold proposal-to-win: **${cell(win.numerator)} wins from ${cell(win.denominator)} proposals** (${Math.round(Number(win.value)*100)}%). [M-13]`);
    } else lines.push('Cold proposal-to-win conversion is unavailable for this scope. [M-13]');
    lines.push('The handoff rate counts brands and the close rate counts opportunities. Review the work queue at each stage before comparing loss volumes. The cause of the leak is unknown from these counts.');
    await Promise.all([
      read('search_knowledge',{query:'qualified brands never had an opportunity handoff cause unknown',related_kpi:'K-F-05'}),
      read('search_knowledge',{query:'conversion bimodal warm inbound every brand proposal won cold won none deal origin first touch',related_kpi:'K-F-03'}),
    ]);
  } else if (intent === 'campaign_leakage') {
    const campaigns=await read('list_records',{kind:'campaigns',limit:25});
    const rows=campaigns.rows as Record<string,unknown>[]|undefined;
    if(!rows?.length){lines.push('No campaigns were returned for the selected edition; qualified-lead leakage cannot be compared.');}
    else {
      const evaluated:Array<{name:string;qualified:unknown;leaked:unknown;leakDenominator:unknown;leakRate:unknown;handoffNum:unknown;handoffDen:unknown;handoffRate:unknown;proposalNum:unknown;proposalDen:unknown;proposalRate:unknown;sort:number}> = [];
      for(const campaign of rows){
        const filter={campaign_id:String(campaign.campaign_id)};
        const [qualified,leak,handoff,proposal]=await Promise.all([
          read('get_metric',{metric_id:'M-10',filters:filter}),read('get_metric',{metric_id:'M-17',filters:filter}),
          read('get_metric',{metric_id:'M-18',filters:filter}),read('get_metric',{metric_id:'M-19',filters:filter}),
        ]);
        const q=(qualified.rows as Record<string,unknown>[]|undefined)?.[0],l=(leak.rows as Record<string,unknown>[]|undefined)?.[0],h=(handoff.rows as Record<string,unknown>[]|undefined)?.[0],p=(proposal.rows as Record<string,unknown>[]|undefined)?.[0];
        if(!q||!l||!h||!p)throw new Error('Campaign leakage metrics are incomplete.');
        evaluated.push({name:cell(campaign.name??campaign.campaign_id),qualified:q.value,leaked:l.numerator,leakDenominator:l.denominator,leakRate:l.value,handoffNum:h.numerator,handoffDen:h.denominator,handoffRate:h.value,proposalNum:p.numerator,proposalDen:p.denominator,proposalRate:p.value,sort:l.computable?Number(l.numerator??0):-1});
      }
      evaluated.sort((a,b)=>b.sort-a.sort);
      const leaders=evaluated.filter(r=>r.sort===evaluated[0]?.sort&&r.sort>0);
      lines.push('Qualified-lead leakage by campaign: M-17 counts qualified brands with no opportunity; M-18 counts opportunity handoff within five days; M-19 counts proposals within ten days. Rates and denominators are not interchangeable.','', '| Campaign | Qualified brands [M-10] | No opportunity n / d [M-17] | Leak rate | Opportunity within five days n / d [M-18] | Proposal within ten days n / d [M-19] |','|---|---:|---:|---:|---:|---:|');
      for(const r of evaluated){
        const pct=(v:unknown)=>v==null?'Unavailable':(Number(v)*100).toFixed(1)+'%';
        lines.push(`| ${r.name} | ${cell(r.qualified)} | ${cell(r.leaked)} / ${cell(r.leakDenominator)} | ${pct(r.leakRate)} | ${cell(r.handoffNum)} / ${cell(r.handoffDen)} (${pct(r.handoffRate)}) | ${cell(r.proposalNum)} / ${cell(r.proposalDen)} (${pct(r.proposalRate)}) |`);
      }
      if(leaders.length)lines.push('',`Largest observed absolute leakage: **${leaders.map(r=>r.name).join(', ')}** (${cell(leaders[0].leaked)} qualified brands without an opportunity). Compare its rate and base size before interpreting it as worse performance.`);
      else lines.push('', 'No positive M-17 leakage count was computable in the returned campaign cohort.');
      if(rows.length>=25)lines.push('This result is limited to the first 25 campaign records returned; a complete ranking needs a larger campaign query.');
      const channels=['warm','inbound','cold'];
      const channelEvidence=new Map<string,Record<string,Record<string,unknown>>>();
      for(const channel of channels){
        const metrics:Record<string,Record<string,unknown>>={};
        for(const id of ['M-17','M-18','M-19','M-13']){
          const result=await read('get_metric',{metric_id:id,filters:{channel_group:channel}});
          const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
          if(row)metrics[id]=row;
        }
        channelEvidence.set(channel,metrics);
      }
      lines.push('', '**Stage comparison by acquisition channel** (M-17 to M-19 use qualified-brand denominators; M-13 is the separate opportunity-level proposal-to-win rate.)', '', '| Channel | Qualified without opportunity [M-17] | Timely handoff [M-18] | Timely proposal [M-19] | Proposal-to-win [M-13] |','|---|---:|---:|---:|---:|');
      const fmt=(r:Record<string,unknown>|undefined)=>!r?'Unavailable':r.computable&&r.value!=null?`${cell(r.numerator)} / ${cell(r.denominator)} (${(Number(r.value)*100).toFixed(1)}%)`:`Unavailable (${cell(r.reason)})`;
      for(const channel of channels){const m=channelEvidence.get(channel)!;lines.push(`| ${channel} | ${fmt(m['M-17'])} | ${fmt(m['M-18'])} | ${fmt(m['M-19'])} | ${fmt(m['M-13'])} |`);}
      const channelLeaks=channels.map(channel=>({channel,row:channelEvidence.get(channel)?.['M-17']})).filter(x=>x.row?.computable).sort((a,b)=>Number(b.row?.numerator??0)-Number(a.row?.numerator??0));
      if(channelLeaks.length)lines.push('',`Largest channel loss by count is **${channelLeaks[0].channel}**: ${cell(channelLeaks[0].row?.numerator)} qualified brands did not reach an opportunity (M-17). Treat this as volume, not proof of worse rate; compare the denominators above.`);
      lines.push('', '**What the records prove:** M-17 identifies qualified brands that have no opportunity; M-18 and M-19 show the timely handoff and proposal rates defined by those metrics; M-13 describes proposal-to-win at opportunity grain. These measures have distinct denominators. The largest absolute M-17 loss is not automatically the worst rate or the cause of the loss.', '', '**Recommended actions for this week:**', '- Review the campaign with the highest M-17 loss count with its owner; inspect the affected qualified-brand records and set documented next steps. Measure M-17 numerator and rate at week end.', '- For the lowest comparable M-18 campaign/channel, audit qualification-to-opportunity handoff delays. Measure its numerator ÷ denominator on the next cohort.', '- Review proposals stalled before the M-19 window with owners; measure M-19 numerator ÷ denominator and keep M-13 proposal-to-win separate. These are recommendations only; nothing has been changed.');
    }
    if (options.historical) {
      await read('search_knowledge',{query:'qualified brands handoff creator referrals partner introductions no opportunity',related_kpi:'K-F-05'});
      lines.push('These are small samples. The cause of the observed handoff losses is unknown.');
    }
  } else if (intent === 'target_pacing') {
    const [qualifiedResult, confirmedResult, gate] = await Promise.all([
      read('get_metric',{metric_id:'M-10'}), read('get_metric',{metric_id:'M-24'}), read('get_register',{kind:'gate'}),
    ]);
    const qualified = firstRow(qualifiedResult);
    const confirmed = firstRow(confirmedResult);
    lines.push('Point-in-time results for the historical synthetic edition. The cutoff is the end of the selected date in IST. Targets use the version in force at that cutoff.');
    if (qualified?.computable) {
      const qualifierTarget = gate.historical_qualified_goal;
      lines.push(`Qualified brands: **${cell(qualified.value)}**${qualifierTarget == null ? '' : ` versus a goal of ${cell(qualifierTarget)}`}. [M-10]`);
    } else lines.push('Qualified brands: unavailable. [M-10]');
    if (confirmed?.computable && confirmed.value != null) {
      lines.push(`Confirmed partnerships: **${cell(confirmed.numerator)} of ${cell(confirmed.denominator)}** (${Math.round(Number(confirmed.value)*100)}% of goal). [M-24]`);
    } else lines.push('Confirmed-partnerships pacing is unavailable for this date. [M-24]');
    lines.push('These targets are counts. Cash collection requires separate receipt evidence.');
    await read('search_knowledge',{query:'historical 2025 target versions March revised plan qualified brands confirmed partnerships point in time'});
  } else if (intent === 'partnership_counts' || intent === 'deal_size') {
    const summarize = (confirmed: boolean) => read('list_records', {
      kind: 'opportunities', summarize: 'opportunity_cohort',
      ...(confirmed ? {filters:{state:'confirmed'}} : {}),
    });
    const metric = async (id: string) => firstRow(await read('get_metric', {metric_id:id}));
    const confirmed = firstRow(await summarize(true));
    if (intent === 'partnership_counts') {
      const [canonical, all] = await Promise.all([metric('M-09'), summarize(false).then(firstRow)]);
      if (canonical?.computable && Number(canonical.value) === Number(confirmed?.opportunities)) {
        lines.push(`**${cell(canonical.value)} confirmed partnerships across ${cell(confirmed?.sponsors)} distinct sponsors.** [M-09]`);
      } else {
        lines.push(`In the opportunities you can view, ${cell(confirmed?.opportunities)} are confirmed across ${cell(confirmed?.sponsors)} distinct sponsors.`);
      }
      lines.push(`Across all stages in your scope, ${cell(all?.opportunities)} opportunities span ${cell(all?.sponsors)} distinct sponsors. Multiple deals can belong to one sponsor.`);
      await read('search_knowledge', {query:'confirmed partnerships distinct sponsors brands opportunities pipeline historical funnel'});
    } else {
      const [mean, median] = await Promise.all([metric('M-15'), metric('M-16')]);
      if (mean?.computable && median?.computable) {
        lines.push(`Median signed deal size was **${money(median.value)}** [M-16]. Mean signed deal size was **${money(mean.value)}** [M-15].`);
        if (confirmed?.min_signed_value != null && confirmed.max_signed_value != null) {
          lines.push(`Signed values span ${money(confirmed.min_signed_value)} to ${money(confirmed.max_signed_value)} across ${cell(confirmed.opportunities)} confirmed deals in scope.`);
        }
        lines.push('Deal sizes cover one season and measure signed value. Cash receipts are tracked separately.');
      } else {
        lines.push('A signed deal size could not be computed for this scope. ' + cell(median?.reason ?? mean?.reason));
      }
      await read('search_knowledge', {query:'typical won deal size median mean signed value historical deal range'});
    }
  } else if (intent === 'signed' || intent === 'signed_cash_followup') {
    const measures = [['M-02','Total signed sponsorship value'],['M-03','Cash-type signed value'],['M-04','In-kind signed value'],['M-09','Confirmed partnerships (opportunities)']];
    const requestedMeasures = intent === 'signed_cash_followup' ? measures.slice(1, 3) : measures;
    const results = await Promise.all(requestedMeasures.map(async ([id, label]) => ({
      id, label, result: await read('get_metric', { metric_id: id }),
    })));
    const historical = results[0]?.result.record_class === 'historical_synthetic';
    lines.push(historical ? 'Historical synthetic sponsorship records' : 'Signed commitments for the selected edition', '',
      '| Measure | Value | Source |', '|---|---:|---|');
    for (const {id, label, result} of results) {
      const row = (result.rows as Record<string, unknown>[] | undefined)?.[0];
      if (!row) throw new Error('Metric source returned no row: ' + id);
      const value = row.computable && row.value !== null ? (id === 'M-09' ? cell(row.value) : money(row.value)) : 'Not computable: ' + cell(row.reason);
      lines.push('| ' + label + ' | ' + value + ' | [' + id + '] |');
    }
    if (intent === 'signed_cash_followup') {
      const cohort=firstRow(await read('list_records',{kind:'opportunities',summarize:'opportunity_cohort',filters:{state:'confirmed'}}));
      if(cohort?.cash_opportunities!=null && cohort.in_kind_opportunities!=null) {
        lines.push(`In the confirmed opportunities you can view, ${cell(cohort.cash_opportunities)} deals are cash-type and ${cell(cohort.in_kind_opportunities)} are in-kind.`);
      }
    }
    lines.push('', 'Signed commitments are distinct from cash collected.');
    if(options.question&&historicalSignedDate(options.question))lines.push('The point-in-time cutoff includes activity through the end of the selected date in IST.');
    await read('search_knowledge', { query: 'signed sponsorship cash type in kind synthetic dataset payment records' });
    if (historical && acc.citations.some(c => c.id === 'KB-02.1' && !c.history)) {
      lines.push('The original dataset has no receipts, so actual cash collected cannot be established. [KB-02.1]');
    }
  } else {
    const campaigns = await read('list_records', { kind: 'campaigns', limit: 25 });
    const rows = campaigns.rows as Record<string, unknown>[] | undefined;
    if (!rows || rows.length >= 25) throw new Error('Campaign listing may be truncated; narrow the scope before comparing campaigns.');
    if (campaigns.record_class === 'historical_synthetic') lines.push('Historical synthetic data.', '');
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
    // Retrieved text can contain SQL and internal tool examples. Keep it in Sources.
    const ids = [...new Set(chunks.map(c => c.id))].filter(id => /^KB-[\w.-]+$/.test(id));
    if (ids.length) lines.push('', 'Supporting references: ' + ids.map(id => '[' + id + ']').join(', ') + '.');
  } else lines.push('', 'No matching knowledge note was retrieved; the metric sources above remain authoritative.');
  return lines.join('\n');
}

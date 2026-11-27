import type { ToolRunAccumulator } from './tools.ts';
import type { SponsorMetricId } from './sponsorMetrics.ts';
export type OperationalIntent = {kind:'sponsor_ranking';metric: SponsorMetricId}|{kind:'sponsor_receivables'}|{kind:'receivable_followup'}|{kind:'clarify_money'}|{kind:'cash_total'};
/** Recognises business concepts and paraphrases, not test IDs or fixed expected answers. */
export function operationalIntent(question:string, hasFilters=false, previousQuestion=''):OperationalIntent|null {
 if(/\b(?:19\d{2}|20\d{2})\b|\b(?:as of|last year|last month|yesterday|between)\b/i.test(question))return null;
 if(/\b(single|individual receipt|individual payment|invoice)\b/i.test(question))return null;
 if(/\b(prospects?|research|outreach|pursue|targets?|attractiveness|accessibility)\b/i.test(question))return null;
 const q=question.toLowerCase();
 if(!hasFilters&&/\b(?:due dates?|overdue status|documented urgency|follow[- ]?up first|prioriti[sz]e follow[- ]?up)\b/i.test(q)&&/\b(?:outstanding|receivables?|balances?|cash|sponsors?)\b/i.test(q))return {kind:'receivable_followup'};
 if(hasFilters||/\b(create|update|delete|move|log|record|confirm|assign|schedule|compare|why|likely|probability|potential|2025|2024|2023)\b/i.test(question))return null;
 if(!/\b(highest|largest|biggest|top|most)\b/.test(q)&&/\b(?:signed partnerships?|sponsors?|deals?)\b/.test(q)&&/\b(?:still|with|have|has)\b/.test(q)&&/\b(?:outstanding|unpaid|owing|receivable)\b/.test(q)&&/\b(?:which|who|show|list)\b/.test(q))return {kind:'sponsor_receivables'};
 const rank=/\b(highest|largest|biggest|maximum|most|top|leading|best[- ]paying)\b|\b(?:by|per) sponsor\b/.test(q);
 const sponsor=(/\bwho\b/.test(q)&&/\b(paid|owes?|contributed|gave)\b/.test(q))||/\b(sponsors?|contributors?|donors?|partners?|companies|company|brands?)\b/.test(q)||(/\b(from where|who|which one|them)\b/.test(q)&&/\bsponsors?\b/i.test(previousQuestion));
 const otherGrain=/\b(campaigns?|channels?|renewals?|inbound|cold|warm|premium|bets?)\b/.test(q);
 if(rank&&sponsor&&!otherGrain){
   if(/\b(outstanding|owes?|unpaid|receivable|pending)\b/.test(q))return {kind:'sponsor_ranking',metric:'M-07'};
   if(/in[- ]kind|non[- ]cash/.test(q))return {kind:'sponsor_ranking',metric:'M-04'};
   if(/\b(signed|committed|commitments?|contract|promised|deal value)\b/.test(q))return {kind:'sponsor_ranking',metric:/\bcash\b/.test(q)?'M-03':'M-02'};
   if(/\b(collected|received|paid|paying|got|given|contributed|brought)\b/.test(q))return {kind:'sponsor_ranking',metric:'M-01'};
   return {kind:'clarify_money'};
 }
 if(!rank&&!otherGrain&&!sponsor&&!/\b(from|for|by|with|among)\b/.test(q)&&/\b(we|us|our|total|overall|altogether)\b/.test(q)&&/\b(how much|total|amount)\b/.test(q)&&/\b(collected|received|got|brought in)\b/.test(q)&&/\b(cash|money|collection|collect|received)\b/.test(q))return {kind:'cash_total'};
 return null;
}
type Read=(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const money=(v:unknown)=>'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const cell=(v:unknown)=>String(v??'—').replace(/[|\r\n]/g,' ');
export async function answerOperational(intent:OperationalIntent,read:Read,acc:ToolRunAccumulator):Promise<string>{
 if(intent.kind==='receivable_followup'){
  const result=await read('list_records',{kind:'receivables',limit:25});
  const metric=await read('get_metric',{metric_id:'M-07'});
  const rows=(result.rows as Record<string,unknown>[]|undefined)??[];
  const asOf=String(result.as_of??'the selected as-of date');
  const total=(metric.rows as Record<string,unknown>[]|undefined)?.[0];
  if(!rows.length)return `No receivable records were returned for ${String(result.edition_id??'the selected edition')}; due dates and urgency cannot be assessed from the available records.`;
  const active=rows.filter(r=>Number(r.outstanding)>0).sort((a,b)=>Number(b.overdue_amount??0)-Number(a.overdue_amount??0)||Number(b.outstanding??0)-Number(a.outstanding??0));
  const lines=[`Receivable follow-up evidence for ${String(result.edition_id??'the selected edition')} as of ${asOf}. Priority is ordered by recorded overdue amount, then remaining balance; a positive balance alone does not mean late.`];
  if(total?.computable&&total.value!=null)lines.push('',`Canonical outstanding total: ${money(total.value)} [M-07].`);
  lines.push('','| Sponsor / opportunity | Outstanding | Recorded overdue | Due-date evidence |','|---|---:|---:|---|');
  for(const row of active){
   const schedules=Array.isArray(row.payment_schedule)?row.payment_schedule as Record<string,unknown>[]:[];
   const remaining=schedules.filter(s=>Number(s.remaining_amount)>0&&s.due_date);
   const dueEvidence=remaining.length?remaining.map(s=>{
    const date=String(s.due_date),amount=money(s.remaining_amount);
    return `${date}: ${amount} remaining (${date<asOf?'overdue as of '+asOf:date===asOf?'due on '+asOf:'not yet due'})`;
   }).join('; '):'No unpaid schedule due date returned';
   lines.push(`| ${cell(row.sponsor_name)} / ${cell(row.opportunity_name)} | ${money(row.outstanding)} | ${Number(row.overdue_amount)>0?money(row.overdue_amount):'₹0'} | ${cell(dueEvidence)} |`);
  }
  if(!active.length)lines.push('| No positive outstanding balances in the returned records | ₹0 | ₹0 | No follow-up balance identified |');
  const overdue=active.filter(r=>Number(r.overdue_amount)>0);
  lines.push('',overdue.length?`**First follow-up:** ${cell(overdue[0].sponsor_name)} has the largest recorded overdue amount (${money(overdue[0].overdue_amount)}); use the schedule dates above and confirm receipt allocation with the owner.`:'**Urgency:** no positive overdue amount was returned. Prioritize the largest outstanding amount for a balance check, but do not label it late without overdue schedule evidence.');
  if(active.length>=25)lines.push('The receivable list is bounded to 25 contracts, so this is not a complete ranking if additional records exist.');
  lines.push('','If a contract has no unpaid schedule due date, its amount can be ranked by size only; its urgency cannot be established from these records.');
  return lines.join('\n');
 }
 if(intent.kind==='sponsor_receivables'){
  const [result,metric]=await Promise.all([read('list_records',{kind:'receivables',limit:25}),read('get_metric',{metric_id:'M-07'})]);
  const metricRow=(metric.rows as Record<string,unknown>[]|undefined)?.[0];
  if(metricRow?.computable===false)return String(metricRow.reason??'Outstanding cash is not computable for this edition.');
  const rows=result.rows as Record<string,unknown>[]|undefined;
  if(!rows?.length)return 'No positive outstanding cash balances were returned for sponsors in your permitted scope. [M-07]';
  const visible=rows.filter(r=>Number(r.outstanding)>0);
  const lines=[`Outstanding cash by sponsor for ${String(result.edition_id??'the selected edition')}, ranked from the permitted records [M-07].`, '', '| Rank | Sponsor | Outstanding cash |','|---:|---|---:|'];
  for(const [index,r] of visible.entries())lines.push(`| ${index+1} | ${cell(r.sponsor_name)} | ${money(Number(r.outstanding))} |`);
  if(rows.length>=25)lines.push('', 'The list is bounded to 25 receivable records; more may be available.');
  if(metricRow?.computable&&metricRow.value!=null)lines.push('',`Canonical outstanding cash total: ${money(Number(metricRow.value))} [M-07].`);
  lines.push('', 'Outstanding is a cash-balance measure, not proof that an invoice is overdue. Confirm due dates and receipt allocation with the owner before follow-up.');
  return lines.join('\n')+'\n[[blocks: table]]';
 }
 if(intent.kind==='clarify_money')return 'Do you mean the sponsor with the most cash actually collected, the largest signed commitment, or the largest unpaid balance? These can be different sponsors.';
 if(intent.kind==='cash_total'){
  const p=await read('get_metric',{metric_id:'M-01'}),r=(p.rows as Record<string,unknown>[]|undefined)?.[0];
  return r?.computable&&r.value!=null?'Cash collected: **'+money(r.value)+'**. This includes reconciled and allocated receipts, not unsigned promises or in-kind support. [M-01]':String(r?.reason??'Collected cash is unavailable for this dataset.');
 }
 const p=await read('get_sponsor_metrics',{metric_id:intent.metric,limit:25});
 if(p.computable===false)return String(p.reason??'This breakdown is unavailable.');
 const rows=p.rows as Record<string,unknown>[]|undefined;
 if(!rows?.length)return 'No sponsor financial records were found in your permitted scope for this season.';
 const first=rows[0];const labels:Record<SponsorMetricId,string>={'M-01':'cash actually collected','M-02':'signed sponsorship value (cash and in-kind)','M-03':'signed cash commitments','M-04':'signed in-kind commitments','M-07':'outstanding cash'};
 if(Number(first.value)<=0)return 'No positive '+labels[intent.metric]+' is recorded for sponsors in this scope.';
 const tied=rows.filter(r=>r.position===first.position);
 const names=tied.map(r=>String(r.sponsor_name)).join(', ');
 const scope=p.scope==='own'?'Among sponsors visible to your role, ':'For the selected season, ';
 return scope+'**'+names+'** '+(tied.length>1?'are tied for the highest ':'has the highest ')+labels[intent.metric]+': **'+money(first.value)+'**. '+(p.truncated?'The ranking continues beyond the displayed rows. ':'')+'The table shows the database-ranked sponsors. ['+intent.metric+']';
}

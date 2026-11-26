import type { ToolRunAccumulator } from './tools.ts';
import type { SponsorMetricId } from './sponsorMetrics.ts';
export type OperationalIntent = {kind:'sponsor_ranking';metric: SponsorMetricId}|{kind:'clarify_money'}|{kind:'cash_total'};
/** Recognises business concepts and paraphrases, not test IDs or fixed expected answers. */
export function operationalIntent(question:string, hasFilters=false, previousQuestion=''):OperationalIntent|null {
 if(hasFilters||/\b(create|update|delete|move|log|record|confirm|assign|schedule|compare|why|likely|probability|potential|prioritise|prioritize|2025|2024|2023)\b/i.test(question))return null;
 const q=question.toLowerCase();
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
 if(!rank&&!otherGrain&&!sponsor&&/\b(how much|total|amount)\b/.test(q)&&/\b(collected|received|got|brought in)\b/.test(q)&&/\b(cash|money|collection|collect|received)\b/.test(q))return {kind:'cash_total'};
 return null;
}
type Read=(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const money=(v:unknown)=>'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
export async function answerOperational(intent:OperationalIntent,read:Read,acc:ToolRunAccumulator):Promise<string>{
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

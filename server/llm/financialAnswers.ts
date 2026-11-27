import type { QueryablePool, ToolRunAccumulator } from './tools.ts';
import { getDataset, type ReferenceContext } from './referenceData.ts';
import { formatScenarioCash } from './responsePolicy.ts';
import { isExplicitWriteRequest } from './actionIntent.ts';
const cell=(v:unknown)=>String(v??'—').split('|').join(String.fromCharCode(92)+'|').replace(/[\r\n]/g,' ');
const money=(v:unknown)=>'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
export type FinancialIntent='activation_inventory'|'forecast_actual'|'collection_status'|'cash_position';
export function financialIntent(question:string,hasFilters=false):FinancialIntent|null {
 if(hasFilters||isExplicitWriteRequest(question))return null;
 if(/\b(?:change|update|set|revise|replace)\b.{0,60}\b(?:forecast|expected|stretch|projection|projected)\b/i.test(question))return null;
 // A short "budget?" question from the Analyst means the current sponsorship
 // money snapshot. Route it to the same verified metrics as an explicit cash
 // position request instead of asking the model to expose internal tools.
 if(/\bbudget\b/i.test(question)&&! /\b(?:spend|expenses?|operating costs?|budget target|approved target)\b/i.test(question)&&(/\b(?:sponsorship|sponsor|our|current|season|202[56])\b/i.test(question)||/^\s*(?:what(?:'s| is)\s+)?budget\s*[?.!]*\s*$/i.test(question)))return 'cash_position';
 if(/\bactivations?\b/i.test(question)&&/\b(slots?|price|prices|pricing|cost|costs|inventory|how many)\b/i.test(question))return 'activation_inventory';
 if(/\b(forecast|expected|stretch|projection|projected)\b/i.test(question)&&/\b(collected|received|receipts|actual|already paid)\b/i.test(question))return 'forecast_actual';
 if(/\b(complete picture|cash position|how much is signed|cash-type signed|remains outstanding|largest outstanding balances)\b/i.test(question)||(/\b(signed|commitments?)\b/i.test(question)&&/\b(collected|cash collected|received)\b/i.test(question)&&/\b(compare|distinction|difference|separate|outstanding|receivable|unpaid|due dates?|overdue)\b/i.test(question)))return 'cash_position';
 if(/\b(paid late|late payment|outstanding|cash collection rate|collection rate|cash collected)\b/i.test(question))return 'collection_status';
 return null;
}
export async function getInventory(pool:QueryablePool,id:string|undefined,ctx:ReferenceContext):Promise<Record<string,unknown>> {
 const datasets=[];
 for(const dataset_id of ['data_foundation.curated_data.commercial_inventory','financial_modelling.inventory.b_pricing_summary']){
  const data=await getDataset(pool,{dataset_id,limit:50},ctx);
  if(data.truncated)throw new Error('Inventory source is truncated; cannot claim a complete inventory.');
  if(data.available===true&&id){data.rows=(data.rows as Record<string,unknown>[]).filter(row=>Object.entries(row).some(([key,value])=>/asset|package|product|name|item|type/i.test(key)&&String(value??'').toLowerCase().includes(id.toLowerCase())));}
  datasets.push(data);
 }
 return {source:'inventory_reference',kind:'inventory',available:datasets.some(d=>d.available===true),datasets};
}
type Read=(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export async function answerFinancial(intent:FinancialIntent,read:Read,acc:ToolRunAccumulator,options:{includeReceivableDetails?:boolean}={}):Promise<string>{
 const lines:string[]=[];
 if(intent==='activation_inventory'){
  const result=await read('get_register',{kind:'inventory',id:'activation'});
  if(result.available!==true)throw new Error('Inventory sources are unavailable.');
  lines.push('Activation inventory and pricing — source values below. Prices are model assumptions derived from asking-price ratios, not guaranteed realised prices. Preserve the units in each source column.');
  for(const data of result.datasets as Record<string,unknown>[]){
   lines.push('','Source: ['+cell(data.dataset_id??'unavailable inventory source')+']');
   const rows=data.rows as Record<string,unknown>[]|undefined;
   if(!rows?.length){lines.push('No matching activation rows were returned from this source.');continue;}
   const columns=data.columns as string[];lines.push('| '+columns.map(cell).join(' | ')+' |','| '+columns.map(()=>'---').join(' | ')+' |');
   for(const row of rows)lines.push('| '+columns.map(k=>cell(row[k])).join(' | ')+' |');
  }
  await read('search_knowledge',{query:'activation slots realised pricing low mode high upfront asking price ratios approved stretch sales'});
 }else if(intent==='forecast_actual'){
  const scenarios=await read('get_scenario',{});
  lines.push('Approved scenario values are forecasts of pre-festival cash, not actual collected cash.','', '| Scenario | Forecast cash | P10 | P50 | P90 |','|---|---:|---:|---:|---:|');
  for(const row of (scenarios.scenarios as Record<string,unknown>[]??[]))lines.push('| ['+cell(row.scenario_id)+'] '+cell(row.name)+' | '+formatScenarioCash(row.expected_cash)+' | '+formatScenarioCash(row.p10)+' | '+formatScenarioCash(row.p50)+' | '+formatScenarioCash(row.p90)+' |');
  const collected=await read('get_metric',{metric_id:'M-01'});
  const row=(collected.rows as Record<string,unknown>[]|undefined)?.[0];
  if(!row)throw new Error('Cash-collected source returned no row.');
  lines.push('',row.computable&&row.value!==null?'Recorded collected cash for the selected edition: ₹'+Number(row.value).toLocaleString('en-IN',{maximumFractionDigits:2})+' [M-01].':'Collected cash is not computable for the selected edition: '+cell(row.reason)+' [M-01].');
  lines.push('A forecast does not establish receipt or collection. Use the edition and as-of date shown with these sources.');
  await read('search_knowledge',{query:'approved stretch scenario expected cash forecast not actual collected receipts missing payment data'});
 }else{
  if(intent==='cash_position'){
   const metrics:Record<string,Record<string,unknown>>={};
   for(const id of ['M-02','M-03','M-01','M-07','M-04']){
    const result=await read('get_metric',{metric_id:id});
    const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
    if(!row)throw new Error('Cash-position source returned no row: '+id);
    metrics[id]=row;
   }
   lines.push('## Current cash position (selected edition and as-of date)');
   const labels:Record<string,string>={'M-02':'Signed total (cash + in-kind)','M-03':'Cash-type signed value','M-04':'Signed in-kind value','M-01':'Cash actually collected','M-07':'Outstanding cash'};
   lines.push('| Measure | Value |','|---|---:|');
   for(const id of ['M-02','M-03','M-04','M-01','M-07']){
    const r=metrics[id];
    lines.push(`| ${labels[id]} [${id}] | ${r.computable&&r.value!=null?'₹'+Number(r.value).toLocaleString('en-IN'):'Not computable: '+cell(r.reason)} |`);
   }
   const cashSigned=metrics['M-03'],cashCollected=metrics['M-01'],cashOutstanding=metrics['M-07'];
   if(cashSigned.computable&&cashCollected.computable&&cashOutstanding.computable&&cashSigned.value!=null&&cashCollected.value!=null&&cashOutstanding.value!=null){
    const difference=Number(cashSigned.value)-Number(cashCollected.value)-Number(cashOutstanding.value);
    lines.push('',Math.abs(difference)<0.01?`Reconciliation: signed cash = collected cash + outstanding cash (${money(cashSigned.value)} = ${money(cashCollected.value)} + ${money(cashOutstanding.value)}).`:`Reconciliation gap: signed cash minus collected and outstanding is ${money(difference)}. The source metrics do not balance; investigate the underlying schedule/receipt records before relying on the total.`);
   }
   const outstanding=metrics['M-07'];
   if(outstanding.computable){
    const rank=await read('get_sponsor_metrics',{metric_id:'M-07',limit:10});
    const rows=rank.rows as Record<string,unknown>[]|undefined;
    lines.push('', '**Largest recorded outstanding balances:**');
    if(rows?.length){
     for(const r of rows.slice(0,5))lines.push(`- ${cell(r.sponsor_name)} — ₹${Number(r.value).toLocaleString('en-IN')} [sponsor_metrics:M-07]`);
    }else lines.push('No positive sponsor-level outstanding balances were returned.');
    if(options.includeReceivableDetails){
     const receivables=await read('list_records',{kind:'receivables',limit:25});
     const records=(receivables.rows as Record<string,unknown>[]|undefined)??[];
     const asOf=String(receivables.as_of??'the selected as-of date');
     const active=records.filter(r=>Number(r.outstanding)>0).sort((a,b)=>Number(b.overdue_amount??0)-Number(a.overdue_amount??0)||Number(b.outstanding??0)-Number(a.outstanding??0));
     lines.push('',`**Due-date and urgency evidence (as of ${asOf}):**`,'| Sponsor / opportunity | Balance | Recorded overdue | Due-date evidence |','|---|---:|---:|---|');
     for(const r of active){
      const schedules=Array.isArray(r.payment_schedule)?r.payment_schedule as Record<string,unknown>[]:[];
      const dues=schedules.filter(s=>Number(s.remaining_amount)>0&&s.due_date).map(s=>{const date=String(s.due_date);return `${date}: ${money(s.remaining_amount)} remaining (${date<asOf?'overdue':date===asOf?'due today':'not yet due'})`;});
      lines.push(`| ${cell(r.sponsor_name)} / ${cell(r.opportunity_name)} | ${money(r.outstanding)} | ${Number(r.overdue_amount)>0?money(r.overdue_amount):'₹0 recorded'} | ${cell(dues.join('; ')||'No unpaid schedule due date returned')} |`);
     }
     const urgent=active.filter(r=>Number(r.overdue_amount)>0)[0];
     lines.push('',urgent?`**First follow-up:** ${cell(urgent.sponsor_name)} has the largest recorded overdue amount (${money(urgent.overdue_amount)}); confirm receipt allocation and contact the owner.`:'**Urgency:** no positive overdue balance was returned. Use amount to order a balance check, but do not label undated balances late.');
     if(active.length>=25)lines.push('The receivable list is capped at 25; the table may not be exhaustive.');
    }else lines.push('', 'Follow up first on the highest positive outstanding balances above, validating due dates and receipt allocation with the account owner. This is a priority order from the outstanding ledger, not proof that an amount is late.');
   }else lines.push('', 'Sponsor follow-up ranking is unavailable because outstanding cash cannot be reconciled for this edition. Do not treat signed or invoiced value as collected cash.');
   lines.push('', 'Signed value, cash-type signed value, collected cash and outstanding cash are separate measures. In-kind is included only in M-02, not M-03 or M-01. A late-payment/T−7 conclusion requires dated due-date and receipt records.');
   return lines.join('\n');
  }
  const collected=await read('get_metric',{metric_id:'M-01'});
  const outstanding=await read('get_metric',{metric_id:'M-07'});
  const signedCash=await read('get_metric',{metric_id:'M-03'});
  const c=(collected.rows as Record<string,unknown>[]|undefined)?.[0],o=(outstanding.rows as Record<string,unknown>[]|undefined)?.[0],s=(signedCash.rows as Record<string,unknown>[]|undefined)?.[0];
  if(!c||!o||!s)throw new Error('Collection sources returned no metric row.');
  if(!c.computable||!o.computable){
   lines.push('I cannot determine late payers, outstanding cash at T−7, or an actual collection rate for this edition because the receipt and reconciliation ledger is unavailable. Signed commitments are not evidence of collected cash.', '', `Collected cash [M-01]: ${cell(c.reason??'not computable')}`, `Outstanding cash [M-07]: ${cell(o.reason??'not computable')}`);
  }else{
   const rate=s.computable&&Number(s.value)>0?Number(c.value)/Number(s.value):null;
   lines.push(`Recorded collected cash: ₹${Number(c.value).toLocaleString('en-IN')} [M-01]. Outstanding cash: ₹${Number(o.value).toLocaleString('en-IN')} [M-07].${rate===null?' A collection rate cannot be computed because signed cash is unavailable.':` Collection against signed cash is ${(rate*100).toFixed(1)}% [M-03, M-01].`} Late-payment identification requires dated receipt and due-date records.`);
  }
  await read('search_knowledge',{query:'historical receipts reconciliation collection rate outstanding cash late payment ledger'});
 }
 const seen=new Set<string>();for(const c of acc.citations){if(c.type==='knowledge'&&!c.history&&!seen.has(c.id)){seen.add(c.id);lines.push('','> ['+cell(c.id)+'] '+cell(c.text));}}
 return lines.join('\n');
}

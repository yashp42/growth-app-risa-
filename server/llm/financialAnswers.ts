import type { QueryablePool, ToolRunAccumulator } from './tools.ts';
import { getDataset, type ReferenceContext } from './referenceData.ts';
import { formatScenarioCash } from './responsePolicy.ts';
const cell=(v:unknown)=>String(v??'—').split('|').join(String.fromCharCode(92)+'|').replace(/[\r\n]/g,' ');
export type FinancialIntent='activation_inventory'|'forecast_actual';
export function financialIntent(question:string,hasFilters=false):FinancialIntent|null {
 if(hasFilters||/\b(create|update|delete|change|log|assign|move|mark|confirm|schedule)\b/i.test(question))return null;
 if(/\bactivations?\b/i.test(question)&&/\b(slots?|price|prices|pricing|cost|costs|inventory|how many)\b/i.test(question))return 'activation_inventory';
 if(/\b(forecast|expected|stretch|projection|projected)\b/i.test(question)&&/\b(collected|received|receipts|actual|already paid)\b/i.test(question))return 'forecast_actual';
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
export async function answerFinancial(intent:FinancialIntent,read:Read,acc:ToolRunAccumulator):Promise<string>{
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
 }else{
  const scenarios=await read('get_scenario',{});
  lines.push('Approved scenario values are forecasts of pre-festival cash, not actual collected cash.','', '| Scenario | Forecast cash | P10 | P50 | P90 |','|---|---:|---:|---:|---:|');
  for(const row of (scenarios.scenarios as Record<string,unknown>[]??[]))lines.push('| ['+cell(row.scenario_id)+'] '+cell(row.name)+' | '+formatScenarioCash(row.expected_cash)+' | '+formatScenarioCash(row.p10)+' | '+formatScenarioCash(row.p50)+' | '+formatScenarioCash(row.p90)+' |');
  const collected=await read('get_metric',{metric_id:'M-01'});
  const row=(collected.rows as Record<string,unknown>[]|undefined)?.[0];
  if(!row)throw new Error('Cash-collected source returned no row.');
  lines.push('',row.computable&&row.value!==null?'Recorded collected cash for the selected edition: ₹'+Number(row.value).toLocaleString('en-IN',{maximumFractionDigits:2})+' [M-01].':'Collected cash is not computable for the selected edition: '+cell(row.reason)+' [M-01].');
  lines.push('A forecast does not establish receipt or collection. Use the edition and as-of date shown with these sources.');
  await read('search_knowledge',{query:'approved stretch scenario expected cash forecast not actual collected receipts missing payment data'});
 }
 const seen=new Set<string>();for(const c of acc.citations){if(c.type==='knowledge'&&!c.history&&!seen.has(c.id)){seen.add(c.id);lines.push('','> ['+cell(c.id)+'] '+cell(c.text));}}
 return lines.join('\n');
}

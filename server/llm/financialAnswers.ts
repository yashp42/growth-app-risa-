import type { QueryablePool, ToolRunAccumulator } from './tools.ts';
import { getDataset, type ReferenceContext } from './referenceData.ts';
import { formatScenarioCash } from './responsePolicy.ts';
import { isExplicitWriteRequest } from './actionIntent.ts';
import { compareReceivableUrgency, documentedOverdueAmount } from './receivableTiming.ts';
const cell=(v:unknown)=>String(v??'—').split('|').join(String.fromCharCode(92)+'|').replace(/[\r\n]/g,' ');
const money=(v:unknown)=>'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
export type FinancialIntent='activation_inventory'|'inventory_policy'|'scenario_comparison'|'scenario_version'|'scenario_probability'|'forecast_actual'|'collection_status'|'cash_position';
export function financialIntent(question:string,hasFilters=false):FinancialIntent|null {
 if(hasFilters||isExplicitWriteRequest(question))return null;
 if(/\b(?:change|update|set|revise|replace)\b.{0,60}\b(?:forecast|expected|stretch|projection|projected)\b/i.test(question))return null;
 // A short "budget?" question from the Analyst means the current sponsorship
 // money snapshot. Route it to the same verified metrics as an explicit cash
 // position request instead of asking the model to expose internal tools.
 if(/\bbudget\b/i.test(question)&&! /\b(?:spend|expenses?|operating costs?|budget target|approved target)\b/i.test(question)&&(/\b(?:sponsorship|sponsor|our|current|season|202[56])\b/i.test(question)||/^\s*(?:what(?:'s| is)\s+)?budget\s*[?.!]*\s*$/i.test(question)))return 'cash_position';
 if(inventoryPolicyIntent(question))return 'inventory_policy';
 if(/\bactivations?\b/i.test(question)&&/\b(slots?|price|prices|pricing|cost|costs|inventory|how many)\b/i.test(question))return 'activation_inventory';
 if(/\b(forecast|expected|stretch|projection|projected)\b/i.test(question)&&/\b(collected|received|receipts|actual|already paid)\b/i.test(question))return 'forecast_actual';
 if(scenarioVersionQuestion(question))return 'scenario_version';
 if(scenarioProbabilityThreshold(question)!==undefined) return 'scenario_probability';
 if(/\b(?:difference|compare|comparison|versus|vs)\b/i.test(question) &&
    /\bbase\b/i.test(question) && /\b(?:plan|stretch)\b/i.test(question) &&
    /\b(?:scenario|forecast|assumptions?)s?\b/i.test(question)) return 'scenario_comparison';
 if(/\b(complete picture|cash position|how much is signed|cash-type signed|remains outstanding|largest outstanding balances)\b/i.test(question)||(/\b(signed|commitments?)\b/i.test(question)&&/\b(collected|cash collected|received)\b/i.test(question)&&/\b(compare|distinction|difference|separate|outstanding|receivable|unpaid|due dates?|overdue)\b/i.test(question)))return 'cash_position';
 if(/\b(paid late|late payment|outstanding|cash collection rate|collection rate|cash collected)\b|\b(?:cash|money) did we (?:collect|receive)\b/i.test(question))return 'collection_status';
 return null;
}
function inventoryPolicyIntent(question:string):'packages'|'standalone'|'title_timing'|'exclusivity_version'|undefined {
 if(/\b(?:conflict|based on|decision log)\b/i.test(question)&&/\bexclusiv\w*\b/i.test(question))return 'exclusivity_version';
 if(/\bexclusiv\w*\b/i.test(question)&&/\b(?:standalone|on its own|separately)\b/i.test(question))return 'standalone';
 if(/\btitle\b/i.test(question)&&/\b(?:week\s+|w-?)\d+\b/i.test(question)&&/\b(?:sell|close|sign)\b/i.test(question))return 'title_timing';
 if(/\b(?:packages|sponsorship packages)\b/i.test(question)&&/\b(?:offer|sell|price)\b/i.test(question)&&
    /\b(?:sponsor|sponsorship|brand|partner|fintech)\b/i.test(question))return 'packages';
}
function scenarioVersionQuestion(question: string): {scenario: string; amount: number} | undefined {
 const target=question.match(/\b(base|plan|stretch)\b/i)?.[1]?.toLowerCase();
 const amount=question.match(/(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:lakh(?:s)?|lac(?:s)?|l\b)/i);
 if(!target||!amount||!/\b(?:earlier|old|deck|right|correct|current|superseded|target)\b/i.test(question)||
    /\b(?:compare|vs|versus|actual|collected|chance|probability|odds|cash position)\b/i.test(question))return;
 return {scenario:target,amount:Number(amount[1])};
}
function scenarioProbabilityThreshold(question: string): number | undefined {
 if (!/\b(?:chance|probability|odds)\b/i.test(question) ||
     !/\b(?:(?:cross|reach|exceed|collect|hit)(?:ing|es|s)?|above|over|at least)\b/i.test(question)) return;
 const match=question.match(/(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:lakh(?:s)?|lac(?:s)?|l\b)/i);
 return match ? Number(match[1]) : undefined;
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
export async function answerFinancial(intent:FinancialIntent,read:Read,acc:ToolRunAccumulator,options:{includeReceivableDetails?:boolean; question?:string}={}):Promise<string>{
 const lines:string[]=[];
 if(intent==='inventory_policy'){
  const policy=inventoryPolicyIntent(options.question??'');
  const queries:Record<string,string[]>={
   packages:['commercial inventory asset definitions title presenting activation digital packages','frozen realised price triangles low mode high title presenting activation digital asking price ratios','only the title carries exclusivity approved broad narrow payments partner'],
   standalone:['asset definitions standalone category exclusives rejected worth less than deals they block','operating policy sell no standalone category exclusives negotiate narrow title'],
   title_timing:['frozen asset parameters title lead times weeks sell by W7 term sheet','title term sheet W0 stop at W7 if unsold presenting decision rules'],
   exclusivity_version:['approved stretch broad title exclusivity EXCL_SCOPE negotiating goal narrow upside'],
  };
  if(!policy)return 'Which inventory or exclusivity rule would you like to check?';
  await Promise.all(queries[policy].map(query=>read('search_knowledge',{query,related_bet:'B5'})));
  if(policy==='exclusivity_version')await read('search_knowledge',{
    query:'conflict title narrow exclusivity decision log broad approved stretch C11',include_history:true,related_bet:'B5',
  });
  const note=(id:string)=>(acc.citations.find(c=>c.id===id&&c.decision_status==='approved'&&!c.history)?.text as string|undefined);
  if(policy==='standalone'){
   const policyText=note('KB-13.4');
   if(!policyText)return 'The approved exclusivity rule could not be verified.';
   lines.push('The approved policy rejects standalone category exclusives. Narrow exclusivity can be negotiated within a title deal. [KB-13.4]');
   const explanation=note('KB-04.2')?.match(/Standalone category exclusives: ([\s\S]+?)\. Standard package/i)?.[1];
   if(explanation)lines.push('The inventory rationale is '+cell(explanation)+'. The price ratio is a benchmark assumption. [KB-04.2]');
  }else if(policy==='title_timing'){
   const when=options.question?.match(/\b(?:week\s+|w)(\d+)\b/i);
   const timing=note('KB-04.3')?.match(/Lead times \(weeks\): title (\d+) \/ (\d+) \/ (\d+) with sell-by W(\d+)/i);
   const gate=note('KB-11.3')?.match(/(?:^|[.]\s+)Title: ([^.]+)/i)?.[1];
   if(!timing||!when)return 'The approved title timeline could not be verified for the requested week.';
   const [,low,,high,stop]=timing;
   lines.push(`Title lead time is an assumption of ${low}–${high} weeks, with a sell-by date in week ${stop}. [KB-04.3]`);
   if(Number(when[1])+Number(low)>Number(stop))lines.push('A new pitch falls outside even the shortest modelled timeline. Review an existing term sheet first. If the title remains unsold at the cutoff, stop the title pitch and check presenting availability.');
   else lines.push('There is time in the modelled window at the low end. Verify the buyer’s stage and approval date before committing capacity.');
   if(gate)lines.push('Approved title decision rule: '+cell(gate)+'. [KB-11.3]');
  }else if(policy==='exclusivity_version'){
   const current=note('KB-04.4');
   if(!current)return 'The approved exclusivity assumption could not be verified.';
   const correction=current.match(/The approved stretch[\s\S]+?(?=Narrow exclusivity)/i)?.[0]?.trim();
   const upside=current.match(/The \+₹[\d.]+L gain from narrow[^.]+\./i)?.[0];
   if(correction)lines.push('The approved model uses broad exclusivity. '+cell(correction)+' [KB-04.4]');
   if(upside)lines.push(cell(upside)+' [KB-04.4]');
   if(acc.citations.some(c=>c.id==='KB-15.4'&&c.history))lines.push('Historical only: the log wording described the desired negotiating outcome. [KB-15.4]');
  }else{
   const pricing=note('KB-04.3')?.match(/Realised-price triangles[^:]*:\s*([\s\S]+?)(?:[.;]\s*Close per meeting:|$)/i)?.[1];
   if(!pricing)return 'The approved inventory pricing assumptions could not be verified.';
   lines.push('Package pricing uses model assumptions based on asking-price ratios. Confirm live availability before making an offer.','',
    '| Package | Modelled realised price, low / most likely / high (₹ lakh) |','|---|---:|');
   for(const m of pricing.matchAll(/\b(title|presenting|activation|digital) (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?)/gi)){
    lines.push(`| ${m[1]} | ${m[2]} / ${m[3]} / ${m[4]} |`);
   }
   lines.push('', 'Pricing assumptions: [KB-04.3].');
   if(note('KB-04.2'))lines.push('The approved inventory includes title, presenting and add-on packages. Standalone exclusives are excluded. [KB-04.2]');
   if(note('KB-04.4'))lines.push('Title carries exclusivity. Narrow payments-partner language can be negotiated as part of the title package. [KB-04.4]');
  }
 }else if(intent==='scenario_version'){
  const request=scenarioVersionQuestion(options.question??'');
  if(!request)return 'Which approved scenario figure would you like to check?';
  const catalogue=await read('get_scenario',{});
  const entries=((catalogue.scenarios??[]) as Record<string,unknown>[])
    .filter(s=>['SC-01','SC-02','SC-03'].includes(String(s.scenario_id)));
  const selected=entries.find(s=>String(s.name).trim().toLowerCase()===request.scenario);
  if(!selected||selected.expected_cash==null)return 'The approved figure for this scenario is unavailable.';
  const amount=formatScenarioCash(selected.expected_cash);
  lines.push(`The approved D-009 ${cell(selected.name)} forecast is **${amount}** [${cell(selected.scenario_id)}].`);
  const matches=(s: Record<string,unknown>)=>s.expected_cash!=null &&
    Math.abs(Number(s.expected_cash)-request.amount)<=0.05;
  const alternative=entries.find(s=>s!==selected&&matches(s));
  if(alternative)lines.push(`${formatScenarioCash(alternative.expected_cash)} is the approved ${cell(alternative.name)} forecast [${cell(alternative.scenario_id)}].`);
  if(!matches(selected)){
   await read('search_knowledge',{query:`${request.scenario} ${request.amount} superseded forecast earlier model decision D-005 D-009`,include_history:true,related_kpi:'K-NS-01'});
   const correction=acc.citations.find(c=>c.history&&c.id==='KB-15.1');
   const past=typeof correction?.text==='string' ? correction.text.match(/^SUPERSEDED:\s*([\s\S]{1,380}?)\s+CURRENT:/i)?.[1] : undefined;
   if(past&&past.includes(formatScenarioCash(request.amount))){
    lines.push(`Superseded D-005 comparison only: ${past} [KB-15.1]`);
   }else lines.push('I could not verify the origin of the other figure in the available history.');
  }
  lines.push('The approved figure is a forecast of pre-festival cash. Measured receipts are tracked separately.');
 }else if(intent==='scenario_comparison'||intent==='scenario_probability'){
  const catalogue=await read('get_scenario',{});
  const scenarios=((catalogue.scenarios??[]) as Record<string,unknown>[])
    .filter(row=>['SC-01','SC-02','SC-03'].includes(String(row.scenario_id)));
  if(!scenarios.length) return 'The approved scenario catalogue is unavailable for this request.';
  await read('search_knowledge',{query:'approved financial scenarios base plan stretch pre season premium capacity model probability expected cash',related_kpi:'K-NS-01'});
  const approved=acc.citations.find(c=>c.id==='KB-07.1'&&c.decision_status==='approved'&&!c.history);
  if(intent==='scenario_comparison'){
   await Promise.all([
    read('search_knowledge',{query:'base versus stretch what differs capacity only premium inventory sequential bridge attribution of record'}),
    read('search_knowledge',{query:'exact Shapley values each approved scenario handoff renewals creator premium inventory attribution of record'}),
   ]);
   lines.push('Approved model forecasts for cash before the festival.','',
     '| Scenario | Expected cash | P10–P90 | Window person-weeks | Pre-season person-weeks |','|---|---:|---:|---:|---:|');
   for(const s of scenarios) lines.push(`| ${cell(s.name)} [${cell(s.scenario_id)}] | ${formatScenarioCash(s.expected_cash)} | ${formatScenarioCash(s.p10)}–${formatScenarioCash(s.p90)} | ${cell(s.window_pw)} | ${cell(s.preseason_pw)} |`);
   if(approved) lines.push('', 'Base focuses on the handoff, cash discipline and renewals. Plan adds gated introductions and creator outreach. Stretch adds premium inventory and pre-season capacity. Its additional cash depends on premium sales and available staff. [KB-07.1]');
  } else {
   const threshold=options.question ? scenarioProbabilityThreshold(options.question) : undefined;
   let reported=0;
   if(threshold!==undefined&&typeof approved?.text==='string'){
    for(const s of scenarios){
     const id=String(s.scenario_id);
     const segment=approved.text.split('('+id+'):')[1]?.split(/(?:Base|Plan|Stretch) \(SC-0[123]\):/)[0];
     const p=segment && [...segment.matchAll(/P\(≥ ₹(\d+(?:\.\d+)?)L\)\s*(\d+(?:\.\d+)?)%/g)].find(m=>Number(m[1])===threshold);
     if(p){lines.push(`- ${cell(s.name)}: **${p[2]}%** [${id}; KB-07.1]`);reported++;}
    }
   }
   if(reported) lines.unshift(`Approved probability of reaching at least ${formatScenarioCash(threshold)}:`,'');
   if(reported<scenarios.length||reported===0) lines.push('A probability for this threshold is unavailable for every scenario that is not listed. It cannot be calculated from the published percentiles alone.');
  }
  lines.push('', 'These are model outputs conditional on the approved assumptions. Actual collected cash is a separate measure.');
 }else if(intent==='activation_inventory'){
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
     const active=records.filter(r=>Number(r.outstanding)>0).sort((a,b)=>compareReceivableUrgency(a,b,asOf));
     lines.push('',`**Due-date and urgency evidence (as of ${asOf}):**`,'| Sponsor / opportunity | Balance | Past due by schedule | Due-date evidence |','|---|---:|---:|---|');
     for(const r of active){
      const schedules=Array.isArray(r.payment_schedule)?r.payment_schedule as Record<string,unknown>[]:[];
      const dues=schedules.filter(s=>Number(s.remaining_amount)>0&&s.due_date).map(s=>{const date=String(s.due_date);return `${date}: ${money(s.remaining_amount)} remaining (${date<asOf?'overdue':date===asOf?'due today':'not yet due'})`;});
      const overdue=documentedOverdueAmount(r,asOf);
      lines.push(`| ${cell(r.sponsor_name)} / ${cell(r.opportunity_name)} | ${money(r.outstanding)} | ${overdue===null?'Not rankable':money(overdue)} | ${cell(dues.join('; ')||'No unpaid schedule due date returned')} |`);
     }
     const urgent=active.find(r=>(documentedOverdueAmount(r,asOf)??0)>0);
     lines.push('',urgent?`**First follow-up:** ${cell(urgent.sponsor_name)} has the largest documented past-due schedule balance (${money(documentedOverdueAmount(urgent,asOf))} as of ${asOf}); confirm receipt allocation and contact the owner.`:'**Urgency:** no positive past-due schedule balance was found as of this edition date. Use amount to order a balance check, but do not label undated balances late.');
     if(active.length>=25)lines.push('The receivable list is capped at 25; the table may not be exhaustive.');
    }else lines.push('', 'Follow up first on the highest positive outstanding balances above, validating due dates and receipt allocation with the account owner. This is a priority order from the outstanding ledger, not proof that an amount is late.');
   }else lines.push('', 'Sponsor follow-up ranking is unavailable because outstanding cash cannot be reconciled for this edition. Do not treat signed or invoiced value as collected cash.');
   lines.push('', 'Signed value, cash-type signed value, collected cash and outstanding cash are separate measures. In-kind is included only in M-02, not M-03 or M-01. A late-payment/T−7 conclusion requires dated due-date and receipt records.');
   return lines.join('\n');
  }
  const [collected, outstanding, collectionRate]=await Promise.all(
   ['M-01','M-07','M-06'].map(metric_id=>read('get_metric',{metric_id})));
  const c=(collected.rows as Record<string,unknown>[]|undefined)?.[0],o=(outstanding.rows as Record<string,unknown>[]|undefined)?.[0],s=(collectionRate.rows as Record<string,unknown>[]|undefined)?.[0];
  if(!c||!o||!s)throw new Error('Collection sources returned no metric row.');
  if(!c.computable||!o.computable){
   lines.push('The data is insufficient to determine late payers, outstanding cash at T−7, or the actual collection rate [M-06]. This edition has no usable receipt and reconciliation ledger. Signed commitments are not evidence of collected cash.', '', `Collected cash [M-01]: ${cell(c.reason??'not computable')}`, `Outstanding cash [M-07]: ${cell(o.reason??'not computable')}`);
   if (collected.record_class === 'historical_synthetic' || c.record_class === 'historical_synthetic') {
    const signed = await Promise.all(['M-02','M-03'].map(metric_id=>read('get_metric',{metric_id})));
    signed.forEach((result,index)=>{
     const row=(result.rows as Record<string,unknown>[]|undefined)?.[0];
     if(row?.computable && row.value!=null) lines.push((index===0?'Total signed value':'Cash-type signed value')+': '+formatScenarioCash(Number(row.value)/100000)+' ['+(index===0?'M-02':'M-03')+'].');
    });
   }
  }else{
   const rate=s.computable&&s.value!=null?Number(s.value):null;
   lines.push(`Recorded collected cash: ₹${Number(c.value).toLocaleString('en-IN')} [M-01]. Outstanding cash: ₹${Number(o.value).toLocaleString('en-IN')} [M-07].${rate===null?' A collection rate cannot be computed because signed cash is unavailable.':` Collection against signed cash is ${(rate*100).toFixed(1)}% [M-06].`} Late-payment identification requires dated receipt and due-date records.`);
  }
  if (!c.computable && /\b(?:how much|actual receipts)\b/i.test(options.question??'') &&
      (collected.record_class==='historical_synthetic'||c.record_class==='historical_synthetic')) {
   await read('search_knowledge',{query:'North Star 2025 cash collected no receipts assumed last year model output',related_kpi:'K-NS-01'});
   const note=acc.citations.find(c=>c.id==='KB-12.1'&&!c.history);
   const example=String(note?.text??'').match(/≈\s*(₹[\d.]+L)/)?.[1];
   if(example)lines.push(`For planning, ${example} was a model assumption. The historical dataset does not establish that this amount was received. [KB-12.1]`);
  }
  await read('search_knowledge',{query:'historical 2025 missing data no payment receipts reconciliation collection rate outstanding cash late payment assumptions'});
 }
 const references=[...new Set(acc.citations.filter(c=>c.type==='knowledge'&&!c.history).map(c=>c.id))].filter(id=>/^KB-[\w.-]+$/.test(id));
 if(references.length) lines.push('', 'Supporting references: '+references.map(id=>'['+id+']').join(', ')+'.');
 return lines.join('\n');
}

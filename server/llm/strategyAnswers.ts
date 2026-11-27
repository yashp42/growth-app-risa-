import type { ToolRunAccumulator } from './tools.ts';
import { requiredSampleFloor } from '../ruleBands.ts';
import { formatScenarioCash } from './responsePolicy.ts';

export type StrategyIntent = 'growth_bets' | 'capacity_allocation';
export function strategyIntents(question:string,hasFilters=false):StrategyIntent[]{
 if(hasFilters)return [];
 const intents:StrategyIntent[]=[];
 if(/\b(?:five|5)\b/i.test(question)&&/\b(?:growth bets?|bets?)\b/i.test(question)&&/\b(?:threshold|D-010|escalation|continue|intervene|evaluate)\b/i.test(question))intents.push('growth_bets');
 if(/\b5 person[- ]weeks?\b/i.test(question)&&/\b(?:capacity|allocate|allocation|deprioritise|deprioritize|compare)\b/i.test(question))intents.push('capacity_allocation');
 return intents;
}
export function strategyIntent(question:string,hasFilters=false):StrategyIntent|null{return strategyIntents(question,hasFilters)[0]??null;}
type Read=(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const cell=(v:unknown)=>String(v??'—').replace(/[|\r\n]/g,' ');
function withColumnLabels(data:Record<string,unknown>,labels:string[]):{columns:string[];rows:Record<string,unknown>[]} {
 const columns=(data.columns as string[]|undefined)??[];
 const rows=(data.rows as Record<string,unknown>[]|undefined)??[];
 const genericSheet=columns.length>1&&columns.slice(1).every(key=>/^col_\d+$/i.test(key));
 const mapped=columns.map((key,index)=>genericSheet&&(index===0||/^col_\d+$/i.test(key))?(labels[index]??key):key);
 return {columns:mapped,rows:rows.map(row=>Object.fromEntries(columns.map((key,index)=>[mapped[index]??key,row[key]])))};
}
export async function answerStrategy(intent:StrategyIntent,read:Read,acc:ToolRunAccumulator):Promise<string>{
 if(intent==='capacity_allocation'){
  const [scenarios,capacity,betEconomics,knowledge]=await Promise.all([
   read('get_scenario',{}),read('get_dataset',{dataset_id:'strategy.resource_allocation.scenario_capacity',limit:50}),
   read('get_dataset',{dataset_id:'strategy.resource_allocation.bets',limit:20}),
   read('search_knowledge',{query:'D-010 approved Base Plan Stretch person-weeks capacity allocation opportunity cost cold outreach contingency'})
  ]);
  const lines=['I will keep the approved D-009/D-010 assumptions unchanged. Base, Plan and Stretch are distinct approved scenarios; scenario contribution is modelled, not guaranteed revenue.'];
  const ss=scenarios.scenarios as Record<string,unknown>[]|undefined;
  if(ss?.length){lines.push('','| Approved scenario | Modelled cash |','|---|---:|');for(const s of ss)lines.push(`| ${cell(s.name)} (${cell(s.scenario_id)}) | ${formatScenarioCash(s.expected_cash)} |`);}
  const capacityTable=withColumnLabels(capacity,['Scenario','Capacity pw','Net effort mean pw','Net effort P90 pw','Buffer mean pw','Buffer %','P(over), cold stopped','P(over), cold kept','Cash, cold stopped (₹L)','Cash, cold kept (₹L)','Cash cost of keeping cold (₹L)']);
  const rows=capacityTable.rows;
  lines.push('','**Approved capacity scenarios**');
  if(rows?.length){
   const cols=capacityTable.columns;
   const wanted=['Scenario','Capacity pw','Net effort mean pw','Net effort P90 pw','P(over), cold stopped','P(over), cold kept','Cash, cold stopped (₹L)','Cash, cold kept (₹L)','Cash cost of keeping cold (₹L)'];
   const selected=wanted.filter(k=>cols.includes(k));
   lines.push('| '+selected.join(' | ')+' |','| '+selected.map(()=> '---').join(' | ')+' |');
   for(const r of rows)lines.push('| '+selected.map(k=>{
    const v=r[k];
    if(/\(₹L\)/.test(k))return v==null?'—':`₹${Number(v).toFixed(2)}L`;
    if(/^P\(over\)/.test(k))return v==null?'—':`${(Number(v)*100).toFixed(1)}%`;
    return cell(v);
   }).join(' | ')+' |');
  }
  else lines.push('The approved staffing allocation dataset was unavailable or returned no rows; I cannot make a defensible numeric 5 person-week reallocation from capacity evidence.');
  const economicsTable=withColumnLabels(betEconomics,['Bet','Stretch Shapley (₹L)','Fixed pw','Variable / conditional pw','Pre-season pw','Attributable pw','Cash per pw (₹L)','Fixed share','Priority']);
  const econRows=economicsTable.rows;
  if(econRows?.length){
   const cols=economicsTable.columns;
   const wanted=['Bet','Stretch Shapley (₹L)','Attributable pw','Cash per pw (₹L)','Priority'];
   const selected=wanted.filter(k=>cols.includes(k));
   lines.push('','**Approved D-010 bet economics (modelled, not guaranteed)**','| '+selected.join(' | ')+' |','| '+selected.map(()=> '---').join(' | ')+' |');
   for(const r of econRows)lines.push('| '+selected.map(k=>cell(r[k])).join(' | ')+' |');
  }
  lines.push('','**Current selected-edition pipeline evidence**','| Channel | Proposals won ÷ proposals [M-13] | Open pipeline value [M-21] |','|---|---:|---:|');
  for(const channel of ['warm','inbound','cold']){
   const [win,pipeline]=await Promise.all([read('get_metric',{metric_id:'M-13',filters:{channel_group:channel}}),read('get_metric',{metric_id:'M-21',filters:{channel_group:channel}})]);
   const w=(win.rows as Record<string,unknown>[]|undefined)?.[0],p=(pipeline.rows as Record<string,unknown>[]|undefined)?.[0];
   const winText=w?.computable?`${cell(w.numerator)} ÷ ${cell(w.denominator)} (${(Number(w.value)*100).toFixed(1)}%)`:`Unavailable: ${cell(w?.reason)}`;
   const pipelineText=p?.computable&&p.value!=null?'₹'+Number(p.value).toLocaleString('en-IN'):`Unavailable: ${cell(p?.reason)}`;
   lines.push(`| ${channel} | ${winText} | ${pipelineText} |`);
  }
  const rankedBets=(econRows??[]).filter(r=>Number.isFinite(Number(r.Priority))).slice().sort((a,b)=>Number(a.Priority)-Number(b.Priority));
  const rankedNames=rankedBets.map(r=>`${cell(r.Bet)} (priority ${cell(r.Priority)})`);
  const prioritySummary=rankedNames.length?`Retrieved D-010 priority order: ${rankedNames.join(' → ')}.`:'No approved D-010 priority ranking was returned, so I will not invent one.';
  lines.push('','**Allocation recommendation:** '+prioritySummary+' Use the current M-13 and M-21 evidence to reconsider channel access before assigning effort: do not restore cold volume while it has no proposals or open pipeline and the approved scenarios show a cash/over-capacity penalty for keeping it. Keep B3 conditional effort behind its introduction gate, and keep B5 inside the approved pre-season/stretch capacity. These are conditional choices from the returned evidence, not guaranteed revenue.');
  lines.push('','The available records do not show which owners have five free person-weeks or the marginal cash timing from the next incremental week, so an exact five-week split would be invented. Compare the alternatives above and confirm live workload before committing the split. The approved Base/Plan/Stretch assumptions and values remain unchanged; modelled scenario cash is not guaranteed revenue.');
  if(knowledge.available!==false&&Array.isArray(knowledge.chunks)){
   const ids=(knowledge.chunks as Record<string,unknown>[]).map(c=>cell(c.chunk_id??c.id)).filter(Boolean);
   if(ids.length)lines.push('','Approved decision references: '+[...new Set(ids)].map(id=>`[${id}]`).join(', ')+'.');
  }
  return lines.join('\n');
 }
 const result=await read('get_register',{kind:'rule'});
 const rules=result.rules as Record<string,unknown>[]|undefined;
 if(!rules)throw new Error('Threshold rules were not returned.');
 const relevant=rules.filter(r=>r.decision_id==='D-010'&&r.bet_id);
 const betNames:Record<string,string>={B1:'Fix the funnel',B2:'Cash discipline',B3:'Gated VC/alumni introductions',B4:'Warm flywheel',B5:'Pre-season premium inventory'};
 const byBet=new Map<string,Record<string,unknown>[]>();
 for(const r of relevant){const raw=String(r.bet_id);const id=raw.startsWith('B4')?'B4':raw;byBet.set(id,[...(byBet.get(id)??[]),r]);}
 const lines=['D-010 approved thresholds evaluated against the current edition snapshot. Rule status is a decision aid, not a statistical test; a rule with no computable observation remains unevaluated.','', '| Approved bet | Rule / current evidence | Threshold status | Next measurement or response |','|---|---|---|---|'];
 for(const id of ['B1','B2','B3','B4','B5']){
  const rs=byBet.get(id)??[];
  if(!rs.length){lines.push(`| ${betNames[id]} (${id}) | No linked D-010 threshold rule returned | Cannot evaluate | Retrieve the approved rule and required metric |`);continue;}
  for(const r of rs){
   const band=String(r.band??'').toLowerCase();
   const rawStatus=String(r.status_label??'not evaluated').toLowerCase();
   const minN=requiredSampleFloor(r.sample_size);
   const observedN=Number(r.current_denominator);
   const belowSampleGate=minN!==null&&(!Number.isFinite(observedN)||observedN<minN);
   const unavailable=r.computable!==true||['not_due','unavailable','manual_review'].includes(band)||/not yet due|not computable|restricted|not defined|manual review|insufficient sample|not evaluat/i.test(rawStatus)||belowSampleGate;
   const status=unavailable?'not yet evaluable':band==='keep'||/^keep\b/.test(rawStatus)?'continue':(['change','stop','escalate'].includes(band)||/change|stop|escalat/i.test(rawStatus))?'intervene':'not yet evaluable';
   const current=r.current_value==null?'—':Number.isFinite(Number(r.current_value))
    ? String(r.current_unit??'').toLowerCase()==='ratio' ? `${(Number(r.current_value)*100).toFixed(1)}%` : String(r.current_value)
    : cell(r.current_value);
   const sample=Number.isFinite(Number(r.current_denominator))?` (sample ${cell(r.current_numerator??'—')}/${cell(r.current_denominator)})`:'';
   const next=unavailable?`${belowSampleGate?`Need sample n ≥ ${minN}; observed ${Number.isFinite(observedN)?observedN:'unknown'}. `:''}Collect ${cell(r.kpi_name??r.metric_id)} at ${cell(r.evaluate_at)}; ${cell(r.reason??rawStatus??'observation unavailable')}`:cell(r.response);
   lines.push(`| ${betNames[id]} (${id}) | ${cell(r.rule_id)}; ${current}${sample} [${cell(r.metric_id)}]; sample target ${cell(r.sample_size)}; keep if ${cell(r.keep_if)}, change if ${cell(r.change_if)}, escalate if ${cell(r.escalate_if)} | ${status} (${cell(r.status_label)}) | ${next} |`);
  }
 }
 lines.push('','Use **continue** only for a keep band, **intervene** for a change/escalation band, and **not yet evaluable** where the metric is missing, restricted, not due or below its minimum sample. D-010 is cited as the approved rule source.');
 return lines.join('\n');
}

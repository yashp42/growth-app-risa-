import type { ToolRunAccumulator } from './tools.ts';
import { requiredSampleFloor } from '../ruleBands.ts';

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
export async function answerStrategy(intent:StrategyIntent,read:Read,acc:ToolRunAccumulator):Promise<string>{
 if(intent==='capacity_allocation'){
  const [scenarios,capacity,betEconomics,knowledge]=await Promise.all([
   read('get_scenario',{}),read('get_dataset',{dataset_id:'strategy.resource_allocation.scenario_capacity',limit:50}),
   read('get_dataset',{dataset_id:'strategy.resource_allocation.bets',limit:20}),
   read('search_knowledge',{query:'D-010 approved Base Plan Stretch person-weeks capacity allocation opportunity cost cold outreach contingency'})
  ]);
  const lines=['I will keep the approved D-009/D-010 assumptions unchanged. Base, Plan and Stretch are distinct approved scenarios; scenario contribution is modelled, not guaranteed revenue.'];
  const ss=scenarios.scenarios as Record<string,unknown>[]|undefined;
  if(ss?.length){lines.push('','| Approved scenario | Modelled cash |','|---|---:|');for(const s of ss)lines.push(`| ${cell(s.name)} (${cell(s.scenario_id)}) | ${cell(s.expected_cash)} |`);}
  const rows=capacity.rows as Record<string,unknown>[]|undefined;
  lines.push('','**Approved capacity scenarios**');
  if(rows?.length){const cols=capacity.columns as string[];lines.push('| '+cols.map(cell).join(' | ')+' |','| '+cols.map(()=> '---').join(' | ')+' |');for(const r of rows)lines.push('| '+cols.map(k=>cell(r[k])).join(' | ')+' |');}
  else lines.push('The approved staffing allocation dataset was unavailable or returned no rows; I cannot make a defensible numeric 5 person-week reallocation from capacity evidence.');
  const econRows=betEconomics.rows as Record<string,unknown>[]|undefined;
  if(econRows?.length){const cols=betEconomics.columns as string[];lines.push('','**Approved D-010 bet economics (modelled, not guaranteed)**','| '+cols.map(cell).join(' | ')+' |','| '+cols.map(()=> '---').join(' | ')+' |');for(const r of econRows)lines.push('| '+cols.map(k=>cell(r[k])).join(' | ')+' |');}
  lines.push('','**Current selected-edition pipeline evidence**','| Channel | Proposals won ÷ proposals [M-13] | Open pipeline value [M-21] |','|---|---:|---:|');
  for(const channel of ['warm','inbound','cold']){
   const [win,pipeline]=await Promise.all([read('get_metric',{metric_id:'M-13',filters:{channel_group:channel}}),read('get_metric',{metric_id:'M-21',filters:{channel_group:channel}})]);
   const w=(win.rows as Record<string,unknown>[]|undefined)?.[0],p=(pipeline.rows as Record<string,unknown>[]|undefined)?.[0];
   const winText=w?.computable?`${cell(w.numerator)} ÷ ${cell(w.denominator)} (${(Number(w.value)*100).toFixed(1)}%)`:`Unavailable: ${cell(w?.reason)}`;
   const pipelineText=p?.computable&&p.value!=null?'₹'+Number(p.value).toLocaleString('en-IN'):`Unavailable: ${cell(p?.reason)}`;
   lines.push(`| ${channel} | ${winText} | ${pipelineText} |`);
  }
  lines.push('','**Allocation recommendation:** use D-010 priority as the allocation order: B1 (handoff SLA and stop cold) first, then B2 cash discipline, then gated B4 renewals/creators when current owner workload and its gates allow. The current M-13 and M-21 rows above are the live decision evidence; D-010’s cash-per-person-week values are modelled marginal estimates, not observed returns. Avoid adding cold volume unless the current channel evidence reverses; defer B3 beyond its gate because most effort is fixed before introductions are secured; keep B5 in its approved pre-season, stretch-only lane.');
  lines.push('','I cannot responsibly assign exact fractional shares of the 5 person-weeks from these sources: D-010 describes scenario-level effort and contribution, while current owner-level workload and marginal cash timing by the next incremental hour are not measured. Keep the approved Base/Plan/Stretch assumptions and values unchanged; treat this priority order as a separate, provisional allocation decision. Scenario cash is modelled, not guaranteed revenue.');
  if(knowledge.available!==false&&Array.isArray(knowledge.chunks))for(const c of knowledge.chunks as Record<string,unknown>[])lines.push('',`> [${cell(c.chunk_id??c.id)}] ${cell(c.text)}`);
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
   const current=r.current_value==null?'—':Number.isFinite(Number(r.current_value))?String(r.current_value):cell(r.current_value);
   const sample=Number.isFinite(Number(r.current_denominator))?` (sample ${cell(r.current_numerator??'—')}/${cell(r.current_denominator)})`:'';
   const next=unavailable?`${belowSampleGate?`Need sample n ≥ ${minN}; observed ${Number.isFinite(observedN)?observedN:'unknown'}. `:''}Collect ${cell(r.kpi_name??r.metric_id)} at ${cell(r.evaluate_at)}; ${cell(r.reason??rawStatus??'observation unavailable')}`:cell(r.response);
   lines.push(`| ${betNames[id]} (${id}) | ${cell(r.rule_id)}; ${current}${sample} [${cell(r.metric_id)}]; sample target ${cell(r.sample_size)}; keep if ${cell(r.keep_if)}, change if ${cell(r.change_if)}, escalate if ${cell(r.escalate_if)} | ${status} (${cell(r.status_label)}) | ${next} |`);
  }
 }
 lines.push('','Use **continue** only for a keep band, **intervene** for a change/escalation band, and **not yet evaluable** where the metric is missing, restricted, not due or below its minimum sample. D-010 is cited as the approved rule source.');
 return lines.join('\n');
}

import type { ToolRunAccumulator } from './tools.ts';
export type ProspectIntent = {kind:'prioritise'} | {kind:'status';company:string} | {kind:'routes';category:string};
export function prospectIntent(question:string,hasFilters=false):ProspectIntent|null {
 if(hasFilters)return null;
 const q=question.trim().replace(/[?!.]+$/,'');
 if(/^(?:which prospects should we pursue first|which prospects should we prioritise|which prospects should we prioritize)$/i.test(q))return {kind:'prioritise'};
 if (/^who should we prioriti[sz]e for outreach$/i.test(q))return {kind:'prioritise'};
 const alternate=q.match(/^what is ([\w .&()-]{1,80}) worth and is it in (?:our|the) pipeline$/i);
 if(alternate)return {kind:'status',company:alternate[1].trim()};
 const status=q.match(/^is ([\w .&()-]{1,80}) in (?:our|the) pipeline,? and what is it worth$/i);
 if(status)return {kind:'status',company:status[1].trim()};
 const routes=q.match(/^which ([\w -]{1,50}) prospects have (?:a )?verified routes?(?: to them)?$/i);
 if(routes)return {kind:'routes',category:routes[1].trim()};
 return null;
}
const cell=(v:unknown)=>String(v??'—').split('|').join(String.fromCharCode(92)+'|').replace(/[\r\n]/g,' ');
type Read=(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export async function answerProspects(intent:ProspectIntent,read:Read,acc:ToolRunAccumulator):Promise<string>{
 const filters=intent.kind==='prioritise'?{action:'Pursue now'}:intent.kind==='status'?{company:intent.company}:{category:intent.category,verified_route:true};
 const register=await read('get_register',{kind:'prospects',filters});
 const rows=register.rows as Record<string,unknown>[]|undefined;
 if(register.available!==true||!rows)throw new Error('The visible prospect research register is unavailable.');
 const lines=['Prospect research targets — separate from operational pipeline, signed commitments and cash forecasts. A verifiable route is not an introduction.'];
 if(intent.kind==='prioritise')lines.push('All source rows marked Pursue now are listed, ordered by the stored priority index. Cash and in-kind tracks remain separate. Research face values are not forecasts.');
 if(intent.kind==='status'){
  const opportunities=await read('list_records',{kind:'opportunities',filters:{search:intent.company},limit:25});
  const sponsors=await read('list_records',{kind:'sponsors',filters:{search:intent.company},limit:25});
  if(!Array.isArray(opportunities.rows)||!Array.isArray(sponsors.rows))throw new Error('Operational lookup returned no readable result.');
  lines.push(opportunities.rows.length||sponsors.rows.length?'Matching operational records were returned; inspect their stages and scope below.':'No matching opportunities or sponsors were returned for the selected edition. This does not establish a signed value or cash forecast.');
 }
 if(!rows.length)lines.push('No matching research prospects were returned.');
 else {
  const columns=register.columns as string[];
  lines.push('', '| '+columns.map(cell).join(' | ')+' |','| '+columns.map(()=>'---').join(' | ')+' |');
  for(const row of rows)lines.push('| '+columns.map(k=>cell(row[k])).join(' | ')+' |');
 }
 lines.push('', '[market_research.prospect_register]');
 await read('search_knowledge',{query:intent.kind==='routes'?'prospect verified route introductions attractiveness accessibility':intent.kind==='status'?intent.company+' prospect research target face value forecast introductions':'prospect prioritisation pursue now attractiveness accessibility cash in kind introductions'});
 if(intent.kind==='prioritise')await read('search_knowledge',{query:'prospect research target status face value not pipeline forecast introductions'});
 const seen=new Set<string>();
 const notes=acc.citations.filter(c=>c.type==='knowledge'&&!c.history&&!seen.has(c.id)&&Boolean(seen.add(c.id)));
 if(notes.some(n=>/none has (?:a )?(?:confirmed )?introduction|no (?:confirmed |actual |committed )?introductions?|0 committed introductions/i.test(String(n.text??''))))lines.push('In the cited research snapshot, no confirmed introductions were recorded.');
 if(notes.length){lines.push('','Source notes:');for(const note of notes)lines.push('> ['+cell(note.id)+'] '+cell(note.text));}
 else lines.push('Supporting strategy notes were not retrieved; introduction status and forecast assumptions require source review.');
 return lines.join('\n');
}

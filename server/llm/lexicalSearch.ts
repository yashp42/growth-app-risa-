/** Deterministic lexical candidate; no model, embeddings, expected citations or test IDs. */
const stop=new Set('a an the is are was were be been being do does did can could would should will we our us you your i it its in on at to for of from by as and or not with this that which what how why when where many much have has had already actually yet still first most per than into if then them they these those'.split(' '));
const groups=[['capacity','staff','staffing','people','team','person','person-weeks','execute','execution'],['forecast','expected','scenario','scenarios','projection','projected'],['receipt','receipts','collection','collected','collect','paid','payment','payments'],['price','prices','pricing','cost','costs','realised','asking'],['prospect','prospects','target','targets','pursue','prioritise','prioritize'],['introduction','introductions','intro','route','routes'],['conversion','convert','win','won','closing','close'],['funnel','bottleneck','bottlenecks','losing','leak','leaks'],['renewal','renewals','renewed'],['cold','linkedin','outreach'],['premium','inventory','title','presenting','activation','activations'],['assumption','assumptions','evidence','benchmark','benchmarks'],['history','historical','year','previous'],['acquisition','acquiring','spend','spent','spending','cac'],['qualification','qualified','qualify','lead','leads'],['handoff','handover','sla','follow-up','followup'],['causal','cause','causes','causality','reason','reasons'],['withdrawal','withdrawals','withdrawn','cancelled','cancellation'],['signed','commitment','commitments','contract','contracts'],['collection','collections','collected','reconciled','allocated','receipts']];
const stem=(t:string)=>t.endsWith('ies')&&t.length>5?t.slice(0,-3)+'y':t.endsWith('s')&&!t.endsWith('ss')&&t.length>4?t.slice(0,-1):t;
export function terms(text:string):string[]{return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9-]*/g)??[]).filter(t=>t.length>2&&!stop.has(t)).map(stem))];}
export function expandedTerms(query:string):string[]{return [...new Set(terms(query).flatMap(t=>groups.find(g=>g.map(stem).includes(t))?.map(stem)??[t]))].slice(0,48);}
export function lexicalRank(query:string,rows:Record<string,unknown>[]):Record<string,unknown>[] {
 const original=terms(query);const tokens=rows.map(r=>({title:new Set(terms(String(r.document_title??'')+' '+String(r.section??''))),body:new Set(terms(String(r.text??'')))}));
 const score=(i:number)=>original.reduce((sum,term)=>{
  const aliases=groups.find(g=>g.map(stem).includes(term))?.map(stem)??[term];
  const matches=(j:number)=>aliases.some(a=>tokens[j].title.has(a)||tokens[j].body.has(a));
  const frequency=tokens.filter((_,j)=>matches(j)).length;
  const weight=Math.log(1+rows.length/(1+frequency));
  const exact=tokens[i].title.has(term)?3:tokens[i].body.has(term)?1.5:0;
  const expanded=aliases.some(a=>tokens[i].title.has(a))?1.2:aliases.some(a=>tokens[i].body.has(a))?0.6:0;
  return sum+weight*Math.max(exact,expanded);
 },0);
 return rows.map((row,i)=>({row,score:score(i)})).sort((a,b)=>b.score-a.score||Number(b.row.base_rank??0)-Number(a.row.base_rank??0)||String(a.row.chunk_id).localeCompare(String(b.row.chunk_id))).map(x=>x.row);
}

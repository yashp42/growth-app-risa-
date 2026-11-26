/** Deterministic lexical candidate; no model, embeddings, expected citations or test IDs. */
const stop=new Set('a an the is are was were be been being do does did can could would should will we our us you your i it its in on at to for of from by as and or not with this that which what how why when where many much have has had already actually yet still first most per than into if then them they these those'.split(' '));
const groups=[['capacity','staff','staffing','people','team','person','person-weeks','execute','execution'],['forecast','expected','scenario','scenarios','projection','projected'],['receipt','receipts','collection','collected','collect','paid','payment','payments'],['price','prices','pricing','cost','costs','realised','asking'],['prospect','prospects','target','targets','pursue','prioritise','prioritize'],['introduction','introductions','intro','route','routes'],['conversion','convert','win','won','closing','close'],['funnel','bottleneck','bottlenecks','losing','leak','leaks'],['renewal','renewals','renewed'],['cold','linkedin','outreach'],['premium','inventory','title','presenting','activation','activations'],['assumption','assumptions','evidence','benchmark','benchmarks'],['history','historical','year','previous'],['acquisition','acquiring','spend','spent','spending','cac'],['qualification','qualified','qualify','lead','leads'],['handoff','handover','sla','follow-up','followup'],['causal','cause','causes','causality','reason','reasons'],['withdrawal','withdrawals','withdrawn','cancelled','cancellation'],['signed','commitment','commitments','contract','contracts'],['collection','collections','collected','reconciled','allocated','receipts']];
const stem=(t:string)=>t.endsWith('ies')&&t.length>5?t.slice(0,-3)+'y':t.endsWith('s')&&!t.endsWith('ss')&&t.length>4?t.slice(0,-1):t;
export function terms(text:string):string[]{return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9-]*/g)??[]).filter(t=>t.length>2&&!stop.has(t)).map(stem))];}
export function expandedCandidateTerms(query:string):string[]{return [...new Set(terms(query).flatMap(t=>groups.find(g=>g.map(stem).includes(t))?.map(stem)??[t]))].slice(0,48);}
/** Length-normalised BM25-style scoring over title, section and chunk text. No test IDs/citations. */
export function morphologicalRank(query:string,rows:Record<string,unknown>[]):Record<string,unknown>[] {
 const queryTerms=terms(query),expanded=expandedCandidateTerms(query);
 const docs=rows.map(r=>({title:terms(String(r.document_title??'')),section:terms(String(r.section??'')),body:terms(String(r.text??'')),all:terms(String(r.document_title??'')+' '+String(r.section??'')+' '+String(r.text??''))}));
 const avg=docs.reduce((n,d)=>n+d.all.length,0)/Math.max(1,docs.length);
 const scores=docs.map(d=>expanded.reduce((sum,t)=>{const df=docs.filter(x=>x.all.includes(t)).length;const idf=Math.log(1+(docs.length-df+.5)/(df+.5));const tf=(d.title.includes(t)?3:0)+(d.section.includes(t)?2:0)+(d.body.includes(t)?1:0);const norm=tf*2.2/(tf+1.2*(.25+.75*d.all.length/Math.max(1,avg)));return sum+idf*norm*(queryTerms.includes(t)?1:.4);},0));
 const bodySets=docs.map(d=>new Set(d.body));
 const remaining=rows.map((row,i)=>({row,i,score:scores[i],adjusted:scores[i]}));const selected:typeof remaining=[];
 while(remaining.length&&selected.length<6){
  for(const x of remaining){const overlap=Math.max(0,...selected.map(y=>{const shared=docs[x.i].body.filter(t=>bodySets[y.i].has(t)).length;return shared/Math.max(1,Math.min(docs[x.i].body.length,docs[y.i].body.length));}));x.adjusted=x.score*(1-.15*overlap);}
  remaining.sort((a,b)=>b.adjusted-a.adjusted||String(a.row.chunk_id).localeCompare(String(b.row.chunk_id)));selected.push(remaining.shift()!);
 }
 return [...selected,...remaining.sort((a,b)=>b.score-a.score)].map(x=>x.row);
}

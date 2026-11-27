import assert from 'node:assert/strict';
import test from 'node:test';
import { detectOriginalRisaPreset, parseCsv, serialiseCsv, suggestMapping, mappedRows, resolveImportReferences, tabularRowsToData } from '../src/lib/csvImport.ts';
import { deterministicGeneralAdvice, isGeneralAdvice } from '../server/llm/advice.ts';
import { uploadedDatasetTool, readUploads } from '../server/uploadedDatasets.ts';
import { answerTextForSpeech } from '../src/lib/speech.ts';

test('[MOCKED] voice reads the answer and rationale without hidden source-note appendices',()=>{
 const answer='Prioritise warm leads. They have a verified contact route.\n\nSource notes:\n> [KB-MOCK] A long retrieved source that is not part of the answer.';
 assert.equal(answerTextForSpeech(answer),'Prioritise warm leads. They have a verified contact route.');
});

test('[MOCKED] CSV parses BOM, CRLF, quoted commas, escaped quotes and multiline cells',()=>{
 const d=parseCsv('\uFEFFBrand,Notes,Amount\r\n"Acme, Ltd","Say ""hello""\nnext",1200\r\n');
 assert.deepEqual(d.columns,['Brand','Notes','Amount']);assert.equal(d.rows[0].Brand,'Acme, Ltd');assert.equal(d.rows[0].Notes,'Say "hello"\nnext');
});
test('[MOCKED] an Excel worksheet uses the same column and size validation as CSV',()=>{
 const data=tabularRowsToData([['Brand Name','Industry','Notes'],['Acme','Education','Priority, follow up'],['Beta','Food and beverage','']], 'Brands');
 assert.deepEqual(data.rows[0],{ 'Brand Name':'Acme', Industry:'Education', Notes:'Priority, follow up' });
 assert.deepEqual(parseCsv(serialiseCsv(data)),data);
 assert.throws(()=>tabularRowsToData([['Name'],['A'],['B'],['C']].concat(Array.from({length:499},()=>['x'])),'Brands'),/500/);
});
for(const [name,input] of Object.entries({empty:'',headers:'a,b',duplicate:'A,a\n1,2',short:'a,b\n1',long:'a\n1,2',quote:'a\n"bad',quoteTail:'a\n"ok"bad',prototype:'__proto__\nx',blankHeader:'a,\nx,y'}))test('[MOCKED] invalid CSV fails before writes: '+name,()=>assert.throws(()=>parseCsv(input)));
test('[MOCKED] CSV resource bounds and literal spreadsheet formulas',()=>{
 assert.throws(()=>parseCsv('a\n'+Array(502).fill('x').join('\n')),/500/);
 assert.throws(()=>parseCsv('a\n'+'x'.repeat(4001)),/4,000/);
 assert.throws(()=>parseCsv('a\n'+'x'.repeat(512001)),/500 KB/);
 assert.equal(parseCsv('a\n=HYPERLINK(""evil"")'.replace('(""evil"")','(evil)')).rows[0].a,'=HYPERLINK(evil)');
});
test('[MOCKED] unfamiliar columns map only to explicit supported fields',()=>{
 const d=parseCsv('Brand Name,City,Custom Score\nAcme,Pune,7');
 const map=suggestMapping(d.columns,'sponsors');assert.equal(map.display_name,'Brand Name');
 assert.deepEqual(mappedRows(d,'sponsors',map),[{display_name:'Acme',city:'Pune'}]);
 assert.deepEqual(mappedRows(d,'dataset',{}),d.rows);
 assert.throws(()=>mappedRows(d,'campaigns',{}),/required/);
});
test('[MOCKED] original RISA headers are recognised without treating payments as cash',()=>{
 assert.equal(detectOriginalRisaPreset(['Brand','Opportunity Value INR','Stage','Amount Paid','Payment Date']),true);
 const mapping=suggestMapping(['Brand','Opportunity Value INR','Stage','Amount Paid'],'opportunities');
 assert.equal(mapping.proposed_value,'Opportunity Value INR');assert.equal(mapping.sponsor_id,'Brand');
 assert.equal(Object.values(mapping).includes('Amount Paid'),false);
});
test('[MOCKED] CSV reference names resolve exactly; unknown and ambiguous identities block writes',()=>{
 const rows=[{name:'Outreach',channel_id:'Warm referrals',owner_member_id:'Riya'}];
 const catalogues={channel_id:[{channel_id:'CH-MOCK',name:'Warm referrals'}],owner_member_id:[{member_id:'TM-MOCK',full_name:'Riya'}]};
 assert.deepEqual(resolveImportReferences(rows,catalogues),[{name:'Outreach',channel_id:'CH-MOCK',owner_member_id:'TM-MOCK'}]);
 assert.throws(()=>resolveImportReferences(rows,{...catalogues,owner_member_id:[]}),/not found/);
 assert.throws(()=>resolveImportReferences(rows,{...catalogues,owner_member_id:[{member_id:'A',full_name:'Riya'},{member_id:'B',full_name:'Riya'}]}),/ambiguous/);
});
test('[MOCKED] imports reject duplicate rows, duplicate mapping and invalid values',()=>{
 const d=parseCsv('Name,Channel\nAlpha,CH-A\nAlpha,CH-A');assert.throws(()=>mappedRows(d,'campaigns',{name:'Name',channel_id:'Channel'}),/duplicate record/);
 assert.throws(()=>mappedRows(d,'campaigns',{name:'Name',channel_id:'Name'}),/only once/);
 const p=parseCsv('Sponsor ID,Support Type,Amount\nSP-A,cash,-1');assert.throws(()=>mappedRows(p,'opportunities',suggestMapping(p.columns,'opportunities')),/nonnegative/);
});
for(const q of ['How do I approach a new sponsor?','How to write a sponsorship proposal?','Explain cash collection','How should we improve outreach?'])test('[MOCKED] general advice needs no business retrieval: '+q,()=>assert.equal(isGeneralAdvice(q),true));
test('[MOCKED] generic guidance remains useful when no provider is configured',()=>{
 assert.match(deterministicGeneralAdvice('How do I import a CSV?'),/Import data/);
 assert.match(deterministicGeneralAdvice('How do I collect a payment?'),/Collections/);
 assert.match(deterministicGeneralAdvice('How should we improve outreach?'),/outcome/i);
});
for(const q of ['How are our campaigns performing?','How should we fix these campaigns?','How can I improve our current win rate?','How much did we collect today?','Create a task','How do I analyse my uploaded dataset?'])test('[MOCKED] operational question never bypasses evidence: '+q,()=>assert.equal(isGeneralAdvice(q),false));
const scope={actorMemberId:'MOCK-A',editionId:'MOCK-ED',recordClass:'simulated',dataVersion:9};
test('[MOCKED] uploaded dataset reads bind actor and edition and compute summaries over all matches before limiting',async()=>{
 let bound:unknown[]=[];
 const pool={query:async<T>(_sql:string,params?:unknown[])=>{bound=params??[];return {rows:[{entity_id:'UPLOAD-MOCK',created_at:'2026-11-01',after:{name:'Custom',columns:['Sponsor','Amount'],row_count:3,rows:[{Sponsor:'A',Amount:'₹1,000'},{Sponsor:'A',Amount:'2000'},{Sponsor:'B',Amount:'900'}]}}] as T[]};}};
 const r=await uploadedDatasetTool(pool,scope,{dataset_id:'UPLOAD-MOCK',filter:{Sponsor:'a'},limit:1});
 assert.deepEqual(bound,['MOCK-A','simulated','MOCK-ED','UPLOAD-MOCK','']);assert.equal(r.matched_count,2);assert.equal(r.truncated,true);assert.deepEqual((r.numeric_summary as any).Amount,{count:2,sum:3000,average:1500,min:1000,max:2000});
 await assert.rejects(()=>uploadedDatasetTool(pool,scope,{dataset_id:'UPLOAD-MOCK',filter:{unknown:'x'}}),/Unknown/);
});
test('[MOCKED] absent dataset is explicitly unavailable, never an empty operational pipeline',async()=>{
 const pool={query:async<T>()=>({rows:[] as T[]})};
 assert.equal((await uploadedDatasetTool(pool,scope,{dataset_id:'missing'})).available,false);
 assert.deepEqual(await readUploads(pool,scope),[]);
});
test('[MOCKED] a revised same-name upload replaces the prior snapshot in normal discovery',async()=>{
 let sql='';
 const pool={query:async<T>(query:string)=>{sql=query;return {rows:[] as T[]};}};
 await readUploads(pool,scope);
 assert.match(sql,/DISTINCT ON \(CASE WHEN \$4::text IS NULL THEN lower\(trim\(COALESCE\("after"->>'name',''\)\)\)/);
});
test('[MOCKED] uploaded ranking finds a maximum outside the preview and pagination discloses remaining rows',async()=>{
 const rows=Array.from({length:40},(_,i)=>({Sponsor:'Synthetic '+i,Amount:String(i*100)}));
 const pool={query:async<T>()=>({rows:[{entity_id:'UPLOAD-MOCK',created_at:'2026-11-01',after:{name:'Ranked',columns:['Sponsor','Amount'],row_count:40,rows}}] as T[]})};
 const ranked=await uploadedDatasetTool(pool,scope,{dataset_id:'UPLOAD-MOCK',sort_by:'Amount',descending:true,limit:1});
 assert.deepEqual(ranked.rows,[{Sponsor:'Synthetic 39',Amount:'3900'}]);assert.equal(ranked.matched_count,40);assert.equal(ranked.next_offset,1);
 const next=await uploadedDatasetTool(pool,scope,{dataset_id:'UPLOAD-MOCK',sort_by:'Amount',descending:true,offset:1,limit:1});
 assert.deepEqual(next.rows,[{Sponsor:'Synthetic 38',Amount:'3800'}]);
 await assert.rejects(()=>uploadedDatasetTool(pool,scope,{dataset_id:'UPLOAD-MOCK',sort_by:'missing'}),/Unknown/);
});
test('[MOCKED] uploaded-dataset aggregates cover every matched row, not the preview page',async()=>{
 const rows=Array.from({length:40},(_,i)=>({Sponsor:i%2?'A':'B',Amount:String(i*100)}));
 const pool={query:async<T>()=>({rows:[{entity_id:'UPLOAD-MOCK',created_at:'2026-11-01',after:{name:'Grouped',columns:['Sponsor','Amount'],row_count:40,rows}}] as T[]})};
 const result=await uploadedDatasetTool(pool,scope,{dataset_id:'UPLOAD-MOCK',group_by:['Sponsor'],aggregates:[{operation:'sum',field:'Amount'},{operation:'count'}],limit:1});
 assert.equal(result.row_coverage,'40/40');
 assert.deepEqual(result.aggregate_rows,[{Sponsor:'B',row_count:20,sum_Amount:38000,sum_Amount_coverage:'20/20',count:20},{Sponsor:'A',row_count:20,sum_Amount:40000,sum_Amount_coverage:'20/20',count:20}]);
});

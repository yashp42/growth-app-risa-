export interface CsvData { columns: string[]; rows: Record<string,string>[] }
export type ImportDestination = 'dataset'|'sponsors'|'campaigns'|'tasks'|'opportunities';
export const IMPORT_FIELDS: Record<Exclude<ImportDestination,'dataset'>, string[]> = {
 sponsors:['display_name','legal_name','category_id','city','website','first_source'],
 campaigns:['name','channel_id','owner_member_id','status','planned_start','planned_end','objective'],
 tasks:['title','task_type','owner_member_id','due_at','status','linked_type','linked_id'],
 opportunities:['sponsor_id','name','support_type','proposed_value','owner_member_id','originating_campaign_id'],
};
const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string[]>={display_name:['brand','brandname','company','companyname','sponsor','sponsorname'],name:['campaign','campaignname','opportunity','opportunityname'],proposed_value:['dealvalue','dealvalueinr','amount','value','proposedvalueinr'],channel_id:['channel','channelid'],owner_member_id:['owner','memberid','ownermemberid'],due_at:['duedate','deadline'],title:['task','taskname'],support_type:['supporttype'],sponsor_id:['sponsorid','brandid'],originating_campaign_id:['campaignid']};
export function suggestMapping(columns:string[],destination:ImportDestination):Record<string,string>{
 if(destination==='dataset')return {};
 return Object.fromEntries(IMPORT_FIELDS[destination].map(field=>[field,columns.find(c=>normal(c)===normal(field)||aliases[field]?.includes(normal(c)))??'']));
}
/** RFC-style CSV, bounded before allocation. Cells remain plain text; no formulas execute. */
export function parseCsv(input:string):CsvData {
 if(new TextEncoder().encode(input).length>512_000)throw Error('CSV must be smaller than 500 KB.');
 const text=input.replace(/^\uFEFF/,''); const records:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const push=()=>{row.push(cell);cell='';closed=false;if(row.length>60)throw Error('Maximum 60 columns.');};
 const end=()=>{push();if(row.some(v=>v.trim()))records.push(row);row=[];if(records.length>501)throw Error('Maximum 500 data rows per import.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
  else if(c==='"'){if(cell||closed)throw Error('Unexpected quote in CSV.');quoted=true;}
  else if(c===',')push();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;end();}
  else{if(closed&&!/\s/.test(c))throw Error('Unexpected text after a quoted cell.');if(!closed)cell+=c;}
  if(cell.length>4000)throw Error('A cell exceeds 4,000 characters.');
 }
 if(quoted)throw Error('Unclosed quoted cell.');if(cell||row.length||closed)end();
 if(records.length<2)throw Error('CSV needs a header and at least one data row.');
 const columns=records.shift()!.map(c=>c.trim());
 if(columns.some(c=>!c||c.length>100||['__proto__','constructor','prototype'].includes(c)))throw Error('Invalid column header.');
 if(new Set(columns.map(normal)).size!==columns.length)throw Error('Duplicate column headers.');
 const rows=records.map((r,i)=>{if(r.length!==columns.length)throw Error(`Row ${i+2} has ${r.length} cells; expected ${columns.length}.`);return Object.fromEntries(columns.map((c,j)=>[c,r[j].trim()]));});
 return {columns,rows};
}
export function mappedRows(data:CsvData,destination:ImportDestination,mapping:Record<string,string>):Record<string,string>[] {
 if(destination==='dataset')return data.rows;
 const allowed=IMPORT_FIELDS[destination];
 const selected=allowed.filter(k=>mapping[k]);
 if(new Set(selected.map(k=>mapping[k])).size!==selected.length)throw Error('Map each CSV column only once.');
 const required=destination==='sponsors'?['display_name']:destination==='campaigns'?['name','channel_id']:destination==='tasks'?['title','task_type','due_at']:['sponsor_id','support_type'];
 for(const key of required)if(!mapping[key])throw Error(`Map the required field: ${key}.`);
 const seen=new Set<string>();
 return data.rows.map((row,i)=>{
  const out=Object.fromEntries(selected.map(k=>[k,row[mapping[k]]??'']));
  for(const key of required)if(!out[key])throw Error(`Row ${i+2}: ${key} is required.`);
  if(out.proposed_value){const n=Number(out.proposed_value.replace(/[₹, ]/g,''));if(!Number.isFinite(n)||n<0)throw Error(`Row ${i+2}: proposed value must be a nonnegative INR number.`);out.proposed_value=String(n);}
  if(out.planned_start&&out.planned_end&&out.planned_end<out.planned_start)throw Error(`Row ${i+2}: end is before start.`);
  const key=normal(out.display_name??out.name??out.title??JSON.stringify(out));if(seen.has(key))throw Error(`Row ${i+2}: duplicate record in this CSV.`);seen.add(key);
  return out;
 });
}

export interface CsvData { columns: string[]; rows: Record<string,string>[] }
export type ImportDestination = 'dataset'|'sponsors'|'campaigns'|'tasks'|'opportunities';
export const IMPORT_FIELDS: Record<Exclude<ImportDestination,'dataset'>, string[]> = {
 sponsors:['display_name','legal_name','category_id','city','website','first_source'],
 campaigns:['name','channel_id','owner_member_id','status','planned_start','planned_end','objective'],
 tasks:['title','task_type','owner_member_id','due_at','status','linked_type','linked_id'],
 opportunities:['sponsor_id','name','support_type','proposed_value','owner_member_id','originating_campaign_id'],
};
const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string[]>={display_name:['brand','brandname','company','companyname','sponsor','sponsorname'],name:['campaign','campaignname','opportunity','opportunityname'],proposed_value:['dealvalue','dealvalueinr','amount','value','proposedvalueinr'],channel_id:['channel','channelid'],category_id:['category','industry','sector'],owner_member_id:['owner','memberid','ownermemberid'],due_at:['duedate','deadline'],title:['task','taskname'],support_type:['supporttype'],sponsor_id:['sponsorid','brandid','sponsor','brand','company','sponsorname','brandname'],originating_campaign_id:['campaignid','campaign','campaignname']};
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
 return tabularRowsToData(records,'CSV');
}
/** Validate rows originating from an XLSX worksheet with the same safeguards as CSV. */
export function tabularRowsToData(records:unknown[][],source='worksheet'):CsvData {
 if(records.length<2)throw Error(`${source} needs a header and at least one data row.`);
 if(records.length>501)throw Error('Maximum 500 data rows per import.');
 const columns=(records[0]??[]).map(c=>String(c??'').trim());
 if(columns.length>60)throw Error('Maximum 60 columns.');
 if(columns.some(c=>!c||c.length>100||['__proto__','constructor','prototype'].includes(c)))throw Error('Invalid column header.');
 if(new Set(columns.map(normal)).size!==columns.length)throw Error('Duplicate column headers.');
 const rows=records.slice(1).map((r,i)=>{if(r.length!==columns.length)throw Error(`Row ${i+2} has ${r.length} cells; expected ${columns.length}.`);return Object.fromEntries(columns.map((c,j)=>{const value=String(r[j]??'').trim();if(value.length>4000)throw Error('A cell exceeds 4,000 characters.');return [c,value];}));});
 return {columns,rows};
}
/** Canonical CSV sent to the server for both CSV and XLSX imports. */
export function serialiseCsv(data:CsvData):string {
 const quote=(value:string)=>/[,"\r\n]/.test(value)?`"${value.replace(/"/g,'""')}"`:value;
 return [data.columns,...data.rows.map(row=>data.columns.map(column=>quote(row[column]??'')).join(','))].join('\n');
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

export const IMPORT_REFERENCES:Record<string,{endpoint:string;list:string;id:string;name:string}>={
 channel_id:{endpoint:'reference/channels',list:'channels',id:'channel_id',name:'name'},
 category_id:{endpoint:'reference/categories',list:'categories',id:'category_id',name:'name'},
 owner_member_id:{endpoint:'team',list:'members',id:'member_id',name:'full_name'},
 sponsor_id:{endpoint:'sponsors',list:'sponsors',id:'sponsor_id',name:'display_name'},
 originating_campaign_id:{endpoint:'campaigns',list:'campaigns',id:'campaign_id',name:'name'},
};
/** Exact canonical IDs or unambiguous display names only. Never fuzzy-merge business identities. */
export function resolveImportReferences(rows:Record<string,string>[],catalogues:Record<string,Record<string,unknown>[]>):Record<string,string>[] {
 return rows.map((row,i)=>{
  const next={...row};
  for(const [field,meta] of Object.entries(IMPORT_REFERENCES)){
   const value=row[field]?.trim();if(!value)continue;
   const list=catalogues[field]??[],direct=list.find(r=>r[meta.id]===value);
   const matches=direct?[direct]:list.filter(r=>String(r[meta.name]??'').trim().toLowerCase()===value.toLowerCase());
   if(matches.length!==1)throw Error(`Row ${i+2}: ${field} “${value}” ${matches.length?'is ambiguous; use a canonical ID':'was not found in the current workspace'}.`);
   next[field]=String(matches[0][meta.id]);
  }
  return next;
 });
}

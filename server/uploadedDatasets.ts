import type { QueryablePool } from './llm/tools.ts';
export interface UploadScope { actorMemberId:string; editionId:string; recordClass:string; dataVersion?:number|string }
export async function readUploads(pool:QueryablePool,scope:UploadScope,id?:string,query='') {
 const result=await pool.query<{entity_id:string;after:Record<string,unknown>;created_at:string}>(
  `SELECT * FROM (SELECT DISTINCT ON (entity_id) entity_id, "after", created_at FROM public.audit_event
   WHERE entity='uploaded_dataset' AND actor_id=$1 AND record_class=$2 AND NOT is_deleted
   AND "after"->>'edition_id'=$3 AND ($4::text IS NULL OR entity_id=$4)
   ORDER BY entity_id, created_at DESC) latest ORDER BY created_at DESC LIMIT 25`,[scope.actorMemberId,scope.recordClass,scope.editionId,id??null]);
 return result.rows.filter(r=>!query||String(r.after.name??'').toLowerCase().includes(query.toLowerCase()));
}
export async function uploadedDatasetTool(pool:QueryablePool,scope:UploadScope,args:{dataset_id?:string;query?:string;filter?:Record<string,string>;limit?:number}) : Promise<Record<string,unknown>> {
 const files=await readUploads(pool,scope,args.dataset_id,args.query);
 const base={source:'uploaded_dataset',record_class:scope.recordClass,edition_id:scope.editionId,data_version:scope.dataVersion,status_label:'User-uploaded data; separate from operational records',as_of:null};
 if(!args.dataset_id)return {...base,kind:'uploaded_datasets',rows:files.map(f=>({dataset_id:f.entity_id,name:f.after.name,row_count:f.after.row_count,columns:f.after.columns})),available:true};
 const file=files[0];if(!file)return {...base,available:false,reason:'No uploaded dataset is available to this user in this edition.'};
 const columns=file.after.columns as string[];let rows=file.after.rows as Record<string,string>[];
 const filters=Object.entries(args.filter??{});for(const [key] of filters)if(!columns.includes(key))throw Error('Unknown dataset filter column.');
 rows=rows.filter(r=>filters.every(([k,v])=>String(r[k]).toLowerCase()===String(v).toLowerCase()));
 const numeric:Record<string,unknown>={};
 for(const key of columns){const values=rows.map(r=>r[key]).filter(v=>v!==''&&v!=null);if(values.length&&values.every(v=>/^[₹]?\s*-?[\d,]+(?:\.\d+)?$/.test(v))){const ns=values.map(v=>Number(v.replace(/[₹,\s]/g,'')));if(ns.every(Number.isFinite))numeric[key]={count:ns.length,sum:ns.reduce((a,b)=>a+b,0),min:Math.min(...ns),max:Math.max(...ns)};}}
 const limit=Math.min(25,Math.max(1,args.limit??10));
 return {...base,available:true,dataset_id:file.entity_id,title:file.after.name,columns,rows:rows.slice(0,limit),matched_count:rows.length,total_rows:file.after.row_count,truncated:rows.length>limit,numeric_summary:numeric,warning:'Column sums are raw uploaded values, not canonical cash or signed metrics. No operational records were changed by saving this dataset.'};
}

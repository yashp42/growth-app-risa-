import type { QueryablePool } from './llm/tools.ts';
export interface UploadScope { actorMemberId:string; editionId:string; recordClass:string; dataVersion?:number|string }
export async function readUploads(pool:QueryablePool,scope:UploadScope,id?:string,query='') {
 const result=await pool.query<{entity_id:string;after:Record<string,unknown>;created_at:string}>(
  `SELECT entity_id, CASE WHEN $4::text IS NULL THEN "after" - 'rows' ELSE "after" END AS "after", created_at FROM (SELECT DISTINCT ON (CASE WHEN $4::text IS NULL THEN lower(trim(COALESCE("after"->>'name',''))) ELSE entity_id END) entity_id, "after", created_at FROM public.audit_event
   WHERE entity='uploaded_dataset' AND actor_id=$1 AND record_class=$2 AND NOT is_deleted
   AND "after"->>'edition_id'=$3 AND ($4::text IS NULL OR entity_id=$4)
   AND ($5::text='' OR strpos(lower(COALESCE("after"->>'name','')),lower($5))>0)
   ORDER BY CASE WHEN $4::text IS NULL THEN lower(trim(COALESCE("after"->>'name',''))) ELSE entity_id END, created_at DESC) latest ORDER BY created_at DESC LIMIT 25`,[scope.actorMemberId,scope.recordClass,scope.editionId,id??null,query]);
 return result.rows;
}
export async function uploadedDatasetTool(pool:QueryablePool,scope:UploadScope,args:{dataset_id?:string;query?:string;filter?:Record<string,string>;limit?:number;sort_by?:string;descending?:boolean;offset?:number}) : Promise<Record<string,unknown>> {
 const files=await readUploads(pool,scope,args.dataset_id,args.query);
 const base={source:'uploaded_dataset',record_class:scope.recordClass,edition_id:scope.editionId,data_version:scope.dataVersion,status_label:'User-uploaded data; separate from operational records',as_of:null};
 if(!args.dataset_id)return {...base,kind:'uploaded_datasets',truncated:files.length===25,rows:files.map(f=>({dataset_id:f.entity_id,name:f.after.name,row_count:f.after.row_count,columns:f.after.columns})),available:true};
 const file=files[0];if(!file)return {...base,available:false,reason:'No uploaded dataset is available to this user in this edition.'};
 const columns=file.after.columns as string[];let rows=file.after.rows as Record<string,string>[];
 const filters=Object.entries(args.filter??{});for(const [key] of filters)if(!columns.includes(key))throw Error('Unknown dataset filter column.');
 rows=rows.filter(r=>filters.every(([k,v])=>String(r[k]).toLowerCase()===String(v).toLowerCase()));
 const numeric:Record<string,unknown>={};
 for(const key of columns){const values=rows.map(r=>r[key]).filter(v=>v!==''&&v!=null);if(values.length&&values.every(v=>/^[₹]?\s*-?[\d,]+(?:\.\d+)?$/.test(v))){const ns=values.map(v=>Number(v.replace(/[₹,\s]/g,'')));if(ns.every(Number.isFinite))numeric[key]={count:ns.length,sum:ns.reduce((a,b)=>a+b,0),min:Math.min(...ns),max:Math.max(...ns)};}}
 if(args.sort_by){
  if(!columns.includes(args.sort_by))throw Error('Unknown dataset sort column.');
  const key=args.sort_by,sign=args.descending?-1:1;
  const number=(s:string)=>/^[₹]?\s*-?[\d,]+(?:\.\d+)?$/.test(s)?Number(s.replace(/[₹,\s]/g,'')):NaN;
  rows=[...rows].sort((a,b)=>{
   const av=a[key]??'',bv=b[key]??'';
   if(!av||!bv)return av? -1:bv?1:0;
   const an=number(av),bn=number(bv);
   if(Number.isFinite(an)!==Number.isFinite(bn))return Number.isFinite(an)?-1:1;
   return sign*(Number.isFinite(an)&&Number.isFinite(bn)?an-bn:av.localeCompare(bv,'en'));
  });
 }
 const limit=Math.min(25,Math.max(1,args.limit??10)),offset=Math.min(500,Math.max(0,args.offset??0));
 return {...base,available:true,dataset_id:file.entity_id,title:file.after.name,columns,rows:rows.slice(offset,offset+limit),matched_count:rows.length,total_rows:file.after.row_count,truncated:rows.length>offset+limit,offset,next_offset:rows.length>offset+limit?offset+limit:null,sort_by:args.sort_by??null,descending:args.descending??false,numeric_summary:numeric,warning:'Column sums are raw uploaded values, not canonical cash or signed metrics. No operational records were changed by saving this dataset.'};
}

import { useMemo, useState } from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import { apiFetch } from '../../services/authSession';
import { IMPORT_FIELDS, mappedRows, parseCsv, suggestMapping, type CsvData, type ImportDestination } from '../../lib/csvImport';

async function jsonRequest(path:string,init?:RequestInit):Promise<Record<string,unknown>> {
 const res=await apiFetch(path,{...init,headers:{'Content-Type':'application/json',Accept:'application/json'}});
 if(!(res.headers.get('content-type')??'').includes('application/json'))throw Error('The server did not return JSON. Please retry.');
 const body=await res.json();if(!res.ok)throw Error(body.message??body.error??`HTTP ${res.status}`);return body;
}
export function DataImportPanel(){
 const {editionId,recordClass,isReadOnlyHistorical}=useSeason();
 const [csv,setCsv]=useState(''),[name,setName]=useState(''),[destination,setDestination]=useState<ImportDestination>('dataset');
 const [data,setData]=useState<CsvData|null>(null),[mapping,setMapping]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[report,setReport]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState<Set<number>>(new Set());
 const preview=useMemo(()=>{try{return {rows:data?mappedRows(data,destination,mapping):[],error:''};}catch(e){return {rows:[],error:(e as Error).message};}},[data,destination,mapping]);
 const changeDestination=(v:ImportDestination)=>{setDestination(v);setMapping(data?suggestMapping(data.columns,v):{});setReport('');setSaved(new Set());};
 const load=async(file:File|undefined)=>{if(!file)return;setError('');setReport('');setSaved(new Set());setData(null);setCsv('');if(file.size>512000){setError('Maximum CSV size is 500 KB.');return;}try{const text=await file.text(),parsed=parseCsv(text);setCsv(text);setName(file.name.replace(/\.csv$/i,''));setData(parsed);setMapping(suggestMapping(parsed.columns,destination));}catch(e){setError((e as Error).message);}};
 const commit=async()=>{
  if(busy||!data||isReadOnlyHistorical||preview.error)return;setBusy(true);setError('');setReport('');
  const context={edition_id:editionId,record_class:recordClass};
  try{
   if(destination==='dataset'){
    const result=await jsonRequest('/api/imports/dataset',{method:'POST',body:JSON.stringify({...context,name,csv})});
    setReport(`${result.duplicate?'Already saved':'Saved'} ${result.row_count} rows as ${result.dataset_id}. Ask the Analyst about “${name}”. This reference upload does not change pipeline or collected cash.`);
   }else{
    if(preview.rows.length>100)throw Error('Operational imports are limited to 100 rows. Split the CSV or save it as a reference dataset.');
    // Read the current permitted list before creating anything. Never merge records by a guessed identity.
    const existing=await jsonRequest(`/api/${destination}?`+new URLSearchParams(context).toString());
    const raw=existing[destination]??existing.rows??existing.tasks??[];
    const list=Array.isArray(raw)?raw as Record<string,unknown>[]:[];
    const key=destination==='sponsors'?'display_name':destination==='tasks'?'title':'name';
    const names=new Set(list.map(r=>String(r[key]??'').trim().toLowerCase()).filter(Boolean));
    const done=new Set(saved),failures:string[]=[];
    for(let i=0;i<preview.rows.length;i++){
     if(done.has(i))continue;const row=preview.rows[i];
     if(row[key]&&names.has(row[key].trim().toLowerCase())){failures.push(`Row ${i+2}: an existing ${destination.slice(0,-1)} has this name. Use its edit screen; it was not duplicated.`);continue;}
     try{
      const defaults=destination==='sponsors'?{lifecycle_status:'research_target',first_source:'research'}:destination==='campaigns'?{status:'planned'}:destination==='tasks'?{status:'open'}:{};
      await jsonRequest(`/api/${destination}`,{method:'POST',body:JSON.stringify({...defaults,...row,...context})});
      done.add(i);if(row[key])names.add(row[key].trim().toLowerCase());setSaved(new Set(done));
     }catch(e){failures.push(`Row ${i+2}: ${(e as Error).message}`);}
    }
    setReport(`${done.size} of ${preview.rows.length} rows saved. Each successful row is an audited database transaction. ${failures.length?'Fix the rejected rows; retry skips rows saved in this session.':'Analytics and the Analyst will use these records on their next refresh.'}`);
    setError(failures.join('\n'));
   }
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <section className="rounded-xl border bg-white p-5 space-y-4" aria-labelledby="csv-import-title">
  <div><h2 id="csv-import-title" className="text-lg font-semibold">Import data</h2><p className="text-sm text-[var(--color-ink-muted)]">CSV with standard or custom columns · {editionId}. Preview the mapping before saving.</p></div>
  {isReadOnlyHistorical?<p role="status">Historical data is read-only. Select a writable demo season before importing.</p>:null}
  <label className="block text-sm">Destination<select aria-label="CSV destination" className="block mt-1 border rounded p-2" value={destination} disabled={busy||saved.size>0} onChange={e=>changeDestination(e.target.value as ImportDestination)}><option value="dataset">Reference dataset for Analyst</option><option value="sponsors">Sponsor research targets</option><option value="campaigns">Campaigns</option><option value="opportunities">Open pipeline opportunities</option><option value="tasks">Tasks</option></select></label>
  <p className="text-sm">{destination==='dataset'?'All columns are preserved. Uploaded values stay separate from operational metrics. Original sponsor spreadsheets exported as CSV can be analysed here without rewriting the historical dataset.':destination==='opportunities'?'Requires existing eligible sponsor IDs. Deals start in Prospecting. Signed contracts, payment evidence and later stage changes use the existing workflow; no stages or payments are invented.':'Records are added to the selected season through the same permission checks as the create forms.'}</p>
  <input aria-label="Choose CSV file" type="file" accept=".csv,text/csv" disabled={busy||isReadOnlyHistorical} onChange={e=>void load(e.target.files?.[0])}/>
  {data?<><label className="block text-sm">Dataset name<input aria-label="Dataset name" className="block border rounded p-2 mt-1" value={name} disabled={busy} maxLength={120} onChange={e=>setName(e.target.value)}/></label>
   <p className="text-sm">{data.rows.length} rows · {data.columns.length} columns</p>
   {destination!=='dataset'?<div className="grid sm:grid-cols-2 gap-3">{IMPORT_FIELDS[destination].map(field=><label className="text-sm" key={field}>{field.replace(/_/g,' ')}<select aria-label={`Map ${field}`} className="block border rounded p-2 w-full" value={mapping[field]??''} disabled={busy||saved.size>0} onChange={e=>setMapping({...mapping,[field]:e.target.value})}><option value="">Not mapped</option>{data.columns.map(c=><option key={c} value={c}>{c}</option>)}</select></label>)}</div>:null}
   {destination!=='dataset'?<p className="text-sm">Unmapped columns are not written: {data.columns.filter(c=>!Object.values(mapping).includes(c)).join(', ')||'none'}. Use Reference dataset to preserve the entire file. Category, channel, owner and sponsor fields use canonical IDs, not free-text names.</p>:null}
   <div className="overflow-auto max-h-56"><table className="text-sm"><thead><tr>{Object.keys(preview.rows[0]??data.rows[0]).map(c=><th key={c} className="p-2 text-left">{c}</th>)}</tr></thead><tbody>{(preview.rows.length?preview.rows:data.rows).slice(0,5).map((r,i)=><tr key={i}>{Object.values(r).map((v,j)=><td key={j} className="p-2 max-w-52 truncate">{v}</td>)}</tr>)}</tbody></table></div>
   {preview.error?<p role="alert">{preview.error}</p>:null}
   <button type="button" className="button-primary" disabled={busy||isReadOnlyHistorical||!!preview.error||!name.trim()} onClick={()=>void commit()}>{busy?'Importing…':`Confirm import to ${editionId}`}</button>
  </>:null}
  {report?<p role="status" className="text-sm">{report}</p>:null}{error?<p role="alert" className="text-sm whitespace-pre-wrap text-red-700">{error}</p>:null}
 </section>;
}

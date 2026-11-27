import { useMemo, useRef, useState } from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import { apiFetch } from '../../services/authSession';
import { IMPORT_FIELDS, IMPORT_REFERENCES, ORIGINAL_RISA_PRESET, detectOriginalRisaPreset, resolveImportReferences, mappedRows, parseCsv, serialiseCsv, suggestMapping, tabularRowsToData, type CsvData, type ImportDestination } from '../../lib/csvImport';

async function jsonRequest(path:string,init?:RequestInit):Promise<Record<string,unknown>> {
 const res=await apiFetch(path,{...init,headers:{'Content-Type':'application/json',Accept:'application/json'}});
 if(!(res.headers.get('content-type')??'').includes('application/json'))throw Error('The server did not return JSON. Please retry.');
 const body=await res.json();if(!res.ok)throw Error(body.message??body.error??`HTTP ${res.status}`);return body;
}
async function sha256(value:string):Promise<string>{const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function DataImportPanel({initialDestination='dataset',compact=false,onImported}:{initialDestination?:ImportDestination;compact?:boolean;onImported?:()=>void}={}){
 const {editionId,recordClass,isReadOnlyHistorical}=useSeason();
 const [csv,setCsv]=useState(''),[name,setName]=useState(''),[destination,setDestination]=useState<ImportDestination>(initialDestination);
 const [data,setData]=useState<CsvData|null>(null),[mapping,setMapping]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[report,setReport]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState<Set<number>>(new Set()),[sourceHash,setSourceHash]=useState('');
 const [sheets,setSheets]=useState<string[]>([]),[selectedSheet,setSelectedSheet]=useState('');
 const workbookRef=useRef<import('xlsx').WorkBook|null>(null);
 const xlsxRef=useRef<typeof import('xlsx')|null>(null);
 const preview=useMemo(()=>{try{return {rows:data?mappedRows(data,destination,mapping):[],error:''};}catch(e){return {rows:[],error:(e as Error).message};}},[data,destination,mapping]);
 const changeDestination=(v:ImportDestination)=>{setDestination(v);setMapping(data?suggestMapping(data.columns,v):{});setReport('');setSaved(new Set());};
 const applyData=(parsed:CsvData,fileName:string)=>{const canonicalCsv=serialiseCsv(parsed);if(new TextEncoder().encode(canonicalCsv).length>512000)throw Error('The selected sheet becomes larger than 500 KB as CSV. Choose a smaller sheet or split it.');setCsv(canonicalCsv);void sha256(canonicalCsv).then(setSourceHash);setName(fileName.replace(/\.(csv|xlsx|xls)$/i,''));setData(parsed);setMapping(suggestMapping(parsed.columns,destination));};
 const downloadErrorReport=()=>{if(!error)return;const body=['Import error report',`Dataset: ${name}`,`Edition: ${editionId}`,`Record class: ${recordClass}`,`Source SHA-256: ${sourceHash||'not available'}`,'',error].join('\n');const url=URL.createObjectURL(new Blob([body],{type:'text/plain'}));const link=document.createElement('a');link.href=url;link.download=`${name||'import'}-errors.txt`;link.click();URL.revokeObjectURL(url);};
 const readSheet=(sheetName:string)=>{const workbook=workbookRef.current,XLSX=xlsxRef.current;if(!workbook||!XLSX)throw Error('Choose the workbook again.');const sheet=workbook.Sheets[sheetName];if(!sheet)throw Error('This worksheet is not available.');const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:false,blankrows:false});applyData(tabularRowsToData(rows,sheetName),name||sheetName);setSelectedSheet(sheetName);};
 const load=async(file:File|undefined)=>{if(!file)return;setError('');setReport('');setSaved(new Set());setData(null);setCsv('');setSheets([]);setSelectedSheet('');workbookRef.current=null;xlsxRef.current=null;if(file.size>2_000_000){setError('Maximum file size is 2 MB.');return;}try{if(/\.xlsx?$/i.test(file.name)){const XLSX=await import('xlsx');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:false,cellHTML:false,cellText:true});if(!workbook.SheetNames.length)throw Error('This workbook has no worksheets.');workbookRef.current=workbook;xlsxRef.current=XLSX;setSheets(workbook.SheetNames);setName(file.name.replace(/\.xlsx?$/i,''));const first=workbook.SheetNames[0];const sheet=workbook.Sheets[first];const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:false,blankrows:false});applyData(tabularRowsToData(rows,first),file.name);setSelectedSheet(first);return;}if(!/\.csv$/i.test(file.name))throw Error('Choose a CSV, XLSX, or XLS file.');const parsed=parseCsv(await file.text());applyData(parsed,file.name);}catch(e){setError((e as Error).message);}};
 const commit=async()=>{
  if(busy||!data||isReadOnlyHistorical||preview.error)return;setBusy(true);setError('');setReport('');
  const context={edition_id:editionId,record_class:recordClass};
  try{
   if(destination==='dataset'){
    const result=await jsonRequest('/api/imports/dataset',{method:'POST',body:JSON.stringify({...context,name,csv})});
    setReport(`${result.duplicate?'Already saved':'Saved'} ${result.row_count} rows as ${result.dataset_id}. Ask the Analyst about “${name}”. This reference upload does not change pipeline or collected cash.`);
    if(!result.duplicate)onImported?.();
   }else{
    if(preview.rows.length>100)throw Error('Operational imports are limited to 100 rows. Split the CSV or save it as a reference dataset.');
    const catalogueEntries=await Promise.all(Object.entries(IMPORT_REFERENCES).filter(([field])=>preview.rows.some(r=>!!r[field])).map(async([field,meta])=>{
      const response=await jsonRequest(`/api/${meta.endpoint}?`+new URLSearchParams(context).toString());
      const values=response[meta.list]??(field==='owner_member_id'?response.team:undefined)??response.rows;
      if(!Array.isArray(values))throw Error(`The ${field} directory could not be loaded.`);
      return [field,values] as const;
    }));
    const operationalRows=resolveImportReferences(preview.rows,Object.fromEntries(catalogueEntries));
    // Keep the uploaded-source fingerprint separate from the selected field
    // mapping. That keeps provenance accurate and makes source+mapping retry
    // idempotency explicit.
    const mappingVersion='csv-operational-v1';
    const mappingHash=await sha256(JSON.stringify({destination,mapping,mappingVersion}));
    const result=await jsonRequest('/api/imports/operational',{method:'POST',body:JSON.stringify({...context,name,destination,source_hash:sourceHash||await sha256(csv),mapping_hash:mappingHash,mapping_version:mappingVersion,rows:operationalRows})});
    setSaved(new Set(operationalRows.map((_,index)=>index)));
    setReport(`${result.duplicate?'Already saved':'Saved'} ${result.row_count} rows in one audited import batch (${result.batch_id}). All records are committed together, so a failed validation leaves no partial operational data. Directories, metrics, search, and the Analyst will refresh against the new data version.`);
    onImported?.();
   }
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <section className="rounded-xl border bg-white p-5 space-y-4" aria-labelledby="csv-import-title">
  <div><h2 id="csv-import-title" className="text-lg font-semibold">{compact?'Import records':'Import data'}</h2><p className="text-sm text-[var(--color-ink-muted)]">CSV or Excel workbook with standard or custom columns · {editionId}. Preview the mapping before saving.</p></div>
  {isReadOnlyHistorical?<p role="status">Historical data is read-only. Select a writable demo season before importing.</p>:null}
  <label className="block text-sm">Destination<select aria-label="CSV destination" className="block mt-1 border rounded p-2" value={destination} disabled={busy||saved.size>0} onChange={e=>changeDestination(e.target.value as ImportDestination)}><option value="dataset">Reference dataset for Analyst</option><option value="sponsors">Sponsor research targets</option><option value="campaigns">Campaigns</option><option value="opportunities">Open pipeline opportunities</option><option value="tasks">Tasks</option></select></label>
  <p className="text-sm">{destination==='dataset'?'All columns are preserved. Uploaded values stay separate from operational metrics. Original sponsor spreadsheets exported as CSV can be analysed here without rewriting the historical dataset.':destination==='opportunities'?'Requires existing eligible sponsor IDs. Deals start in Prospecting. Signed contracts, payment evidence and later stage changes use the existing workflow; no stages or payments are invented.':'Operational rows are preflighted and saved in one audited transaction: validation failure leaves no partial records.'}</p>
  <input aria-label="Choose CSV or Excel file" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel" disabled={busy||isReadOnlyHistorical} onChange={e=>void load(e.target.files?.[0])}/>
  {data?<><label className="block text-sm">Dataset name<input aria-label="Dataset name" className="block border rounded p-2 mt-1" value={name} disabled={busy} maxLength={120} onChange={e=>setName(e.target.value)}/></label>
   {sheets.length>1?<label className="block text-sm">Workbook sheet<select aria-label="Workbook sheet" className="block mt-1 border rounded p-2" value={selectedSheet} disabled={busy||saved.size>0} onChange={e=>{try{readSheet(e.target.value);}catch(err){setError((err as Error).message);}}}>{sheets.map(sheet=><option key={sheet} value={sheet}>{sheet}</option>)}</select></label>:null}
   <p className="text-sm">{data.rows.length} source rows · {data.columns.length} columns · SHA-256 {sourceHash?`${sourceHash.slice(0,12)}…`:'calculating…'}</p>
   {detectOriginalRisaPreset(data.columns)?<p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm"><strong>{ORIGINAL_RISA_PRESET.label} detected.</strong> Brand and opportunity value have safe suggestions. Stage, Amount Paid, Payment Date and Category stay reference-only until their business meaning is explicitly mapped; they cannot create reconciled receipts or signed cash.</p>:null}
   {destination!=='dataset'?<div className="grid sm:grid-cols-2 gap-3">{IMPORT_FIELDS[destination].map(field=><label className="text-sm" key={field}>{field.replace(/_/g,' ')}<select aria-label={`Map ${field}`} className="block border rounded p-2 w-full" value={mapping[field]??''} disabled={busy||saved.size>0} onChange={e=>setMapping({...mapping,[field]:e.target.value})}><option value="">Not mapped</option>{data.columns.map(c=><option key={c} value={c}>{c}</option>)}</select></label>)}</div>:null}
   {destination!=='dataset'?<p className="text-sm">Unmapped columns are not written: {data.columns.filter(c=>!Object.values(mapping).includes(c)).join(', ')||'none'}. Use Reference dataset to preserve the entire file. Category, channel, owner, sponsor and campaign fields accept canonical IDs or exact, unambiguous names from this workspace. Unknown or ambiguous names block the import before writes.</p>:null}
   <div className="overflow-auto max-h-56"><table className="text-sm"><thead><tr>{Object.keys(preview.rows[0]??data.rows[0]).map(c=><th key={c} className="p-2 text-left">{c}</th>)}</tr></thead><tbody>{(preview.rows.length?preview.rows:data.rows).slice(0,5).map((r,i)=><tr key={i}>{Object.values(r).map((v,j)=><td key={j} className="p-2 max-w-52 truncate">{v}</td>)}</tr>)}</tbody></table></div>
   {preview.error?<p role="alert">{preview.error}</p>:null}
   <button type="button" className="button-primary" disabled={busy||isReadOnlyHistorical||!!preview.error||!name.trim()} onClick={()=>void commit()}>{busy?'Importing…':`Confirm import to ${editionId}`}</button>
  </>:null}
  {report?<p role="status" className="text-sm">{report}</p>:null}{error?<div role="alert" className="text-sm whitespace-pre-wrap text-red-700 space-y-2"><p>{error}</p><button type="button" className="underline" onClick={downloadErrorReport}>Download error report</button></div>:null}
 </section>;
}

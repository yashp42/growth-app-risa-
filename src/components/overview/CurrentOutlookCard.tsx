import { useQuery } from '@tanstack/react-query';
import { useSeason } from '../../contexts/SeasonContext';
import { apiFetch } from '../../services/authSession';
export function CurrentOutlookCard(){
 const {editionId,recordClass,asOf}=useSeason();
 const q=useQuery({queryKey:['current-outlook',editionId,recordClass,asOf],queryFn:async()=>{
  const r=await apiFetch('/api/outlook?'+new URLSearchParams({edition_id:editionId,record_class:recordClass,as_of:asOf}));
  if(!r.ok)throw Error('Outlook unavailable');return r.json() as Promise<{available:boolean;indicative_total_cash:number|null;reason?:string}>;
 },enabled:recordClass!=='historical_synthetic',staleTime:10000});
 if(recordClass==='historical_synthetic')return null;
 return <section className="rounded-xl border bg-white p-4" aria-label="Current cash outlook"><h2 className="font-semibold">Current cash outlook</h2>
 <p className="text-sm text-[var(--color-ink-muted)]">Observed-rate what-if · recalculates when records change</p>
 <p className="text-xl font-semibold mt-2">{q.isPending?'Loading…':q.data?.available&&q.data.indicative_total_cash!=null?'₹'+q.data.indicative_total_cash.toLocaleString('en-IN',{maximumFractionDigits:0}):'Not enough evidence'}</p>
 <p className="text-xs text-[var(--color-ink-muted)] mt-2">{q.error?'The outlook could not be loaded.':q.data?.reason??'Uses current collected cash, remaining signed cash and cash-only open pipeline at observed win and collection rates. This is not a calibrated prediction or a pre-event guarantee. Approved targets stay separate.'}</p></section>;
}

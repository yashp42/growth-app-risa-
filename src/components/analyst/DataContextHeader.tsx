import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ANALYST_EDITION_BY_CLASS, ANALYST_RECORD_CLASS_OPTIONS, formatRecordClassLabel } from '../../services/analystApi';
import type { GrowthAnalystSessionFilterState } from '../../hooks/useGrowthAnalystSession';
import type { AiQuotaInfo,AiRecordClass } from '../../types/analyst';
import { SelectControl } from '../ui/SelectControl';
import { ReadAloudToggle } from './ReadAloudToggle';
interface DataContextHeaderProps {
 filters:GrowthAnalystSessionFilterState;onChangeRecordClass:(v:AiRecordClass)=>void;onChangeEdition:(v:string)=>void;onChangeAsOf:(v:string)=>void;
 dataVersion:string|number|null;quota:AiQuotaInfo|null;conversationId:string|null;onResetConversation:()=>void;pendingActionCount:number;
 mobilePanel:'chat'|'evidence'|'actions';onChangeMobilePanel:(v:'chat'|'evidence'|'actions')=>void;
 autoReadAloud?:boolean;readAloudSupported?:boolean;onChangeAutoReadAloud?:(v:boolean)=>void;
}
export function DataContextHeader(p:DataContextHeaderProps){
 return <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-5">
  <div><p className="eyebrow mb-2">Intelligence</p><h1 className="page-heading">Growth Analyst</h1><p className="mt-2 text-sm text-[var(--color-ink-muted)]">{formatRecordClassLabel(p.filters.record_class)} · As of {p.filters.as_of}</p></div>
  <div className="flex items-center gap-2 pt-1">
   {p.onChangeAutoReadAloud?<ReadAloudToggle on={p.autoReadAloud??false} supported={p.readAloudSupported??false} onChange={p.onChangeAutoReadAloud}/>:null}
   <details className="relative"><summary className="button-secondary list-none"><SlidersHorizontal size={15} aria-hidden="true"/>Context</summary><div className="absolute right-0 z-30 mt-3 w-[min(340px,calc(100vw-32px))] space-y-4 rounded-xl border bg-white p-5 shadow-xl">
    <p className="section-title">Conversation context</p>
    <SelectControl id="analyst-record-class" label="Data source" value={p.filters.record_class} options={ANALYST_RECORD_CLASS_OPTIONS} onChange={v=>p.onChangeRecordClass(v as AiRecordClass)}/>
    <SelectControl id="analyst-edition" label="Edition" value={p.filters.edition_id} options={ANALYST_EDITION_BY_CLASS[p.filters.record_class]} onChange={p.onChangeEdition}/>
    <label className="flex flex-col gap-1.5 text-sm" htmlFor="analyst-as-of">As of date<input id="analyst-as-of" type="date" value={p.filters.as_of} onChange={e=>{if(e.target.value)p.onChangeAsOf(e.target.value);}} className="rounded-lg border px-3 py-2"/></label>
    <details className="source-details"><summary>Technical details</summary><dl className="space-y-1 break-all"><div>Data version: {p.dataVersion??'Unknown'}</div><div>Conversation: {p.conversationId??'New conversation'}</div><div>AI requests remaining: {p.quota?.remaining??'Unknown'}</div></dl></details>
   </div></details>
   <button type="button" className="icon-button" aria-label="New conversation" title="New conversation" onClick={p.onResetConversation}><RotateCcw size={16}/></button>
  </div>
 </header>;
}

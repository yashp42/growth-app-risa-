import { useId } from 'react';
import type { ApiErrorInfo, DataLoadStatus, ScenarioKey, TargetPacingSnapshot } from '../../types/overview';
import { businessText } from '../../lib/businessCopy';
import { DataStateWrapper } from '../ui/DataStateWrapper';
interface TargetPacingSectionProps {pacing:TargetPacingSnapshot;selectedScenario:ScenarioKey;onSelectScenario:(s:ScenarioKey)=>void;status:DataLoadStatus;error:ApiErrorInfo|null;onRetry:()=>void;recordClass?:string;asOfDate?:string;}
/** Coordinates and axes only: plotted financial figures come from the server snapshot. */
export function TargetPacingSection({pacing,selectedScenario,onSelectScenario,status,error,onRetry}:TargetPacingSectionProps){
 const gradient=useId().replace(/:/g,'');const weeks=pacing.weeklyMilestones;
 const max=Math.max(1,...weeks.flatMap(w=>[w.actualValue??0,w.baseTargetValue??0,w.planTargetValue??0]));
 const x=(i:number)=>54+i*552/Math.max(1,weeks.length-1);const y=(v:number)=>220-v/max*190;
 const path=(key:'actualValue'|'baseTargetValue'|'planTargetValue')=>{let started=false;return weeks.map((w,i)=>{const v=w[key];if(v===null||key==='actualValue'&&!w.passed){started=false;return '';}const p=(started?'L':'M')+x(i)+','+y(v);started=true;return p;}).join(' ');};
 const actual=weeks.map((w,i)=>({w,i})).filter(({w})=>w.passed&&w.actualValue!==null);
 const hasHistory=weeks.some(w=>w.actualValue!==null||w.baseTargetValue!==null||w.planTargetValue!==null);
 const continuous=actual.every((p,i)=>i===0||p.i===actual[i-1].i+1);
 const active=pacing.scenarioTargets[selectedScenario];
 return <section className="overview-panel" aria-label="Target pacing">
  <header className="overview-panel-heading"><div><h2>Target pacing</h2><p>Signed commitments against weekly targets</p></div><span className="overview-status">{businessText(pacing.latestGateStatusLabel)||'Awaiting checkpoint'}</span></header>
  <DataStateWrapper status={status} error={error} onRetry={onRetry} loadingSkeleton={<div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-subtle)]"/>}>
   <div className="flex flex-wrap gap-4 text-xs text-[var(--color-ink-muted)]"><span><i className="chart-key bg-[var(--color-accent)]"/>Signed value</span><span><i className="chart-key bg-[#A1B799]"/>Base target</span><span><i className="chart-key bg-[#C2AA7A]"/>Plan target</span></div>
   {hasHistory?<svg viewBox="0 0 640 262" role="img" aria-label="Server-supplied weekly signed commitments and Base and Plan targets" className="my-2 w-full"><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8FAF8A" stopOpacity=".24"/><stop offset="100%" stopColor="#8FAF8A" stopOpacity="0"/></linearGradient></defs>
    {[0,.25,.5,.75,1].map(t=><g key={t}><line x1="54" x2="606" y1={y(max*t)} y2={y(max*t)} stroke="#E8E5DB" strokeDasharray={t?'3 5':undefined}/><text x="44" y={y(max*t)+4} textAnchor="end" fontSize="11" fill="#6A776F">₹{(max*t/100000).toLocaleString('en-IN',{maximumFractionDigits:1})}L</text></g>)}
    {actual.length>1&&continuous?<path d={path('actualValue')+'L'+x(actual.at(-1)!.i)+',220 L'+x(actual[0].i)+',220 Z'} fill={'url(#'+gradient+')'}/>:null}
    <path d={path('baseTargetValue')} fill="none" stroke="#A1B799" strokeWidth="2" strokeDasharray="5 5"/><path d={path('planTargetValue')} fill="none" stroke="#C2AA7A" strokeWidth="2" strokeDasharray="2 5"/><path d={path('actualValue')} fill="none" stroke="#245C45" strokeWidth="3" strokeLinecap="round"/>
    {actual.map(({w,i})=><circle key={w.weekId} cx={x(i)} cy={y(w.actualValue!)} r="4" fill="#245C45" stroke="white" strokeWidth="2"><title>{w.label}: {w.actualFormatted}</title></circle>)}
    {weeks.map((w,i)=><text key={w.weekId} x={x(i)} y="246" textAnchor="middle" fontSize="10" fill="#6A776F">{w.weekEnd?.slice(5)||w.label}</text>)}
   </svg>:<p className="py-12 text-sm text-[var(--color-ink-muted)]">Weekly pacing history is unavailable for this season.</p>}
   <div className="overview-forecast"><div><span className="text-xs text-[var(--color-ink-muted)]">Approved pre-event cash target</span><p className="text-xl font-semibold tabular-nums">{active.targetFormatted??'Unavailable'}</p></div><div className="segmented-control" role="group" aria-label="Approved cash scenario">{(['base','plan','stretch'] as const).map(k=><button type="button" key={k} aria-pressed={k===selectedScenario} onClick={()=>onSelectScenario(k)}>{k[0].toUpperCase()+k.slice(1)}</button>)}</div></div>
   <details className="source-details"><summary>Weekly figures &amp; collection checkpoint</summary><p>Signed pacing and collected cash are separate measures. {businessText(pacing.cashCollectionGate.gateStatusLabel)}</p><p>Collection target: {pacing.cashCollectionGate.gateTargetFormatted}. Collection rate: {pacing.cashCollectionGate.collectionRateFormatted}.</p><div className="overflow-x-auto"><table><thead><tr><th>Week</th><th>Signed</th><th>Base</th><th>Plan</th></tr></thead><tbody>{weeks.map(w=><tr key={w.weekId}><td>{w.label} · {w.weekEnd}</td><td>{w.actualFormatted??w.reason??'Upcoming'}</td><td>{w.baseTargetFormatted??'—'}</td><td>{w.planTargetFormatted??'—'}</td></tr>)}</tbody></table></div><p>{active.label} · {active.p50Formatted}</p></details>
  </DataStateWrapper>
 </section>;
}

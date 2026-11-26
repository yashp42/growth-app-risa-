import { Coins, FileCheck2, Layers3, Clock3, ArrowUpRight } from 'lucide-react';
import type { ApiErrorInfo, DataLoadStatus, GrowthPulseMetric } from '../../types/overview';
import { businessText } from '../../lib/businessCopy';
import { DataStateWrapper } from '../ui/DataStateWrapper';
interface GrowthPulseSectionProps {metrics:GrowthPulseMetric[];status:DataLoadStatus;error:ApiErrorInfo|null;onRetry:()=>void;onInspectMetric?:(m:GrowthPulseMetric)=>void;recordClass?:string;asOfDate?:string;}
const order=['cash_collected','signed_value','active_opportunities','outstanding_collections'];
const icons={cash_collected:Coins,signed_value:FileCheck2,active_opportunities:Layers3,outstanding_collections:Clock3};
export function GrowthPulseSection({metrics,status,error,onRetry,onInspectMetric}:GrowthPulseSectionProps){
 return <section aria-label="Season performance"><DataStateWrapper status={status} error={error} onRetry={onRetry} loadingSkeleton={<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{order.map(k=><div key={k} className="h-36 animate-pulse rounded-2xl bg-[var(--color-surface-subtle)]"/>)}</div>}><div className="overview-metrics">{[...metrics].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)).map(metric=>{const Icon=icons[metric.id]??Coins;return <button type="button" className="overview-metric group" key={metric.id} onClick={()=>onInspectMetric?.(metric)}><div className="flex items-start justify-between gap-2"><span>{businessText(metric.label)}</span><span className="overview-metric-icon"><Icon size={18}/></span></div><strong>{metric.computable&&metric.formattedValue!==null?metric.formattedValue:'Unavailable'}</strong><p>{businessText(metric.secondaryBreakdownLabel||metric.comparisonText||metric.reason)||'View details'}<ArrowUpRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100"/></p></button>;})}</div></DataStateWrapper></section>;
}

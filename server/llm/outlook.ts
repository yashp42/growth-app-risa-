import { evaluateScopeAndRedaction } from '../routes/readApi.ts';
import type { ToolExecutionContext } from './tools.ts';
/** Transparent, on-read sensitivity calculation; approved strategy forecasts are never overwritten. */
export async function currentOutlook(ctx:ToolExecutionContext):Promise<Record<string,unknown>> {
 const profile=evaluateScopeAndRedaction(ctx.roles),{editionId,recordClass,asOf}=ctx.userSeason;
 if(recordClass==='historical_synthetic')return {available:false,reason:'Historical data has no cash ledger for a cash outlook.'};
 if(profile.redactFinancials||profile.opportunitiesScope!=='all'||profile.contractsScope!=='all')return {available:false,reason:'A full financial scope is required for a season-wide outlook.'};
 const m=await ctx.pool.query<Record<string,unknown>>(`SELECT r.* FROM unnest(ARRAY['M-01','M-03','M-06','M-13']) AS ids(metric_id)
 CROSS JOIN LATERAL metrics.get_metric(ids.metric_id,$1,$2,$3::date,'{}'::jsonb) r`,[recordClass,editionId,asOf]);
 const value=(id:string)=>{const r=m.rows.find(r=>r.metric_id===id);return r?.computable===true&&r.value!=null&&Number.isFinite(Number(r.value))?Number(r.value):null;};
 const collected=value('M-01'),signed=value('M-03'),collectionRate=value('M-06'),winRate=value('M-13');
 const rows=await ctx.pool.query<Record<string,unknown>>(`SELECT COALESCE(SUM(proposed_value) FILTER (WHERE support_type='cash'),0) AS open_cash,
 COUNT(*) FILTER (WHERE support_type<>'cash') AS excluded_non_cash_deals
 FROM metrics.opp_state($1,$2,metrics.eod($3::date)) WHERE stage IN ('prospecting','contacted','proposal_sent','negotiating')`,[recordClass,editionId,asOf]);
 const openCash=Number(rows.rows[0]?.open_cash??0);
 const ready=collected!==null&&signed!==null&&collected>=0&&signed>=0&&Number.isFinite(openCash)&&openCash>=0&&collectionRate!==null&&winRate!==null&&collectionRate>=0&&collectionRate<=1&&winRate>=0&&winRate<=1;
 const incremental=ready?Math.max(0,signed!-collected!)*collectionRate!+openCash*winRate!*collectionRate!:null;
 return {source:'current_outlook',kind:'outlook',available:ready,edition_id:editionId,record_class:recordClass,as_of:asOf,
  method:'Observed-rate what-if, not an approved forecast or calibrated prediction',
  collected_cash:collected,signed_cash:signed,open_cash:openCash,observed_collection_rate:collectionRate,observed_win_rate:winRate,
  indicative_total_cash:incremental===null?null:Math.round((collected!+incremental)*100)/100,
  excluded_non_cash_deals:Number(rows.rows[0]?.excluded_non_cash_deals??0),
  formula:'collected_cash + max(0, signed_cash - collected_cash) * observed_collection_rate + open_cash * observed_win_rate * observed_collection_rate',
  reason:ready?null:'Missing or invalid receipt/conversion evidence; no projected number released.',
  caveat:'Recomputed from current records on every read. Excludes mixed/in-kind open deals because their cash split is unknown. No timing, probability calibration, causal claim or pre-event guarantee. Approved base/plan/stretch remain unchanged.'};
}

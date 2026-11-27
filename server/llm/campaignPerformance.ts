import { evaluateScopeAndRedaction } from '../routes/readApi.ts';
import type { ToolExecutionContext } from './tools.ts';
/** Complete permitted cohort measured before display limiting. No client/LLM metric arithmetic. */
export async function campaignPerformance(ctx:ToolExecutionContext):Promise<Record<string,unknown>>{
 const p=evaluateScopeAndRedaction(ctx.roles),{recordClass,editionId,asOf}=ctx.userSeason;
 if(p.opportunitiesScope!=='all'||p.contractsScope!=='all'||p.redactFinancials)throw Error('A full financial scope is required for this campaign comparison.');
 const r=await ctx.pool.query<Record<string,unknown>>(`WITH measured AS (
 SELECT c.campaign_id,c.name,c.status,
 MAX(m.value) FILTER (WHERE m.metric_id='M-01' AND m.computable) AS cash_collected,
 MAX(m.value) FILTER (WHERE m.metric_id='M-02' AND m.computable) AS signed_value,
 MAX(m.value) FILTER (WHERE m.metric_id='M-13' AND m.computable) AS win_rate,
 MAX(m.value) FILTER (WHERE m.metric_id='M-21' AND m.computable) AS open_pipeline
 FROM public.campaign c CROSS JOIN unnest(ARRAY['M-01','M-02','M-13','M-21']) ids(metric_id)
 CROSS JOIN LATERAL metrics.get_metric(ids.metric_id,$1,$2,$3::date,jsonb_build_object('campaign_id',c.campaign_id)) m
 WHERE c.record_class=$1 AND c.edition_id=$2 AND NOT c.is_deleted
 GROUP BY c.campaign_id,c.name,c.status)
 SELECT measured.*,COUNT(*) OVER() AS cohort_size FROM measured ORDER BY cash_collected ASC NULLS LAST,campaign_id LIMIT 25`,[recordClass,editionId,asOf]);
 return {source:'list_campaign_performance',kind:'campaign_performance',title:'Current campaign performance',record_class:recordClass,edition_id:editionId,as_of:asOf,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['cash_collected','signed_value','win_rate','open_pipeline','cohort_size'].includes(k)&&v!=null?Number(v):v]))),truncated:Number(r.rows[0]?.cohort_size??0)>25,caveat:'Campaign totals and conversion rates do not establish causation or a target gap. Missing measures stay null. Compare approved targets and time series before recommending a stop.'};
}

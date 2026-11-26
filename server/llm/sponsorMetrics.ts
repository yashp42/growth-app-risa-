import { evaluateScopeAndRedaction, toNum } from '../routes/readApi.ts';
import type { ToolExecutionContext } from './tools.ts';
export const SPONSOR_METRICS = ['M-01','M-02','M-03','M-04','M-07'] as const;
export type SponsorMetricId = typeof SPONSOR_METRICS[number];
/** A read-only grouping of the canonical M-01/M-02/M-03/M-04/M-07 sources.
 * Do not rank a limited CRM list or use today's balance_view for an earlier as-of date.
 * No metric definition, financial record or schema is changed here. */
export async function querySponsorMetrics(ctx: ToolExecutionContext, metric: SponsorMetricId, filters: Record<string,string>, limit: number) {
 const p=evaluateScopeAndRedaction(ctx.roles);
 if (p.opportunitiesScope==='none'||p.sponsorsScope==='none'||(metric==='M-01'||metric==='M-07')&&(p.redactFinancials||p.contractsScope==='none')) throw new Error('Your role does not permit viewing this sponsor financial breakdown.');
 const {recordClass,editionId,asOf}=ctx.userSeason;
 if(recordClass==='historical_synthetic'&&(metric==='M-01'||metric==='M-07'))return {computable:false,reason:'Historical 2025 data has no receipt ledger. Signed commitments are not collected cash.',rows:[]};
 const own=p.opportunitiesScope==='own'||p.sponsorsScope==='own'||p.contractsScope==='own';
 const expr=metric==='M-01'?'collected':metric==='M-02'?'signed':metric==='M-03'?'cash_signed':metric==='M-04'?'in_kind':'cash_signed - collected';
 const result=await ctx.pool.query<Record<string,unknown>>(`
 WITH scoped AS (
   SELECT os.*, sp.display_name AS sponsor_name
   FROM metrics.opp_state($1,$2,metrics.eod($3::date)) os
   JOIN public.sponsor sp ON sp.sponsor_id=os.sponsor_id AND NOT sp.is_deleted
   LEFT JOIN LATERAL (SELECT owner_member_id FROM public.opportunity_stage_version v
     WHERE v.opportunity_id=os.opportunity_id AND NOT v.is_deleted
       AND v.valid_from < metrics.eod($3::date)
     ORDER BY v.valid_from DESC,v.history_id DESC LIMIT 1) owner ON true
   WHERE metrics.campaign_match(os.originating_campaign_id,$4::jsonb)
   AND (NOT $5::boolean OR owner.owner_member_id=$6 OR EXISTS (
     SELECT 1 FROM public.ownership_assignment oa WHERE oa.subject_type='sponsor'
     AND oa.subject_id=os.sponsor_id AND oa.member_id=$6 AND oa.record_class=$1
     AND oa.valid_to IS NULL AND NOT oa.is_deleted))
 ), signed AS (
   SELECT sponsor_id, SUM(confirmed_value) AS signed
   FROM scoped WHERE stage='partner_confirmed' GROUP BY sponsor_id
 ), lines AS (
   SELECT s.sponsor_id,
     SUM(cl.value) FILTER(WHERE cl.consideration_type='cash') AS cash_signed,
     SUM(cl.value) FILTER(WHERE cl.consideration_type='in_kind') AS in_kind
   FROM scoped s JOIN public.contract c ON c.opportunity_id=s.opportunity_id
     AND c.status='active' AND c.valid_to IS NULL AND NOT c.is_deleted
     AND c.signed_at < metrics.eod($3::date)
   JOIN public.contract_line cl ON cl.contract_id=c.contract_id AND NOT cl.is_deleted
   WHERE s.stage='partner_confirmed' GROUP BY s.sponsor_id
 ), historical AS (
   SELECT sponsor_id, SUM(confirmed_value) FILTER(WHERE support_type='cash') AS cash_signed,
     SUM(confirmed_value) FILTER(WHERE support_type='in_kind') AS in_kind
   FROM scoped WHERE stage='partner_confirmed' GROUP BY sponsor_id
 ), receipts AS (
   SELECT o.sponsor_id, SUM(ra.amount) AS collected
   FROM public.receipt_allocation ra
   JOIN public.receipt r ON r.receipt_id=ra.receipt_id AND NOT r.is_deleted AND r.reconciled
   LEFT JOIN public.payment_schedule_item psi ON psi.schedule_item_id=ra.schedule_item_id
   LEFT JOIN public.invoice inv ON inv.invoice_id=ra.invoice_id
   JOIN public.contract c ON c.contract_id=COALESCE(psi.contract_id,inv.contract_id)
   JOIN scoped o ON o.opportunity_id=c.opportunity_id
   WHERE NOT ra.is_deleted AND ra.record_class=$1
     AND r.received_at < LEAST(metrics.edition_start($1,$2),metrics.eod($3::date))
     AND r.reconciled_at < metrics.eod($3::date)
   GROUP BY o.sponsor_id
 ), values_by_sponsor AS (
   SELECT s.sponsor_id,s.sponsor_name,COALESCE(v.signed,0) AS signed,
     COALESCE(CASE WHEN $1='historical_synthetic' THEN h.cash_signed ELSE l.cash_signed END,0) AS cash_signed,
     COALESCE(CASE WHEN $1='historical_synthetic' THEN h.in_kind ELSE l.in_kind END,0) AS in_kind,
     COALESCE(r.collected,0) AS collected
   FROM (SELECT DISTINCT sponsor_id,sponsor_name FROM scoped) s
   LEFT JOIN signed v USING(sponsor_id) LEFT JOIN lines l USING(sponsor_id)
   LEFT JOIN historical h USING(sponsor_id) LEFT JOIN receipts r USING(sponsor_id)
 ), ranked AS (
   SELECT sponsor_id,sponsor_name,${expr} AS value,
     DENSE_RANK() OVER(ORDER BY (${expr}) DESC) AS position
   FROM values_by_sponsor
 )
 SELECT sponsor_id,sponsor_name,value,position,COUNT(*) OVER() AS total_sponsors,
 SUM(value) OVER() AS breakdown_total,
 (SELECT value FROM metrics.get_metric($8,$1,$2,$3::date,$4::jsonb) LIMIT 1) AS canonical_total
 FROM ranked
 ORDER BY value DESC,sponsor_id ASC LIMIT $7`,[recordClass,editionId,asOf,JSON.stringify(filters),own,ctx.actorMemberId,limit,metric]);
 if(!own&&result.rows.length&&toNum(result.rows[0].breakdown_total)!==toNum(result.rows[0].canonical_total))throw new Error('Sponsor breakdown does not reconcile with the canonical season metric. No ranking was released.');
 return {computable:true,truncated:Number(result.rows[0]?.total_sponsors??0)>limit,rows:result.rows.map(r=>({sponsor_id:r.sponsor_id,sponsor_name:r.sponsor_name,value:toNum(r.value),position:toNum(r.position)}))};
}

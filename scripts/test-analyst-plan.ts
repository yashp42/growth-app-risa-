import assert from 'node:assert/strict';
import test from 'node:test';
import { missingPlannedSections, planAnalystEvidence } from '../server/llm/analystPlan.ts';

test('one evidence plan retains campaign, channel, and recommendation requirements',()=>{
 const plan=planAnalystEvidence({question:'Which campaigns and acquisition channels are losing the most qualified sponsorship opportunities? Recommend three actions.'});
 assert.equal(plan.facets.analytics,'campaign_leakage');
 assert.ok(plan.requiredEvidence.some(x=>x.includes('M-17, M-18 and M-19 by channel')));
 assert.deepEqual(missingPlannedSections('Qualified-lead leakage by campaign\nStage comparison by acquisition channel\nRecommended actions for this week',plan),[]);
 assert.deepEqual(missingPlannedSections('Here are some opportunity rows.',plan),['campaign leakage','channel stage comparison','measurable recommendations']);
});

test('compound financial requests preserve cash and due-date obligations',()=>{
 const plan=planAnalystEvidence({question:'Reconcile signed cash, collected cash and outstanding cash. Show overdue status and due dates.'});
 assert.equal(plan.facets.financial,'cash_position');
 assert.equal(plan.facets.operational?.kind,'receivable_followup');
 assert.ok(plan.requiredEvidence.includes('permission-scoped receivable schedules and due dates'));
 assert.deepEqual(missingPlannedSections('Current cash position\nReconciliation: balanced\nDue-date and urgency evidence',plan),[]);
});

test('approved-bet and capacity questions retain both facets in one plan',()=>{
 const plan=planAnalystEvidence({question:'Evaluate all five growth bets against D-010 and compare where the next 5 person-weeks should go. Do not change approved assumptions.'});
 assert.deepEqual(plan.facets.strategy,['growth_bets','capacity_allocation']);
 assert.deepEqual(missingPlannedSections('D-010 approved thresholds evaluated\nApproved capacity scenarios\nCurrent selected-edition pipeline evidence',plan),[]);
});

test('historical comparisons require both editions and interpretation, not just numbers',()=>{
 const plan=planAnalystEvidence({question:'Compare 2025 historical and 2026 simulated funnel conversion; explain the differences.'});
 assert.equal(plan.facets.analytics,'historical_funnel_compare');
 assert.ok(missingPlannedSections('Only ED-2026-DEMO values.',plan).includes('both editions'));
 assert.deepEqual(missingPlannedSections('ED-2025\nED-2026-DEMO\nDirectional comparison\nInterpretation limits',plan),[]);
});

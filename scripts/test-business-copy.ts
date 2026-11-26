import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrowthPulseSection } from '../src/components/overview/GrowthPulseSection.tsx';
import { NeedsAttentionQueueSection } from '../src/components/overview/NeedsAttentionQueueSection.tsx';
import { businessText } from '../src/lib/businessCopy.ts';

test('[MOCKED] business labels retain financial amounts, dates and cash/in-kind distinctions', () => {
  assert.equal(businessText('Cash (M-03): ₹9.65L · In-kind (M-04): ₹25,000'), 'Cash: ₹9.65L · In-kind: ₹25,000');
  assert.equal(businessText('Base cash target (SC-01)'), 'Base cash target');
  assert.equal(businessText('Not due: evaluated on 2 Jan 2027'), 'Not due: evaluated on 2 Jan 2027');
});

test('[MOCKED] overview renders supplied values without exposing internal metric codes in its primary labels', () => {
  const metric:any = {id:'signed',metricId:'M-02',label:'Signed value (M-02)',computable:true,formattedValue:'₹9.90L',secondaryBreakdownLabel:'Cash (M-03): ₹9.65L · In-kind (M-04): ₹25,000',supportingLabel:'Includes cash and in-kind commitments.'};
  const before=JSON.stringify(metric);
  const html=renderToStaticMarkup(React.createElement(GrowthPulseSection,{metrics:[metric],status:'ready',error:null,onRetry:()=>{}}));
  assert.match(html,/₹9.90L/);assert.match(html,/₹9.65L/);assert.match(html,/₹25,000/);assert.match(html,/In-kind/);
  assert.doesNotMatch(html,/M-0[234]/);assert.equal(JSON.stringify(metric),before);
});

test('[MOCKED] attention headlines convey the action and preserve the observed business result', () => {
  const item:any={id:'rule-alert',category:'threshold_rule',categoryLabel:'Threshold rule',title:'EX-B1a: escalate (< 0.63)',whatHappened:'Qualified → proposal within 10 days (M-19) = 60.0%',responsibleOwner:'Partnerships',timestampLabel:'2026-11-27'};
  const html=renderToStaticMarkup(React.createElement(NeedsAttentionQueueSection,{items:[item],status:'ready',error:null,onRetry:()=>{}}));
  assert.match(html,/Action needed/);assert.match(html,/60.0%/);assert.match(html,/within 10 days/);assert.doesNotMatch(html,/EX-B1a|M-19|0.63/);
});

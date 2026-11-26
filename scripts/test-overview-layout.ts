import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {TargetPacingSection} from '../src/components/overview/TargetPacingSection.tsx';
import {GrowthPulseSection} from '../src/components/overview/GrowthPulseSection.tsx';
import {OverviewFunnel} from '../src/components/overview/OverviewFunnel.tsx';
import {OverviewCampaignHighlights} from '../src/components/overview/OverviewCampaignHighlights.tsx';
import {Sidebar} from '../src/components/shell/Sidebar.tsx';
import {NeedsAttentionQueueSection} from '../src/components/overview/NeedsAttentionQueueSection.tsx';
const h=React.createElement,noop=()=>{};
// Explicit visual/test fixture, never imported by application code or used as a dashboard fallback.
const weeks=[101000,163000,204000,null,null,null].map((v,i)=>({weekId:'W'+i,label:'Week '+(i+1),weekEnd:'2026-11-'+String(1+i*4).padStart(2,'0'),passed:i<3,actualValue:v,actualFormatted:v===null?null:'₹'+v.toLocaleString('en-IN'),baseTargetValue:i>1?260000+i*70000:null,baseTargetFormatted:i>1?'₹'+(260000+i*70000).toLocaleString('en-IN'):null,planTargetValue:i>1?300000+i*80000:null,planTargetFormatted:i>1?'₹'+(300000+i*80000).toLocaleString('en-IN'):null,gateStatus:null,progressRatio:null}));
const pacing:any={actualSignedFormatted:'₹2.04L',latestGateStatusLabel:'Behind base target',weeklyMilestones:weeks,scenarioTargets:Object.fromEntries(['base','plan','stretch'].map((k,i)=>[k,{label:k+' cash target',targetFormatted:'₹'+(5+i)+'.00L'}])),cashCollectionGate:{gateStatusLabel:'Not due',gateTargetFormatted:'85%',collectionRateFormatted:'25%'}};
const metrics:any[]=[['cash_collected','Cash collected','₹1.01L'],['signed_value','Signed value','₹2.04L'],['active_opportunities','Open pipeline','₹3.05L'],['outstanding_collections','Outstanding cash','₹1.03L']].map(([id,label,formattedValue])=>({id,label,formattedValue,computable:true,secondaryBreakdownLabel:'MOCKED layout fixture'}));
const stages:any[]=['Prospects','Conversations','Qualified','Proposals','Confirmed partnerships'].map((label,i)=>({key:label,label,count:[121,87,54,32,12][i],rateFormatted:null}));
const campaigns:any[]=['Renewals','Creator referrals','Campus partnerships'].map((campaignName,i)=>({id:campaignName,campaignName,ownerName:'Test team',healthLabel:'On track',signedValue:150000-i*40000,signedFormatted:'₹'+(150000-i*40000).toLocaleString('en-IN')}));
const attention:any[]=['Follow up on outstanding proposals','Review a collection risk','Schedule the next sponsor conversation'].map((title,i)=>({id:String(i),category:'collection_risks',categoryLabel:'Follow-up',title,whatHappened:'Source-backed action details appear here.',responsibleOwner:'Test owner',timestampLabel:'2026-11-27'}));
function layout(){return h('div',{style:{display:'flex',minHeight:'100vh'}},h(Sidebar,{activeSection:'overview',onSelectSection:noop,collapsed:false,onToggleCollapse:noop,mobileOpen:false,onCloseMobile:noop}),h('main',{className:'workspace-page',style:{padding:'32px',flex:1,minWidth:0,maxWidth:'1500px',margin:'auto'}},h('header',{className:'overview-welcome'},h('h1',{className:'page-heading'},'Sponsorship overview'),h('p',null,'MOCKED visual review · fixture figures · no live workflow claims')),h(GrowthPulseSection,{metrics,status:'ready',error:null,onRetry:noop}),h('div',{className:'overview-main-grid'},h(TargetPacingSection,{pacing,selectedScenario:'base',onSelectScenario:noop,status:'ready',error:null,onRetry:noop}),h(OverviewFunnel,{stages,onSelectStage:noop,cashOutcome:{collectedCashFormatted:'₹1.01L'} as any,onInspectCashOutcome:noop})),h('div',{className:'overview-main-grid'},h(NeedsAttentionQueueSection,{items:attention,status:'ready',error:null,onRetry:noop}),h(OverviewCampaignHighlights,{campaigns,onOpen:noop,onViewAll:noop}))));}
test('[MOCKED] Overview uses source values, labels signed pacing truthfully and keeps real inspection controls',()=>{
 const html=renderToStaticMarkup(layout());assert.match(html,/₹1.01L/);assert.match(html,/₹2.04L/);assert.match(html,/Signed commitments against weekly targets/);assert.match(html,/Primary workspace navigation/);assert.match(html,/Payment details/);assert.match(html,/Full|View all/);assert.doesNotMatch(html,/NaN|Infinity/);
 if(existsSync('dist/assets')){const css=readdirSync('dist/assets').filter(f=>f.endsWith('.css')).map(f=>readFileSync('dist/assets/'+f,'utf8')).join('');const doc='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOCKED Overview layout review</title><style>'+css+'</style></head><body>'+html+'</body></html>';console.log('MOCKED_OVERVIEW_HTML:'+gzipSync(doc).toString('base64'));}
});
test('[MOCKED] missing weekly values remain unavailable and do not become a fabricated trend',()=>{
 const html=renderToStaticMarkup(h(TargetPacingSection,{pacing:{...pacing,weeklyMilestones:weeks.map(w=>({...w,actualValue:null,baseTargetValue:null,planTargetValue:null}))},selectedScenario:'base',onSelectScenario:noop,status:'ready',error:null,onRetry:noop}));assert.match(html,/Weekly pacing history is unavailable/);assert.doesNotMatch(html,/<svg/);
});

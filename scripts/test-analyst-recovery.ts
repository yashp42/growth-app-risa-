import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerConfig } from '../server/config.ts';
import { createOpenRouterClient } from '../server/llm/openrouter.ts';
import { metricFallback } from '../server/llm/metricFallback.ts';
import { fetchCampaignReferences } from '../src/services/campaignReferences.ts';

for(const failure of ['timeout','network','empty'] as const){
  test('[MOCKED] '+failure+' recovers through another free model within the attempt cap',async()=>{
    let calls=0;
    const config=loadServerConfig({OPENROUTER_API_KEY:'mock-key',APP_ENV:'demo',NODE_ENV:'test'} as NodeJS.ProcessEnv);
    const client=createOpenRouterClient(config,{startBackgroundRefresh:false,fetchFn:async(input)=>{
      if(!String(input).endsWith('/chat/completions'))return new Response(JSON.stringify({data:{free_model_daily_requests:{limit:50,remaining:50}}}),{status:200});
      calls++;
      if(calls===1){if(failure==='timeout')throw new DOMException('Timed out','AbortError');if(failure==='network')throw Error('Network interrupted');return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:''}}]}),{status:200});}
      return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'A concise recommendation and rationale.'}}]}),{status:200});
    }});
    try{const result=await client.createChatCompletion({messages:[{role:'user',content:'Explain the results'}],maxAttempts:3});assert.equal(calls,2);assert.equal(result.requestAttempts,2);assert.equal(result.usedFallback,true);assert.match(result.message.content!,/recommendation/);}finally{client.stop();}
  });
}

test('[MOCKED] unavailable metric synthesis uses source values without raw technical columns',()=>{
  const summary=metricFallback([{rows:[{metric_id:'M-01',value:12345,unit:'INR',computable:true}]},{rows:[{metric_id:'M-02',value:98765,unit:'INR',computable:true}]}]);
  assert.match(summary!,/12,345/);assert.match(summary!,/98,765/);assert.match(summary!,/not collected cash/);assert.doesNotMatch(summary!,/numerator|denominator|metric_id|\|/);
  assert.equal(metricFallback([{rows:[{metric_id:'M-01',value:12345,unit:'INR',computable:false}]}]),null);
  assert.equal(metricFallback([{rows:[{metric_id:'M-07',value:12345,unit:'INR',computable:true}]},{rows:[{sponsor_name:'Current sponsor',outstanding:12345}]}]),null,'List questions must retain the actual sponsor records');
});

test('[MOCKED] campaign reference IDs come from the server; failures do not restore hard-coded IDs',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async input=>new Response(JSON.stringify(String(input).includes('/channels')?{channels:[{channel_id:'ACTUAL-CREATOR-9',name:'Creator referral',is_active:true}]}:{bets:[{bet_id:'ACTUAL-BET-2',name:'Current bet'}]}),{status:200});
    const refs=await fetchCampaignReferences('ED-2026-DEMO','simulated');assert.equal(refs.channels[0].channel_id,'ACTUAL-CREATOR-9');assert.equal(refs.bets[0].bet_id,'ACTUAL-BET-2');
    globalThis.fetch=async()=>new Response('{}',{status:503});await assert.rejects(fetchCampaignReferences('ED-2026-DEMO','simulated'),/Could not load/);
  }finally{globalThis.fetch=original;}
});

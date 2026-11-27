// Read-only provider health: no model inference and no operational fixture writes.
const base = 'https://sponsorship-growth-platform.onrender.com';
const authResponse = await fetch(base+'/api/auth/demo', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(55000)});
if(!authResponse.ok)throw Error('Demo sign-in failed: '+authResponse.status);
const auth = await authResponse.json();
const response = await fetch(base+'/api/admin/health', {headers:{Authorization:'Bearer '+auth.access_token},signal:AbortSignal.timeout(55000)});
if(!response.ok)throw Error('Provider health failed: '+response.status);
const health = await response.json();
const llm=health.llm??{};
console.log(JSON.stringify({configured:llm.api_key_configured,groq_configured:llm.groq_key_configured,verified:llm.free_tier_verified,verification_error:llm.verification_error,primary:llm.primary_model,fallback:llm.fallback_model,quota:llm.quota,providers:llm.providers},null,2));
if(process.argv.includes('--probe')){
  const as_of=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  for(const question of ['How should I structure a sponsorship follow-up email?', 'Compare signed sponsorship value and cash collected, explain the distinction and suggest the next operational step.']){
    const r=await fetch(base+'/api/ai/ask',{method:'POST',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({question,edition_id:'ED-2026-DEMO',record_class:'simulated',as_of}),signal:AbortSignal.timeout(100000)});
    const p=await r.json();
    console.log(JSON.stringify({probe:question,status:r.status,generation:p.generation_status,reason:p.generation_fallback_reason,model:p.model_id,usage:p.token_usage,verified:p.answer_check_passed,answer_preview:String(p.answer??'').slice(0,500)}));
  }
}
export {};

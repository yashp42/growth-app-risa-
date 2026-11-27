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
export {};

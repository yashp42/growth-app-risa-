export function readDailyFreeQuota(data:Record<string,unknown>){
  const daily=data.free_model_daily_requests;
  if(!daily||typeof daily!=='object')return {limit:null,remaining:null,used:null,exhausted:false};
  const r=daily as Record<string,unknown>;
  const count=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&Number.isInteger(v)?Math.max(0,v):null;
  const limit=count(r.limit);const remaining=count(r.remaining);const used=count(r.used)??(limit!==null&&remaining!==null?Math.max(0,limit-remaining):null);
  return {limit,remaining,used,exhausted:remaining!==null&&remaining<=0};
}
export function providerOrder<T extends {provider:'groq'|'openrouter'}>(entries:T[],order:'groq_first'|'openrouter_first'):T[]{
  const first=order==='openrouter_first'?'openrouter':'groq';return [...entries].sort((a,b)=>Number(b.provider===first)-Number(a.provider===first));
}

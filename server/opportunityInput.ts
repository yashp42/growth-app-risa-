/** Preserve form-entered starting values while supporting existing flat API clients. */
export function opportunityStart(raw:Record<string,unknown>){
 const value=raw.initial_stage;
 if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('initial_stage must be an object.');
 const nested=(value??{}) as Record<string,unknown>;
 const choose=(camel:string,snake:string)=>{
  const flat=raw[camel]!==undefined?raw[camel]:raw[snake];const inside=nested[snake]!==undefined?nested[snake]:nested[camel];
  if(flat!==undefined&&inside!==undefined&&String(flat)!==String(inside))throw Error(`Conflicting ${snake} values in the request.`);
  return flat!==undefined?flat:inside;
 };
 return {stage:nested.stage??'prospecting',ownerMemberId:choose('ownerMemberId','owner_member_id'),proposedValue:choose('proposedValue','proposed_value')};
}

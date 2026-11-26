import { timingSafeEqual } from 'node:crypto';
export function isGreeting(question:string):boolean{return /^(?:hi|hello|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(question.trim());}
export function requestBudget(actorId:string,address:string,environment:string,expectedToken?:string,suppliedToken?:string){
  const a=Buffer.from(expectedToken??'');const b=Buffer.from(suppliedToken??'');
  const evaluation=a.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
  return {key:evaluation?'evaluation:'+actorId:'reviewer:'+actorId+':'+address,limit:evaluation?300:environment==='demo'?60:15,evaluation};
}

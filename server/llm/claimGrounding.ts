import { extractNumericClaims, verifyAnswerNumbers, type AnswerCheckResult, type GroundingSourceBundle } from './answerCheck.ts';
type Row = Record<string, unknown>;
export interface ClaimScope { editionId: string; recordClass: string; asOf: string }
const object = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x);
const label = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
/** Additional checks for structured financial evidence. This is not a general semantic truth oracle. */
export function verifyScopedAnswer(answer: string, bundle: GroundingSourceBundle, scope: ClaimScope): AnswerCheckResult {
  const numeric = verifyAnswerNumbers(answer, bundle);
  const failures: string[] = [];
  const results = bundle.toolResults.filter(object);
  for(const p of results) {
    if(p.record_class === 'knowledge_base' || p.edition_id === 'ALL') continue;
    if(p.edition_id && p.edition_id !== scope.editionId && answer.includes(String(p.edition_id)) === false) failures.push('Evidence belongs to another edition');
    if(p.as_of && p.as_of!==scope.asOf && !answer.includes(String(p.as_of)) && p.edition_id===scope.editionId)failures.push('Evidence belongs to another as-of date');
    if(p.edition_id === scope.editionId && p.record_class && p.record_class !== scope.recordClass) failures.push('Evidence belongs to another dataset class');
  }
  const metrics = results.flatMap(p => Array.isArray(p.rows) ? p.rows.filter(object).filter(r=>typeof r.metric_id==='string' && 'computable' in r) : []);
  // A cited financial metric must support the numbers in that sentence, not merely elsewhere in the turn.
  for(const sentence of answer.split(/\n|(?<=[.!?])\s+(?=[A-Z])/)) {
    const ids = sentence.match(/\[M-\d{2}\]/g) ?? [];
    if(ids.length === 1 && extractNumericClaims(sentence).some(c=>c.kind==='currency')) {
      const id=ids[0].slice(1,-1), matching=metrics.filter(r=>r.metric_id===id && r.computable===true);
      if(matching.length && !verifyAnswerNumbers(sentence,{toolResults:matching.map(r=>({value:r.value,unit:r.unit})),knowledgeTexts:[],userQuestion:''}).passed) failures.push('Amount does not match its cited metric');
    }
    for(const p of results.filter(r=>r.kind==='sponsor_metrics' && Array.isArray(r.rows))) {
      const rows=(p.rows as unknown[]).filter(object);
      const named=rows.filter(r=>typeof r.sponsor_name==='string' && label(sentence).includes(label(r.sponsor_name)));
      if(named.length===1 && extractNumericClaims(sentence).some(c=>c.kind==='currency') && !verifyAnswerNumbers(sentence,{toolResults:[{value:named[0].value}],knowledgeTexts:[],userQuestion:''}).passed) failures.push('Amount does not match its named sponsor');
    }
  }
  return failures.length ? {...numeric,passed:false,warningMessage:[numeric.warningMessage,...new Set(failures)].filter(Boolean).join('; ')} : numeric;
}

/** Only database-labelled values are restated; no ranking, arithmetic or forecast is invented. */
export function verifiedFactsFallback(bundle: GroundingSourceBundle): string {
  const lines:string[]=[];
  const names:Record<string,string>={'M-01':'Cash collected','M-02':'Signed sponsorship value','M-03':'Signed cash','M-04':'In-kind value','M-07':'Outstanding cash','M-21':'Open pipeline value'};
  for(const p of bundle.toolResults.filter(object)) {
    if(!Array.isArray(p.rows))continue;
    for(const r of p.rows.filter(object)) {
      if(r.computable===true && typeof r.metric_id==='string' && names[r.metric_id] && r.value!=null && Number.isFinite(Number(r.value))) lines.push(names[r.metric_id]+': **₹'+Number(r.value).toLocaleString('en-IN')+'** ['+r.metric_id+']');
    }
    if(p.kind==='sponsor_metrics') {
      const r=p.rows.filter(object)[0];
      if(r && Number.isFinite(Number(r.value)))lines.push(String(p.title??'Sponsor ranking')+': **'+String(r.sponsor_name)+' — ₹'+Number(r.value).toLocaleString('en-IN')+'**. [sponsor_metrics:'+String(p.metric_id)+']');
    }
  }
  const facts=[...new Set(lines)].slice(0,6);
  return facts.length ? 'I could verify these facts:\n\n'+facts.join('\n\n')+'\n\nThe available evidence does not support the additional explanation. See the sources for scope and details.' : 'I do not have enough verified evidence to answer that reliably. The available source records are shown below; please specify the sponsor, campaign or measure you want to investigate.';
}

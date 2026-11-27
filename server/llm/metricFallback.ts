const LABELS: Record<string,string> = {
  'M-01':'Cash collected', 'M-02':'Signed sponsorship value', 'M-03':'Signed cash value',
  'M-04':'In-kind value', 'M-07':'Outstanding cash', 'M-09':'Confirmed partnerships', 'M-21':'Open pipeline value',
};
/** Plain-language fallback from exact source values, never a substitute for model reasoning. */
export function metricFallback(results: unknown[]): string | null {
  const lines: string[]=[];
  const seen=new Set<string>();
  for(const raw of results){
    if(!raw||typeof raw!=='object')continue;
    const p=raw as Record<string,unknown>;
    const rows=Array.isArray(p.rows)?p.rows:[p];
    for(const row of rows){
      if(!row||typeof row!=='object')continue;
      const r=row as Record<string,unknown>, id=String(r.metric_id??'');
      if(!LABELS[id]||seen.has(id)||r.computable!==true||r.value===null||r.value===undefined||r.value==='')continue;
      const value=Number(r.value); if(!Number.isFinite(value))continue;
      const money=['INR','\u20b9'].includes(String(r.unit));
      if(!money&&id!=='M-09')continue;
      seen.add(id);lines.push('**'+LABELS[id]+': '+(money?'\u20b9':'')+value.toLocaleString('en-IN',{maximumFractionDigits:2})+'**.');
    }
  }
  if(!lines.length)return null;
  const distinction=seen.has('M-01')&&(seen.has('M-02')||seen.has('M-03'))
    ? 'Signed commitments are not collected cash. Review outstanding payments before treating commitments as available funds.' : '';
  return lines.slice(0,4).join(' ')+'\n\n'+(distinction?distinction+' ':'')+'The AI explanation is temporarily unavailable; these figures are verified.';
}

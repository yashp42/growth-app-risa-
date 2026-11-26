/** A small business task plan. No SQL, metric values or write payloads are inferred here. */
export interface QuestionPlan {
  task: 'prospects' | 'pipeline' | 'finance' | 'diagnosis' | 'knowledge' | 'action' | 'general';
  question: string;
  retrievalQuery: string;
  includeHistory: boolean;
  needsClarification: boolean;
}
const writes = /\b(create|assign|update|delete|move|log|record|confirm|schedule|add task|send)\b/i;
export function planQuestion(question: string, previous = ''): QuestionPlan {
  const q = question.trim();
  const followup = /^(?:and |what about |how about |why |which of (?:those|them)|what should we do next|what next|tell me more|what is their|what's their)/i.test(q);
  // Previous user wording supplies intent only; it never supplies facts or values.
  const context = followup && previous ? previous + ' ' + q : q;
  const recommendation = /\b(prioriti[sz]e|pursue|approach|focus|target|potential|promising|recommend|outreach)\b/i.test(context);
  const research = /\b(prospects?|research|new sponsors?|potential sponsors?|promising sponsors?)\b/i.test(context);
  const pipeline = /\b(pipeline|open (?:deals?|opportunit)|existing|current opportunities|follow[- ]?up|stalled)\b/i.test(context);
  const task = writes.test(q) ? 'action' : research || (recommendation && /\b(sponsors?|companies|brands?|who|them|those)\b/i.test(context) && !pipeline) ? 'prospects' : pipeline ? 'pipeline' : /\b(bottleneck|underperform|scale|stop|change|why|diagnos)\b/i.test(context) ? 'diagnosis' : /\b(cash|collected|signed|unpaid|money|receiv|sponsorship)\b/i.test(context) ? 'finance' : /\b(strategy|assumption|source|evidence|definition)\b/i.test(context) ? 'knowledge' : 'general';
  const includeHistory = /\b(superseded|contradict|changed from|old decision|decision history|previous decision)\b/i.test(context);
  const query = task === 'prospects' ? context + ' prospect prioritisation attractiveness accessibility verified route cash in kind research' : context;
  return {task, question: q, retrievalQuery: query.slice(0, 240), includeHistory, needsClarification: recommendation && !research && !pipeline && !/\b(sponsors?|companies|brands?)\b/i.test(context)};
}

export function relevantToolNames(plan: QuestionPlan): Set<string> | null {
  if (plan.task === 'action' || plan.task === 'general') return null;
  const shared = ['search_knowledge','get_dataset','list_datasets'];
  if(plan.task === 'prospects') return new Set([...shared,'get_register','list_records']);
  if(plan.task === 'knowledge') return new Set([...shared,'get_register','get_scenario']);
  return new Set([...shared,'get_metric','get_series','get_sponsor_metrics','get_register','get_scenario','list_records','set_view']);
}

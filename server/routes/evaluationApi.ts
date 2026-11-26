import { Router } from 'express';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireResolvedRoles, type AuthDependencies } from '../auth.ts';
import type { ServerConfig } from '../config.ts';
import type { DatabasePoolState } from '../db.ts';
import { AppApiError, asyncHandler } from '../errors.ts';
import { parseCsv } from '../../scripts/lib/retrievalMetrics.ts';
import { runRetrievalEvaluation } from '../../scripts/eval-retrieval.ts';
import { caseEdition, selectCases, runEvaluationCases, evaluationSummary, reportMarkdown, type EvalSet, type EvaluationRun, type EvalCase } from '../evaluation.ts';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const DIR=path.join(ROOT,'eval/results');
const Body=z.object({set:z.enum(['gate','full','retrieval']),resume:z.boolean().optional().default(false)}).strict();

export function createEvaluationApiRouter(config:ServerConfig,dbState:DatabasePoolState,auth:AuthDependencies){
  const router=Router(); let active:EvaluationRun|null=null;let retrievalReport:unknown=null;
  const filename=(set:EvalSet)=>path.join(DIR,'latest-'+set+'.json');
  function persist(run:EvaluationRun){mkdirSync(DIR,{recursive:true});const file=filename(run.set);writeFileSync(file+'.tmp',JSON.stringify(run,null,2));renameSync(file+'.tmp',file);writeFileSync(file.replace(/\.json$/,'.md'),reportMarkdown(run));}
  function load(set:EvalSet):EvaluationRun|null{try{return JSON.parse(readFileSync(filename(set),'utf8'));}catch{return null;}}
  const pool=()=>{if(!dbState.pool)throw new AppApiError(503,'DATABASE_UNAVAILABLE','Evaluation needs the database');return dbState.pool;};
  router.use('/admin/eval',requireAuth(auth),requireResolvedRoles(auth),(req,_res,next)=>{
    const roles=req.resolvedMember?.roles??[];
    if(!roles.includes('admin')&&!roles.includes('coordination_lead'))return next(new AppApiError(403,'FORBIDDEN','Requires coordination_lead or admin'));
    next();
  });
  router.post('/admin/eval/run',asyncHandler(async(req,res)=>{
    const parsed=Body.safeParse(req.body);if(!parsed.success)throw new AppApiError(400,'INVALID_ARGUMENT','Expected set: gate, full or retrieval; resume: boolean');
    if(active?.state==='running')throw new AppApiError(409,'EVALUATION_RUNNING','An evaluation is already running');
    const {set,resume}=parsed.data;
    // Full runs exercise action proposals: shared live/production data is excluded.
    if(set!=='retrieval'&&config.appEnv!=='demo')throw new AppApiError(409,'DEMO_REQUIRED','Run analyst evaluation only on the simulated demo service');
    pool();
    const cases:EvalCase[]=set==='retrieval'?[]:selectCases([
      ...parseCsv(readFileSync(path.join(ROOT,'eval/chatbot_test_bank.csv'),'utf8')),
      ...parseCsv(readFileSync(path.join(ROOT,'eval/stage4_extra_cases.csv'),'utf8')),
    ],set);
    const previous=resume?load(set):null;
    if(resume&&!previous)throw new AppApiError(404,'NO_CHECKPOINT','No checkpoint to resume for this set');
    if(previous?.state==='completed')throw new AppApiError(409,'EVALUATION_COMPLETE','This run is complete; start a new run');
    if(previous?.state==='running'||previous?.state==='error')throw new AppApiError(409,'REVIEW_INTERRUPTED_RUN','Review the interrupted or failed run before starting a new evaluation');
    const run:EvaluationRun=previous??{label:'LIVE',set,state:'running',started_at:new Date().toISOString(),updated_at:new Date().toISOString(),current_case:null,results:[],conversations:{},requests_used:0,remaining:cases.map(c=>c.test_id)};
    run.state='running';active=run;persist(run);
    // Fixed loopback origin: never accept a URL, token or actor from the request body.
    const origin='http://127.0.0.1:'+config.port;
    setImmediate(()=>{void (async()=>{
      if(set==='retrieval'){
        const result=await runRetrievalEvaluation(true);retrievalReport=result;
        writeFileSync(path.join(DIR,'latest-retrieval-details.json'),JSON.stringify(result,null,2));
        run.state='completed';persist(run);return;
      }
      const login=await fetch(origin+'/api/auth/demo',{method:'POST',signal:AbortSignal.timeout(30000)});
      const session=await login.json() as {access_token?:string};
      if(!login.ok||!session.access_token)throw new Error('Demo authentication failed');
      const token=session.access_token;
      const request=async(url:string,body:unknown)=>{
        const response=await fetch(origin+url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(600000)});
        return {status:response.status,body:await response.json() as Record<string,any>,retryAfter:Number(response.headers.get('retry-after')??0)};
      };
      const snapshot=async()=>{
        const hashes:string[]=[];
        for(const table of ['task','opportunity','opportunity_stage_version','contract','contract_line']){
          // Table names above are a constant allowlist, never model/user supplied.
          const result=await pool().query<{hash:string}>('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,\'[]\')) AS hash FROM public.'+table+' t');hashes.push(result.rows[0].hash);
        }return hashes.join(':');
      };
      await runEvaluationCases(cases,run,{
        persist,snapshot,
        ask:async(c,conversation)=>request('/api/ai/ask',{
          question:c.user_query,conversation_id:conversation,
          edition_id:caseEdition(c),
          as_of:caseEdition(c)==='ED-2026-DEMO'?'2026-11-26':'2025-04-20',
        }),
        cleanup:async(body)=>{
          if(!body.query_id)return !(body.actions??[]).length;
          const proposed=await pool().query<{ai_action_id:string;status:string}>(
            'SELECT ai_action_id,status,action_type,payload,payload_sha256 FROM public.ai_action WHERE query_id=$1 AND NOT is_deleted',[body.query_id]);
          // Inspect authoritative stored proposals, not only the response's action array.
          body.actions=proposed.rows;
          let clean=true;
          for(const action of proposed.rows){
            if(action.status==='executed'){clean=false;continue;}
            if(action.status==='proposed'){
              const cancelled=await request('/api/actions/'+encodeURIComponent(action.ai_action_id)+'/cancel',{});
              if(cancelled.status!==200)clean=false;
            }
          }
          const remaining=await pool().query<{status:string}>('SELECT status FROM public.ai_action WHERE query_id=$1 AND NOT is_deleted',[body.query_id]);
          return clean&&remaining.rows.every(r=>r.status==='rejected');
        },
      });
    })().catch(()=>{run.state='error';run.error='Evaluation failed; check the server logs and review pending evaluation proposals before restarting.';persist(run);});});
    res.status(202).json({state:run.state,set:run.set,started_at:run.started_at});
  }));
  router.get('/admin/eval/status',asyncHandler(async(req,res)=>{
    const set=z.enum(['gate','full','retrieval']).safeParse(req.query.set??active?.set??'gate');
    if(!set.success)throw new AppApiError(400,'INVALID_ARGUMENT','Unknown evaluation set');
    const run=active?.set===set.data?active:load(set.data);
    res.json(run?{...run,summary:evaluationSummary(run)}:{state:'idle',set:set.data});
  }));
  router.get('/admin/eval/report',asyncHandler(async(req,res)=>{
    const set=z.enum(['gate','full','retrieval']).safeParse(req.query.set??active?.set??'gate');
    if(!set.success)throw new AppApiError(400,'INVALID_ARGUMENT','Unknown evaluation set');
    const run=active?.set===set.data?active:load(set.data);
    if(!run)throw new AppApiError(404,'NO_REPORT','No evaluation report yet');
    if(set.data==='retrieval'){
      if(!retrievalReport){try{retrievalReport=JSON.parse(readFileSync(path.join(DIR,'latest-retrieval-details.json'),'utf8'));}catch{}}
      res.json({run,retrieval:retrievalReport});return;
    }
    res.json({run,summary:evaluationSummary(run),markdown:reportMarkdown(run)});
  }));
  return router;
}

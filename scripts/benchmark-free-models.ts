/** LIVE provider calls against SYNTHETIC tool-selection tasks; never reads/writes business records.
 * Opt in: npx tsx scripts/benchmark-free-models.ts --run
 * Uses configured primary/fallback IDs and at most one inference request per case/model.
 */
import { loadServerConfig } from '../server/config.ts';
import { createOpenRouterClient } from '../server/llm/openrouter.ts';
import { READ_TOOL_DEFINITIONS, SponsorMetricsArgsSchema, GetRegisterArgsSchema, ListRecordsArgsSchema } from '../server/llm/tools.ts';
const cases=[
 {question:'Which sponsor has actually paid us the most?',tool:'get_sponsor_metrics',check:(a:any)=>SponsorMetricsArgsSchema.safeParse(a).success&&a.metric_id==='M-01'},
 {question:'Which company owes the largest unpaid balance?',tool:'get_sponsor_metrics',check:(a:any)=>SponsorMetricsArgsSchema.safeParse(a).success&&a.metric_id==='M-07'},
 {question:'Any high potential sponsor we should focus on currently?',tool:'get_register',check:(a:any)=>GetRegisterArgsSchema.safeParse(a).success&&a.kind==='prospects'},
 {question:'Show open opportunities, at most 25 records.',tool:'list_records',check:(a:any)=>ListRecordsArgsSchema.safeParse(a).success&&a.kind==='opportunities'&&(a.limit??15)<=25},
];
if(!process.argv.includes('--run')){console.log('No requests sent. Pass --run to benchmark configured free models with synthetic questions.');process.exit(0);}
const config=loadServerConfig();
const candidates=[...new Set([config.openrouterModel,config.openrouterModelFallback].filter((x):x is string=>Boolean(x)))];
if(!config.openrouterApiKey)throw new Error('OPENROUTER_API_KEY is required on the server; never paste it into chat.');
for(const model of candidates){
 const client=createOpenRouterClient({...config,groqApiKey:null,openrouterModel:model,openrouterModelFallback:model},{startBackgroundRefresh:false});
 let passed=0;const results:Record<string,unknown>[]=[];
 try{for(const c of cases){const start=Date.now();try{
  const out=await client.createChatCompletion({maxAttempts:1,messages:[{role:'system',content:'Select exactly one correct read tool. Potential/research prospects use get_register kind=prospects. Cash collected and unpaid sponsor ranks use get_sponsor_metrics. Do not invent an answer. Follow every tool schema.'},{role:'user',content:c.question}],tools:READ_TOOL_DEFINITIONS.filter(t=>['get_sponsor_metrics','get_register','list_records'].includes(t.function.name))});
  const calls=out.message.tool_calls??[];let ok=false;try{ok=calls.length===1&&calls[0].function.name===c.tool&&c.check(JSON.parse(calls[0].function.arguments));}catch{}
  if(ok)passed++;results.push({question:c.question,passed:ok,latency_ms:Date.now()-start,usage:out.usage,requests:out.requestAttempts});
 }catch{results.push({question:c.question,passed:false,provider_error:true,latency_ms:Date.now()-start});}}
 }finally{client.stop();}
 console.log(JSON.stringify({label:'LIVE_PROVIDER_SYNTHETIC_TASKS',model,passed,total:cases.length,results}));
}

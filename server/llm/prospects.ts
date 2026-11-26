import type { DatasetArgs, ReferenceContext } from './referenceData.ts';
import type { QueryablePool } from './tools.ts';
import { getDataset } from './referenceData.ts';
export interface ProspectFilters { company?: string; category?: string; action?: string; verified_route?: boolean }
const normal = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
 company: ['company','company_name','brand','brand_name','sponsor','prospect'],
 category: ['category','sector','industry'],
 action: ['action','recommended_action','action_code','recommendation'],
 route: ['route_class','route_classification','intro_route_class','route'],
 priority: ['priority_index','priority_score'],
} as const;
function column(columns: string[], kind: keyof typeof aliases): string {
 const key=columns.find(c=>aliases[kind].some(a=>normal(a)===normal(c)));
 if(!key)throw new Error('Prospect register has no recognised '+kind+' column; inspect the source schema.');
 return key;
}
/** Read all visible source rows before filtering, so a page limit cannot omit eligible prospects. */
export async function getProspects(pool: QueryablePool, filters: ProspectFilters, ctx: ReferenceContext): Promise<Record<string,unknown>> {
 const data=await getDataset(pool,{dataset_id:'market_research.prospect_register',limit:50} satisfies DatasetArgs,ctx);
 if(data.available!==true)return data;
 if(data.truncated)throw new Error('Prospect register exceeds the complete-read limit; cannot claim a complete prioritisation.');
 return filterProspects(data,filters);
}
export function filterProspects(data: Record<string,unknown>, filters: ProspectFilters): Record<string,unknown> {
 const columns=data.columns as string[];
 let rows=[...(data.rows as Record<string,unknown>[])];
 if(filters.company){const key=column(columns,'company');rows=rows.filter(r=>normal(r[key])===normal(filters.company));}
 if(filters.category){const key=column(columns,'category');rows=rows.filter(r=>normal(r[key]).includes(normal(filters.category)));}
 if(filters.action){const key=column(columns,'action');rows=rows.filter(r=>normal(r[key]).replace(/^\d+/,'')===normal(filters.action).replace(/^\d+/,''));}
 if(filters.verified_route!==undefined){const key=column(columns,'route');rows=rows.filter(r=>/^V[123](?:\b|$)/i.test(String(r[key]??'').trim())===filters.verified_route);}
 const priority=columns.find(c=>aliases.priority.some(a=>normal(a)===normal(c)));
 if(priority)rows.sort((a,b)=>Number(b[priority]??0)-Number(a[priority]??0));
 return {...data,kind:'prospects',filters,rows,source:'ref.dataset_row',status_label:'External research targets; not operational pipeline or forecast. Verifiable route does not mean an introduction.'};
}

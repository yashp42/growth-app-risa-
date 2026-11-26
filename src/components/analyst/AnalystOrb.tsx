import { motion, useReducedMotion } from 'motion/react';
import { ORB_STATE_LABEL, type OrbState } from '../../lib/orbState';
export interface AnalystOrbProps {
 state:OrbState;level?:number;size?:number;statusText?:string|null;transcript?:string|null;showCaption?:boolean;
 onActivate?:()=>void;onToggleMic?:()=>void;ariaLabel?:string;className?:string;decorative?:boolean;
}
/** A quiet material sphere. Motion uses transforms and opacity, never layout or animated blur. */
export function AnalystOrb({state,level=0,size=80,statusText,transcript,showCaption=false,onActivate,onToggleMic,ariaLabel='Growth Analyst',className='',decorative=false}:AnalystOrbProps){
 const reduce=useReducedMotion()??false;
 const active=state==='listening'||state==='speaking';
 const ring=state==='confirm'?'#B88125':state==='error'?'#B44B40':active?'#5A9574':'transparent';
 const caption=state==='listening'?(transcript||'Listening…'):state==='thinking'?(statusText||'Looking into it…'):state==='speaking'?'Speaking…':state==='confirm'?'Review the proposed change':state==='error'?(statusText||'Something went wrong'):'Ask by voice';
 const sphere=<>
  <motion.span aria-hidden="true" className="pointer-events-none absolute inset-[-12%] rounded-full border" style={{borderColor:ring}} animate={{scale:reduce?1:state==='listening'?1+Math.min(1,Math.max(0,level))*.13:1,opacity:active||state==='confirm'||state==='error'?1:0}} transition={{duration:reduce?0:.14}}/>
  <motion.span aria-hidden="true" className="absolute inset-0 block overflow-hidden rounded-full" style={{background:'radial-gradient(circle at 30% 24%, #C1DEC7, #699A7E 33%, #285C45 68%, #183B2D)',boxShadow:'inset 0 0 0 1px #FFFFFF40, inset -5px -8px 16px #12302228, 0 4px 12px #244C3820'}} animate={reduce?{scale:1}:state==='listening'?{scale:1+Math.min(1,Math.max(0,level))*.16}:state==='speaking'?{scale:[.98,1.025,.98]}:{scale:1}} transition={{duration:reduce?0:state==='speaking'?2:.15,repeat:!reduce&&state==='speaking'?Infinity:0}}>
   <motion.span className="absolute inset-[-20%] rounded-full" style={{background:'radial-gradient(ellipse at 28% 30%, #FFFFFF85, transparent 45%), radial-gradient(ellipse at 70% 80%, #9AC6C540, transparent 50%)',filter:'blur(5px)',mixBlendMode:'screen'}} animate={reduce?{rotate:0}:state==='thinking'?{rotate:360}:{rotate:0}} transition={{duration:reduce?0:5,repeat:!reduce&&state==='thinking'?Infinity:0,ease:'linear'}}/>
  </motion.span>
 </>;
 return <span className={`inline-flex flex-col items-center ${className}`}>
  {decorative?<span aria-hidden="true" data-orb-state={state} className="relative inline-block shrink-0 rounded-full" style={{width:size,height:size}}>{sphere}</span>:<button type="button" data-orb-state={state} className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[var(--color-accent)]" style={{width:size,height:size}} aria-label={`${ariaLabel}: ${ORB_STATE_LABEL[state]}`} title="Ask or speak" onClick={onActivate} onKeyDown={e=>{if(e.code==='Space'){e.preventDefault();onToggleMic?.();}}}>{sphere}</button>}
  {showCaption?<span className="mt-5 max-w-md text-center text-sm text-[var(--color-ink-muted)]">{caption}</span>:null}
  {!decorative?<span className="sr-only" aria-live="polite" aria-atomic="true">{ORB_STATE_LABEL[state]}</span>:null}
 </span>;
}

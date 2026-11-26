import { useId, type CSSProperties } from 'react';
import type { OrbState } from '../../lib/orbState';

/** Decorative SVG: only the listening deformation represents measured microphone level.
 * Speech synthesis exposes activity, not a playback amplitude stream. Its ribbons are ambient motion.
 */
export function VoiceOrb({state,level=0,paused=false}:{state:OrbState;level?:number;paused?:boolean}) {
 const id=useId().replace(/:/g,'');
 const amplitude=state==='listening'&&!paused?Math.max(0,Math.min(1,level)):0;
 return <div className="voice-orb" data-state={paused?'paused':state} aria-hidden="true" style={{'--voice-level':amplitude} as CSSProperties}>
  <div className="voice-orb-aura"/>
  <svg viewBox="0 0 400 400" className="voice-orb-sphere" focusable="false">
   <defs>
    <radialGradient id={`${id}-body`} cx="36%" cy="20%" r="89%"><stop stopColor="#a5f7d4" stopOpacity=".6"/><stop offset=".35" stopColor="#348b73" stopOpacity=".16"/><stop offset=".64" stopColor="#083e33" stopOpacity=".78"/><stop offset=".89" stopColor="#45dda0" stopOpacity=".66"/><stop offset="1" stopColor="#d3ffe6"/></radialGradient>
    <radialGradient id={`${id}-shine`} cx="32%" cy="3%" r="87%"><stop stopColor="#edfff3" stopOpacity=".91"/><stop offset=".25" stopColor="#9effd4" stopOpacity=".2"/><stop offset=".65" stopColor="#1e6c53" stopOpacity="0"/><stop offset="1" stopColor="#afffcf" stopOpacity=".7"/></radialGradient>
    <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c6ffe0" stopOpacity=".85"/><stop offset=".5" stopColor="#73f1bb" stopOpacity=".32"/><stop offset="1" stopColor="#2cd99a" stopOpacity=".03"/></linearGradient>
    <linearGradient id={`${id}-edge`} x1="0" x2=".7" y2="1"><stop stopColor="#effff6"/><stop offset=".4" stopColor="#9cffe0" stopOpacity=".45"/><stop offset="1" stopColor="#c6ffd4"/></linearGradient>
    <clipPath id={`${id}-clip`}><circle cx="200" cy="200" r="181"/></clipPath>
   </defs>
   <circle cx="200" cy="200" r="181" fill={`url(#${id}-body)`}/>
   <g clipPath={`url(#${id}-clip)`}>
    <g className="voice-orb-ribbon voice-orb-ribbon-one"><path d="M-85 216 C 18 140, 66 165, 126 218 S 221 282, 280 211 S 366 137, 487 219 L487 322 C365 215,286 285,211 246 S77 194,-85 291Z" fill={`url(#${id}-ribbon)`}/><path d="M-85 216 C18 140,66 165,126 218 S221 282,280 211 S366 137,487 219" fill="none" stroke="#c7ffe3" strokeOpacity=".73" strokeWidth="1.4"/></g>
    <g className="voice-orb-ribbon voice-orb-ribbon-two"><path d="M-85 241 C21 292, 88 264, 157 207 S253 171,315 222 S406 279,487 206 L487 313 C362 330,276 220,198 240 S57 301,-85 273Z" fill={`url(#${id}-ribbon)`}/><path d="M-85 241 C21 292,88 264,157 207 S253 171,315 222 S406 279,487 206" fill="none" stroke="#a5ffe0" strokeOpacity=".64" strokeWidth="1.1"/></g>
   </g>
   <circle cx="200" cy="200" r="181" fill={`url(#${id}-shine)`}/>
   <circle cx="200" cy="200" r="181" fill="none" stroke={`url(#${id}-edge)`} strokeWidth="1.8"/>
   <path d="M57 92 A181 181 0 0 1 323 68" stroke="#e4fff0" strokeOpacity=".72" strokeWidth="2" fill="none"/>
  </svg>
 </div>;
}

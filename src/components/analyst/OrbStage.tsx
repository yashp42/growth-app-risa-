import { Headphones,Square } from 'lucide-react';
import type { OrbState } from '../../lib/orbState';
import { AnalystOrb } from './AnalystOrb';
interface OrbStageProps {state:OrbState;micOn:boolean;steps:string[];transcript:string;errorText?:string|null;onToggleMic:()=>void;onActivate:()=>void;compact?:boolean;onVoiceMode?:()=>void;onStopSpeaking?:()=>void;}
export function OrbStage(p:OrbStageProps){
 return <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-subtle)] px-4 py-3">
  <div className="flex min-w-0 items-center gap-3"><AnalystOrb state={p.state} size={28} onActivate={p.onActivate} onToggleMic={p.onToggleMic}/><span className="truncate text-sm text-[var(--color-ink-muted)]">{p.state==='thinking'?'Looking into it…':p.state==='speaking'?'Reading the answer…':p.state==='listening'?'Voice mode is listening':p.state==='confirm'?'Changes ready for your review':'Your sponsorship thinking partner'}</span></div>
  {p.state==='speaking'?<button type="button" className="icon-button" onClick={p.onStopSpeaking} aria-label="Stop speaking"><Square size={14}/></button>:<button type="button" className="button-secondary" onClick={p.onVoiceMode??p.onToggleMic}><Headphones size={16}/><span className="hidden sm:inline">Voice mode</span></button>}
 </div>;
}

import { useEffect,useRef } from 'react';
import { Mic,MicOff,Square,X } from 'lucide-react';
import { useMicLevel } from '../../hooks/useMicLevel';
import type { OrbState } from '../../lib/orbState';
import { AnalystOrb } from './AnalystOrb';
import { MarkdownAnswer } from './MarkdownAnswer';
interface VoiceModeProps {open:boolean;state:OrbState;listening:boolean;transcript:string;answer:string;error?:string|null;step?:string;onToggleMic:()=>void;onStopSpeaking:()=>void;onClose:()=>void;}
export function VoiceMode(p:VoiceModeProps){
 const supported=typeof window!=='undefined' && Boolean((window as unknown as {SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown}).SpeechRecognition||(window as unknown as {webkitSpeechRecognition?:unknown}).webkitSpeechRecognition);
 const dialog=useRef<HTMLDialogElement>(null);const level=useMicLevel(p.open&&p.listening);
 useEffect(()=>{const d=dialog.current;if(p.open&&!d?.open)d?.showModal();if(!p.open&&d?.open)d.close();},[p.open]);
 return <dialog ref={dialog} className="voice-dialog" aria-labelledby="voice-mode-title" onCancel={e=>{e.preventDefault();p.onClose();}} onClose={()=>{if(p.open)p.onClose();}}>
  <header className="flex items-center justify-between px-6 py-5"><h2 id="voice-mode-title" className="text-sm font-semibold">Growth Analyst · Voice</h2><button type="button" onClick={p.onClose} className="icon-button" aria-label="Close voice mode"><X size={18}/></button></header>
  <div className="flex flex-col items-center gap-7 px-6 pb-8 sm:px-10">
   <div className="py-8"><AnalystOrb decorative={!supported||p.state==='thinking'} state={p.state} level={level} size={116} showCaption onActivate={p.onToggleMic} onToggleMic={p.onToggleMic} statusText={p.state==='error'?p.error:p.step}/></div>
   <div className="voice-transcript w-full text-[var(--color-ink)]" aria-live="polite">{p.listening?(p.transcript||'Start speaking when you’re ready.'):p.state==='thinking'?(p.step||'Looking into your question…'):p.answer?<MarkdownAnswer>{p.answer}</MarkdownAnswer>:'Ask about performance, explore a decision, or prepare a follow-up.'}</div>
   {!supported?<p role="status" className="text-center text-sm text-[var(--color-ink-muted)]">Voice input is unavailable in this browser. Use Chrome or Edge, or continue typing in the conversation.</p>:null}
   {p.error?<p role="alert" className="text-center text-sm text-[#9B3B32]">{p.error?.includes('HTTP')?'The analyst could not complete that request. Return to the conversation for details.':p.error}</p>:null}
   {p.state==='confirm'?<p className="text-center text-sm text-[#8C641D]">A change is ready for review. Return to the conversation to accept or cancel it.</p>:null}
   <div className="flex flex-wrap items-center justify-center gap-3">
    <button type="button" className="button-secondary" onClick={p.onToggleMic} disabled={!supported||p.state==='thinking'} aria-pressed={p.listening}>{p.listening?<MicOff size={18}/>:<Mic size={18}/>} {p.listening?'Pause microphone':'Start microphone'}</button>
    {p.state==='speaking'?<button type="button" className="button-secondary" onClick={p.onStopSpeaking}><Square size={15}/>Stop speaking</button>:null}
    <button type="button" className="button-primary" onClick={p.onClose}>Back to conversation</button>
   </div>
   <p className="text-center text-xs text-[var(--color-ink-subtle)]">Browser voice · No application transcription service</p>
  </div>
 </dialog>;
}

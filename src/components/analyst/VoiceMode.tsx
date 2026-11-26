import { memo,useEffect,useRef,useState,type ReactNode } from 'react';
import { ArrowLeft,AudioLines,ChevronDown,Mic,MicOff,Pause,Play,Square,UserRound,X } from 'lucide-react';
import type { OrbState } from '../../lib/orbState';
import { voicePresentation,voiceTimestamp } from '../../lib/voicePresentation';
import type { AiChatMessage } from '../../types/analyst';
import { LiveVoiceOrb } from './VoiceOrb';
import { MarkdownAnswer } from './MarkdownAnswer';

export interface VoiceModeProps {
 open:boolean;state:OrbState;listening:boolean;transcript:string;answer:string;
 embedded?:boolean;content?:ReactNode;composer?:ReactNode;headerActions?:ReactNode;sidePanel?:ReactNode;onEndVoice?:()=>void;
 messages?:AiChatMessage[];paused?:boolean;error?:string|null;step?:string;
 onToggleMic:()=>void;onTogglePause?:()=>void;onStopSpeaking:()=>void;onClose:()=>void;
}
function ActivityBars({active=false}:{active?:boolean}) {return <span className="voice-activity" data-active={active} aria-hidden="true">{[0,1,2,3,4,5,6].map(n=><i key={n} style={{animationDelay:`${n*-0.13}s`}}/>)}</span>;}
const VoiceHistory=memo(function VoiceHistory({messages}:{messages:AiChatMessage[]}) {
 return <>{messages.map(m=><article className={`voice-message voice-message-${m.role}`} key={m.message_id}><span className="voice-message-avatar" aria-hidden="true">{m.role==='user'?<UserRound size={19}/>:<AudioLines size={20}/>}</span><div className="voice-message-body"><div className="voice-message-meta"><span>{m.role==='user'?'You':'Growth Analyst'}</span>{voiceTimestamp(m.created_at)?<time dateTime={m.created_at}>{voiceTimestamp(m.created_at)}</time>:null}</div><div className="voice-message-content">{m.role==='assistant'?<MarkdownAnswer>{m.content}</MarkdownAnswer>:<p>{m.content}</p>}</div></div></article>)}</>;
});

export function VoiceMode(p:VoiceModeProps) {
 const supported=typeof window!=='undefined'&&Boolean((window as unknown as {SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown}).SpeechRecognition||(window as unknown as {webkitSpeechRecognition?:unknown}).webkitSpeechRecognition);
 const dialog=useRef<HTMLDialogElement>(null),scroll=useRef<HTMLDivElement>(null),closeRef=useRef(p.onClose);
 const followsLatest=useRef(true);const [showLatest,setShowLatest]=useState(false);closeRef.current=p.onClose;
 const paused=Boolean(p.paused);
 const presentation=voicePresentation(p.state,paused,p.listening,supported,p.error);
 const messages=p.messages??(p.answer?[{message_id:'current-answer',role:'assistant' as const,content:p.answer,created_at:''}]:[]);
 useEffect(()=>{
  if(p.embedded)return;
  const d=dialog.current;if(!d)return;
  if(!p.open){if(d.open)d.close();return;}
  const previous=document.activeElement as HTMLElement|null,oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';if(!d.open)d.showModal();followsLatest.current=true;
  return()=>{document.body.style.overflow=oldOverflow;if(d.open)d.close();previous?.focus();};
 },[p.open,p.embedded]);
 useEffect(()=>{
  if(!p.open||!followsLatest.current)return;
  const frame=requestAnimationFrame(()=>{const el=scroll.current;if(el)el.scrollTop=el.scrollHeight;});
  return()=>cancelAnimationFrame(frame);
 },[p.open,p.messages,p.transcript,p.state,p.step]);
 useEffect(()=>{
  if(!p.embedded)return;
  const end=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[aria-modal="true"]'))p.onEndVoice?.();};
  window.addEventListener('keydown',end);return()=>window.removeEventListener('keydown',end);
 },[p.embedded,p.onEndVoice]);
 const jumpToLatest=()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;followsLatest.current=true;setShowLatest(false);};
 const surface=<>
  <div className="voice-atmosphere" aria-hidden="true"><svg className="voice-landscape" viewBox="0 0 1600 400" preserveAspectRatio="none"><defs><linearGradient id="voice-landscape-fill" x2=".3" y2="1"><stop stopColor="#75e0ae" stopOpacity=".28"/><stop offset="1" stopColor="#0a3e32" stopOpacity="0"/></linearGradient></defs><path d="M-100 220 Q90 45 400 250 T1000 260 T1700 110 L1700 420H-100Z" fill="url(#voice-landscape-fill)" stroke="#9bf2ce" strokeOpacity=".18"/><path d="M-80 320 Q220 110 530 300 T1120 220 T1700 280 L1700 420H-80Z" fill="url(#voice-landscape-fill)" stroke="#9bf2ce" strokeOpacity=".12"/><path d="M-100 270 Q180 330 520 340 T1100 300 T1700 220 L1700 420H-100Z" fill="#031e19" fillOpacity=".5"/></svg></div>
  <div className="voice-shell">
   <header className="voice-header">
    <div className="voice-brand"><span className="voice-brand-mark"><AudioLines size={26}/></span><div><div className="voice-title-row"><h2 id="voice-mode-title">Growth Analyst</h2><span className="voice-mode-badge">{p.embedded?'Voice & text':'Voice'}</span></div><p id="voice-mode-description">Your sponsorship intelligence partner</p></div></div>
    <div className="voice-header-actions">{p.headerActions}<button type="button" className="voice-back" onClick={p.onClose} aria-label={p.embedded?'Back to workspace':'Back to conversation'} title={p.embedded?'Back to workspace':'Back to conversation (Esc)'} autoFocus={!p.embedded}><ArrowLeft size={18}/><span>{p.embedded?'Workspace':'Back to conversation'}</span>{!p.embedded?<kbd>Esc</kbd>:null}</button></div>
   </header>
   <main className="voice-main">
    <section className="voice-stage" aria-label="Voice activity">
     <LiveVoiceOrb state={p.state} paused={paused} active={p.open&&p.listening&&!paused}/>
     <div className="voice-stage-copy">
      <span className="voice-status-pill" data-state={paused?'paused':p.state}>{p.listening&&!paused?<Mic size={15}/>:p.state==='speaking'&&!paused?<AudioLines size={15}/>:paused?<Pause size={14}/>:<span className="voice-status-dot"/>}{presentation.label}</span>
      <h1 aria-live="polite" aria-atomic="true">{presentation.title}</h1><p>{presentation.description}</p>
     </div>
    </section>
    <section className="voice-conversation" aria-labelledby="voice-conversation-title">
     <header className="voice-conversation-header"><div><AudioLines size={20}/><h3 id="voice-conversation-title">Live conversation</h3></div><span>{p.listening&&!paused?'Listening live':'Voice session'}</span></header>
     <div ref={scroll} className="voice-conversation-scroll" role="log" aria-label="Voice conversation transcript" aria-live="polite" aria-relevant="additions" tabIndex={0} onScroll={()=>{const el=scroll.current;if(!el)return;followsLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;setShowLatest(!followsLatest.current);}}>
      {p.content??(messages.length?<VoiceHistory messages={messages}/>:<div className="voice-empty"><AudioLines size={28}/><h4>A little space to think out loud.</h4><p>Ask about your campaigns, explore a decision, or pick up where you left off. Your conversation will appear here.</p></div>)}
      {p.listening&&p.transcript&&!paused?<article className="voice-message voice-message-user voice-message-interim" aria-live="off"><span className="voice-message-avatar" aria-hidden="true"><Mic size={19}/></span><div className="voice-message-body"><div className="voice-message-meta"><span>You · live transcript</span><ActivityBars active/></div><div className="voice-message-content"><p>{p.transcript}<span className="voice-transcript-caret" aria-hidden="true"/></p></div></div></article>:null}
      {p.state==='thinking'?<div className="voice-live-status" role="status"><span className="voice-message-avatar"><AudioLines size={20}/></span><p>{p.step||'Looking into your question'}<span className="voice-thinking-dots" aria-hidden="true"><i/><i/><i/></span></p></div>:null}
      {p.state==='speaking'&&!paused?<div className="voice-live-status voice-speaking-status"><span className="voice-message-avatar"><AudioLines size={20}/></span><p>Speaking <ActivityBars active/></p></div>:null}
     </div>
     {p.composer?<div className="voice-composer-slot">{p.composer}</div>:null}
     {showLatest?<button type="button" className="voice-latest" onClick={jumpToLatest}>Latest message <ChevronDown size={15}/></button>:null}
     {p.error?<p className="voice-notice voice-notice-error" role="alert">{p.error.includes('HTTP')||p.error.includes('{')?'The analyst could not complete that request. Return to the conversation for details.':p.error}</p>:null}
     {p.state==='confirm'?<p className="voice-notice" role="status">{p.embedded?'A change is ready. Review the proposal above before accepting or cancelling.':'A change is ready. Return to the conversation to review and accept or cancel it.'}</p>:null}
     {!supported?<p className="voice-notice" role="status">Microphone input needs a browser with speech recognition, such as Chrome or Edge. Your conversation is still available.</p>:null}
    </section>
   </main>
   <footer className="voice-footer">
    <div className="voice-controls" aria-label="Voice controls">
     <div className="voice-control-group"><button type="button" className="voice-control" onClick={p.onTogglePause} disabled={!p.onTogglePause} aria-label={paused?'Resume voice session':'Pause voice session'} aria-pressed={paused}>{paused?<Play size={22}/>:<Pause size={22}/>}</button><span>{paused?'Resume':'Pause'}</span></div>
     <div className="voice-control-group voice-mic-group"><button type="button" className="voice-control voice-mic" data-listening={p.listening&&!paused} onClick={p.onToggleMic} disabled={!supported||p.state==='thinking'} aria-label={p.listening&&!paused?'Mute microphone':'Start microphone'} aria-pressed={p.listening&&!paused}>{p.listening&&!paused?<Mic size={31}/>:<MicOff size={31}/>}</button><span>{p.listening&&!paused?'Microphone on':'Microphone off'}</span></div>
     <div className="voice-control-group"><button type="button" className="voice-control" onClick={p.onStopSpeaking} disabled={p.state!=='speaking'&&!paused} aria-label="Stop speaking"><Square size={20} fill="currentColor"/></button><span>Stop speaking</span></div>
     <div className="voice-control-group voice-end-control"><button type="button" className="voice-control" onClick={p.onEndVoice??p.onClose} aria-label={p.embedded?'Stop voice interaction':'End voice mode'}><X size={23}/></button><span>{p.embedded?'Stop voice':'End voice'}</span></div>
    </div>
   </footer>
  </div>
 {p.sidePanel}
 </>;
 return p.embedded?<section className="voice-dialog voice-embedded" aria-labelledby="voice-mode-title">{surface}</section>:<dialog ref={dialog} className="voice-dialog" aria-labelledby="voice-mode-title" aria-describedby="voice-mode-description" onCancel={e=>{e.preventDefault();closeRef.current();}}>{surface}</dialog>;
}


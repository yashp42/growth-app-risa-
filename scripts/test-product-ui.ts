import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SPEECH_ACTIVITY_EVENT, speakAnswer, stopSpeaking, pauseSpeaking, resumeSpeaking } from '../src/lib/speech.ts';
import { deriveOrbState } from '../src/lib/orbState.ts';
import { AnalystOrb } from '../src/components/analyst/AnalystOrb.tsx';
import { GrowthAnalystWorkspace } from '../src/components/analyst/GrowthAnalystWorkspace.tsx';

function fakeBrowser(){
 const beforeWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const beforeUtterance=Object.getOwnPropertyDescriptor(globalThis,'SpeechSynthesisUtterance');
 const events=new EventTarget();const utterances:any[]=[];const activity:boolean[]=[];const errors:string[]=[];
 events.addEventListener(SPEECH_ACTIVITY_EVENT,(e:Event)=>activity.push((e as CustomEvent).detail.speaking));
 events.addEventListener('analyst:voice-error',(e:Event)=>errors.push((e as CustomEvent).detail));
 class Utterance {text:string;lang='';onstart:any;onend:any;onerror:any;constructor(text:string){this.text=text;}}
 const playback={pauses:0,resumes:0,cancels:0};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:events.dispatchEvent.bind(events),speechSynthesis:{pause(){playback.pauses++;},resume(){playback.resumes++;},cancel(){playback.cancels++;const last=utterances.at(-1);last?.onerror?.(new Event('cancel'));},speak(u:any){utterances.push(u);}}}});
 Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
 return {utterances,activity,errors,playback,restore(){stopSpeaking();if(beforeWindow)Object.defineProperty(globalThis,'window',beforeWindow);else Reflect.deleteProperty(globalThis,'window');if(beforeUtterance)Object.defineProperty(globalThis,'SpeechSynthesisUtterance',beforeUtterance);else Reflect.deleteProperty(globalThis,'SpeechSynthesisUtterance');}};
}

test('[MOCKED] pause and resume preserve the browser utterance; stop cancels paused playback',()=>{
 const browser=fakeBrowser();try{
  assert.equal(pauseSpeaking(),false);assert.equal(resumeSpeaking(),false);
  speakAnswer('An answer from the current conversation.');browser.utterances[0].onstart(new Event('start'));
  const cancellations=browser.playback.cancels;
  assert.equal(pauseSpeaking(),true);assert.equal(browser.activity.at(-1),false);assert.equal(browser.playback.cancels,cancellations);
  assert.equal(resumeSpeaking(),true);assert.equal(browser.activity.at(-1),true);assert.equal(browser.utterances.length,1);
  pauseSpeaking();stopSpeaking();assert.equal(resumeSpeaking(),false);assert.equal(browser.playback.cancels,cancellations+1);assert.deepEqual(browser.errors,[]);
 }finally{browser.restore();}
});
test('[MOCKED] speaking starts on the browser speech event, ends on completion, and cancellation is not an error',()=>{
 const browser=fakeBrowser();try{
  let ended=0;assert.equal(speakAnswer('Collected cash is available.',{onEnd:()=>ended++}),true);
  assert.equal(browser.activity.at(-1),false);browser.utterances[0].onstart(new Event('start'));assert.equal(browser.activity.at(-1),true);
  stopSpeaking();assert.equal(browser.activity.at(-1),false);assert.equal(ended,1);assert.deepEqual(browser.errors,[]);
 }finally{browser.restore();}
});
test('[MOCKED] stale speech events cannot stop a replacement answer; playback errors reset activity and provide feedback',()=>{
 const browser=fakeBrowser();try{
  speakAnswer('First answer.');const first=browser.utterances[0];first.onstart(new Event('start'));
  speakAnswer('Second answer.');const second=browser.utterances[1];second.onstart(new Event('start'));
  first.onend(new Event('end'));assert.equal(browser.activity.at(-1),true);
  second.onerror(new Event('error'));assert.equal(browser.activity.at(-1),false);assert.match(browser.errors[0],/playback is unavailable/);
 }finally{browser.restore();}
});
test('[MOCKED] speaking state reflects playback while retaining listening and in-flight request precedence',()=>{
 const input={micOn:false,sending:false,pendingConfirm:false,lastErrorAt:null,lastAnsweredAt:null,now:0};
 assert.equal(deriveOrbState({...input,speaking:true}),'speaking');assert.equal(deriveOrbState({...input,speaking:false}),'idle');
 assert.equal(deriveOrbState({...input,speaking:true,sending:true}),'thinking');assert.equal(deriveOrbState({...input,speaking:true,micOn:true}),'listening');
 const html=renderToStaticMarkup(React.createElement(AnalystOrb,{state:'speaking',showCaption:true}));assert.match(html,/data-orb-state="speaking"/);assert.match(html,/aria-live="polite"/);assert.match(html,/Speaking/);
});
test('[MOCKED] a new Analyst conversation has no permanent empty evidence or action workspace and keeps context available',()=>{
 const noop=()=>{};const session:any={actions:[],messages:[],permissionProfile:{verifiedByServer:true,canUseAnalyst:true},filters:{record_class:'simulated',edition_id:'ED-2026-DEMO',as_of:'2026-11-27'},dataVersion:67,quota:{remaining:40},conversationId:null,setVoiceModeActive:noop,setRecordClass:noop,setFilters:noop,resetConversation:noop,orbState:'idle',progressSteps:[],interimTranscript:'',voiceListening:false,readAloudSupported:false,autoReadAloud:false,setAutoReadAloud:noop,setVoiceListening:noop,setInterimTranscript:noop,latestStructured:null,error:null,sending:false,loadingConversation:false,dataVersionChanged:false,actionErrorById:{},batchErrorById:{},sendMessage:async()=>{},dismissError:noop,clearDataVersionChanged:noop,cancelAction:noop,submitFeedback:noop};
 const html=renderToStaticMarkup(React.createElement(GrowthAnalystWorkspace,{session,activeContextSection:'overview'}));
 assert.doesNotMatch(html,/aria-label="Action workspace"|aria-label="Evidence and context"/);assert.match(html,/What would you like to explore/);assert.match(html,/Conversation context/);assert.match(html,/Growth Analyst question/);
});


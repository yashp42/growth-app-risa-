import type { OrbState } from './orbState';
export function voicePresentation(state:OrbState,paused:boolean,listening:boolean,supported:boolean,error?:string|null) {
 if(error||state==='error')return {title:'Let’s try that again',description:'Your conversation is saved. You can retry or return to chat.',label:'Needs attention'};
 if(paused)return {title:'Take your time.',description:'Microphone and voice playback are paused.',label:'Paused'};
 if(state==='thinking')return {title:'Thinking it through…',description:'Finding the right evidence for your question.',label:'Thinking'};
 if(listening)return {title:'Listening…',description:'Go ahead, I’m listening.',label:'Microphone on'};
 if(state==='speaking')return {title:'Speaking…',description:'You can interrupt me at any time.',label:'Speaking'};
 if(state==='confirm')return {title:'Ready for your review',description:'Return to the conversation to review the proposed change.',label:'Review needed'};
 if(!supported)return {title:'Let’s keep the conversation going.',description:'Voice input is unavailable in this browser. You can continue in chat.',label:'Voice unavailable'};
 return {title:'What’s on your mind?',description:'Tap the microphone whenever you’re ready.',label:state==='answering'?'Answer ready':'Ready'};
}
export function voiceTimestamp(value:string|undefined):string|null {
 if(!value)return null;const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 return new Intl.DateTimeFormat('en-IN',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(date);
}

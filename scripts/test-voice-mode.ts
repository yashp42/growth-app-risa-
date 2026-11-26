import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceMode } from '../src/components/analyst/VoiceMode';
import { VoiceOrb } from '../src/components/analyst/VoiceOrb';
import { voicePresentation,voiceTimestamp } from '../src/lib/voicePresentation';
const noop=()=>{};
const base={open:true,state:'idle' as const,listening:false,transcript:'',answer:'',onToggleMic:noop,onTogglePause:noop,onStopSpeaking:noop,onClose:noop};
test('[MOCKED] voice transcript renders actual ordered conversation and safe assistant markdown',()=>{
 const html=renderToStaticMarkup(React.createElement(VoiceMode,{...base,messages:[{message_id:'one',role:'user',content:'What changed for Acme?',created_at:'2026-11-27T03:00:00Z'},{message_id:'two',role:'assistant',content:'**Acme** is waiting for a response. <script>alert(1)</script>',created_at:'2026-11-27T03:01:00Z'}]}));
 assert.ok(html.indexOf('What changed for Acme?')<html.indexOf('is waiting for a response'));
 assert.match(html,/Voice conversation transcript/);assert.match(html,/dateTime="2026-11-27T03:01:00Z"/i);assert.doesNotMatch(html,/<script>|City Festival|Community Series|61%/);
 assert.match(html,/aria-label="Back to conversation"/);assert.match(html,/Pause voice session/);assert.match(html,/Stop speaking/);assert.match(html,/End voice mode/);
});
test('[MOCKED] thinking and confirmation states preserve real progress and human review',()=>{
 const thinking=renderToStaticMarkup(React.createElement(VoiceMode,{...base,state:'thinking',step:'Checking current campaign records'}));
 assert.match(thinking,/Checking current campaign records/);assert.match(thinking,/Thinking it through/);
 const confirm=renderToStaticMarkup(React.createElement(VoiceMode,{...base,state:'confirm'}));assert.match(confirm,/review and accept or cancel/);
 assert.doesNotMatch(confirm,/onClick.*confirmAction/);
});
test('[MOCKED] empty, paused, unsupported and error states do not pretend to be listening',()=>{
 assert.equal(voicePresentation('idle',false,false,true).label,'Ready');
 assert.equal(voicePresentation('idle',false,false,false).label,'Voice unavailable');
 assert.equal(voicePresentation('listening',true,true,true).label,'Paused');
 assert.equal(voicePresentation('thinking',false,false,true).label,'Thinking');
 assert.equal(voicePresentation('speaking',false,false,true).label,'Speaking');
 const html=renderToStaticMarkup(React.createElement(VoiceMode,{...base,state:'error',error:'HTTP 500 {private diagnostic}'}));
 assert.match(html,/could not complete that request/);assert.doesNotMatch(html,/private diagnostic/);
});
test('[MOCKED] unique SVG definitions and clamped input meter keep multiple orbs independent',()=>{
 const html=renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(VoiceOrb,{state:'listening',level:9}),React.createElement(VoiceOrb,{state:'thinking',level:.8})));
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 assert.match(html,/--voice-level:1/);assert.match(html,/--voice-level:0/);
 assert.equal(voiceTimestamp('not-a-date'),null);assert.equal(voiceTimestamp(''),null);
});

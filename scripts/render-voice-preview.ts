/** MOCKED visual fixture rendered with the production component/CSS; no microphone or model calls. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync,readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { VoiceMode } from '../src/components/analyst/VoiceMode';
Object.defineProperty(globalThis,'window',{configurable:true,value:{SpeechRecognition:function(){}}});
const noop=()=>{};
const markup=renderToStaticMarkup(React.createElement(VoiceMode,{open:true,state:'listening',listening:true,transcript:'Which campaigns need our attention?',answer:'',onToggleMic:noop,onTogglePause:noop,onStopSpeaking:noop,onClose:noop,messages:[{message_id:'mock-user',role:'user',content:'Help me decide where to focus this week.',created_at:'2026-11-27T03:00:00Z'},{message_id:'mock-assistant',role:'assistant',content:'Let’s start with your current campaign results and pending follow-ups. I’ll use the available evidence to help you decide what to do next.',created_at:'2026-11-27T03:00:03Z'}]}));
const css=readdirSync('dist/assets').filter(f=>f.endsWith('.css')).map(f=>readFileSync('dist/assets/'+f,'utf8')).join('\n');
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice Mode — MOCKED visual preview</title><style>'+css+'\ndialog.voice-dialog{display:block} .preview-label{position:fixed;right:20px;bottom:8px;z-index:10;font:10px system-ui;color:#a2c0b0}</style></head><body>'+markup+'<div class="preview-label">MOCKED DESIGN PREVIEW · microphone disabled</div></body></html>';
console.log('MOCKED_VOICE_HTML:'+gzipSync(html).toString('base64'));

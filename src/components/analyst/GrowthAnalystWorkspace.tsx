import { Lock, PanelRightOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { stopSpeaking,pauseSpeaking,resumeSpeaking } from '../../lib/speech';
import { VoiceMode } from './VoiceMode';
import type { UseGrowthAnalystSessionResult } from '../../hooks/useGrowthAnalystSession';
import type { AiActionRecord, AiViewSpec } from '../../types/analyst';
import type { NavSectionId } from '../../types/overview';
import { ActionConfirmationDialog } from './ActionConfirmationDialog';
import { AiViewRenderer } from './AiViewRenderer';
import { DataContextHeader } from './DataContextHeader';
import { EvidencePanel } from './EvidencePanel';
import { GrowthAnalystChat } from './GrowthAnalystChat';
import { ChatComposer } from './ChatComposer';

interface GrowthAnalystWorkspaceProps {
  session: UseGrowthAnalystSessionResult;
  activeContextSection: NavSectionId;
  activeRecordContext?: {
    entityType: 'campaign' | 'sponsor' | 'opportunity' | 'task';
    entityId: string;
  } | null;
  initialDraft?: string | null;
  autoStartVoiceNonce?: number;
  onEditAction?: (action: AiActionRecord) => void;
  onOpenRecord?: (recordType: string, recordId: string) => void;
  onOpenAiViewScreen?: (
    screen: AiViewSpec['screen'],
    filters?: Record<string, string>
  ) => void;
}

export function GrowthAnalystWorkspace({
  session,
  activeContextSection,
  activeRecordContext,
  initialDraft,
  autoStartVoiceNonce = 0,
  onEditAction,
  onOpenRecord,
  onOpenAiViewScreen,
}: GrowthAnalystWorkspaceProps) {
  const [voiceMode,setVoiceMode]=useState(false);
  const [voicePaused,setVoicePaused]=useState(false);
  const resumeMicRef=useRef(false);
  const [voiceInputCommand,setVoiceInputCommand]=useState<{id:number;action:'start'|'stop'}>();
  const commandVoice=(action:'start'|'stop')=>setVoiceInputCommand(prev=>({id:(prev?.id??0)+1,action}));
  useEffect(()=>{session.setVoiceModePaused(voicePaused);return()=>session.setVoiceModePaused(false);},[voicePaused,session.setVoiceModePaused]);
  const [micError,setMicError]=useState<string|null>(null);
  useEffect(()=>{const listen=(e:Event)=>setMicError((e as CustomEvent<string|null>).detail);window.addEventListener('analyst:voice-error',listen);return()=>window.removeEventListener('analyst:voice-error',listen);},[]);
  useEffect(()=>{session.setVoiceModeActive(voiceMode);return()=>session.setVoiceModeActive(false);},[voiceMode,session.setVoiceModeActive]);
  useEffect(()=>{if(autoStartVoiceNonce>0){setVoicePaused(false);setVoiceMode(true);setMicError(null);}},[autoStartVoiceNonce]);
  const closeVoice=()=>{commandVoice('stop');stopSpeaking();setVoicePaused(false);setVoiceMode(false);};
  const togglePause=()=>{
    if(voicePaused){setVoicePaused(false);resumeSpeaking();if(resumeMicRef.current&&!session.sending)commandVoice('start');}
    else{resumeMicRef.current=session.voiceListening;commandVoice('stop');if(!pauseSpeaking()&&session.speaking)stopSpeaking();setVoicePaused(true);}
  };
  const toggleVoiceMic=()=>{stopSpeaking();setVoiceMode(true);setVoicePaused(false);setMicError(null);commandVoice(session.voiceListening?'stop':'start');};
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'evidence' | 'actions'>(
    'chat'
  );
  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<AiActionRecord | null>(null);

  const pendingCount = session.actions.filter(
    (a) => a.status === 'proposed'
  ).length;

  const handleConfirmSubmit = async (actionId: string) => {
    await session.confirmAction(actionId);
    setPendingConfirmAction(null);
  };

  const canUse=!(session.permissionProfile.verifiedByServer&&!session.permissionProfile.canUseAnalyst);
  return <div className="unified-analyst">
   {!canUse?<div role="alert" className="p-6"><Lock size={20}/>Growth Analyst access is restricted for this account.</div>:<VoiceMode embedded open state={session.orbState} listening={session.voiceListening} transcript={session.interimTranscript} messages={session.messages} paused={voicePaused} answer="" error={micError} step={session.progressSteps.at(-1)}
    onToggleMic={toggleVoiceMic} onTogglePause={togglePause} onStopSpeaking={stopSpeaking} onEndVoice={closeVoice} onClose={()=>{closeVoice();onOpenAiViewScreen?.('overview');}}
    headerActions={<><DataContextHeader compact
        filters={session.filters}
        onChangeRecordClass={session.setRecordClass}
        onChangeEdition={(edition_id) =>
          session.setFilters((prev) => ({ ...prev, edition_id }))
        }
        onChangeAsOf={(as_of) =>
          session.setFilters((prev) => ({ ...prev, as_of }))
        }
        dataVersion={session.dataVersion}
        quota={session.quota}
        conversationId={session.conversationId}
        onResetConversation={session.resetConversation}
        pendingActionCount={pendingCount}
        mobilePanel={mobilePanel}
        onChangeMobilePanel={setMobilePanel}
        autoReadAloud={session.autoReadAloud}
        readAloudSupported={session.readAloudSupported}
        onChangeAutoReadAloud={on=>{if(!on)setVoiceMode(false);session.setAutoReadAloud(on);}}
      /><button type="button" className="voice-back" aria-expanded={evidenceOpen} onClick={()=>setEvidenceOpen(v=>!v)}><PanelRightOpen size={16}/>Sources</button></>}
    content={<>{session.activeViewSpec?<AiViewRenderer viewSpec={session.activeViewSpec} isPreview={session.viewPreviewPending} onKeepView={()=>session.keepActiveView()} onUndoView={session.undoActiveView} onClearView={session.clearActiveView} onOpenScreen={onOpenAiViewScreen}/>:null}<GrowthAnalystChat embedded hideComposer
              messages={session.messages}
              actions={session.actions}
              permissionProfile={session.permissionProfile}
              sending={session.sending}
              loadingConversation={session.loadingConversation}
              error={session.error}
              dataVersionChanged={session.dataVersionChanged}
              actionProcessingId={session.actionProcessingId}
              actionErrorById={session.actionErrorById}
              batchProcessingId={session.batchProcessingId}
              batchErrorById={session.batchErrorById}
              initialDraft={initialDraft}
              autoStartVoiceNonce={autoStartVoiceNonce}
              voiceInputCommand={voiceInputCommand}
              onListeningChange={session.setVoiceListening}
              onInterimTranscript={session.setInterimTranscript}
              onSend={session.sendMessage}
              onDismissError={session.dismissError}
              onClearDataVersionChanged={session.clearDataVersionChanged}
              onRequestConfirmAction={setPendingConfirmAction}
              onCancelAction={(id) => void session.cancelAction(id)}
              onConfirmBatch={(id) => void session.confirmBatch(id)}
              onCancelBatch={(id) => void session.cancelBatch(id)}
              onEditAction={onEditAction}
              onActivateView={(spec) => session.setActiveViewSpec(spec)}
              onOpenRecord={onOpenRecord}
              onSubmitFeedback={session.submitFeedback}
            /></>}
    composer={<ChatComposer onSend={session.sendMessage} sending={session.sending} disabled={!canUse} initialDraft={initialDraft} autoStartVoiceNonce={autoStartVoiceNonce} voiceInputCommand={voiceInputCommand} onListeningChange={session.setVoiceListening} onInterimTranscript={session.setInterimTranscript} placeholder="Type a message, or use the microphone…"/>}
    sidePanel={evidenceOpen&&session.latestStructured?<aside className="unified-evidence" aria-label="Evidence and sources"><EvidencePanel
                  filters={session.filters}
                  dataVersion={session.dataVersion}
                  latestStructured={session.latestStructured}
                  activeContextSection={activeContextSection}
                  activeRecordContext={activeRecordContext}
                  permissionProfile={session.permissionProfile}
                  onCollapse={() => setEvidenceOpen(false)}
                  onOpenLinkedRecord={onOpenRecord}
                /></aside>:null}
   />}
   <ActionConfirmationDialog
        action={pendingConfirmAction}
        processing={
          pendingConfirmAction
            ? session.actionProcessingId === pendingConfirmAction.ai_action_id
            : false
        }
        onConfirm={(id) => void handleConfirmSubmit(id)}
        onClose={() => setPendingConfirmAction(null)}
      />
  </div>;
}

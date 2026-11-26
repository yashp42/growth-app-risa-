import { Lock, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { stopSpeaking } from '../../lib/speech';
import { VoiceMode } from './VoiceMode';
import type { UseGrowthAnalystSessionResult } from '../../hooks/useGrowthAnalystSession';
import type { AiActionRecord, AiViewSpec } from '../../types/analyst';
import type { NavSectionId } from '../../types/overview';
import { ActionConfirmationDialog } from './ActionConfirmationDialog';
import { AiViewRenderer } from './AiViewRenderer';
import { DataContextHeader } from './DataContextHeader';
import { EvidencePanel } from './EvidencePanel';
import { GrowthAnalystChat } from './GrowthAnalystChat';
import { OrbStage } from './OrbStage';

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
  const [micError,setMicError]=useState<string|null>(null);
  useEffect(()=>{const listen=(e:Event)=>setMicError((e as CustomEvent<string|null>).detail);window.addEventListener('analyst:voice-error',listen);return()=>window.removeEventListener('analyst:voice-error',listen);},[]);
  useEffect(()=>{session.setVoiceModeActive(voiceMode);return()=>session.setVoiceModeActive(false);},[voiceMode,session.setVoiceModeActive]);
  useEffect(()=>{if(autoStartVoiceNonce>0)setVoiceMode(true);},[autoStartVoiceNonce]);
  const openVoice=()=>{stopSpeaking();setVoiceMode(true);setMicError(null);if(!session.voiceListening)setToggleVoiceNonce(n=>n+1);};
  const closeVoice=()=>{if(session.voiceListening)setToggleVoiceNonce(n=>n+1);stopSpeaking();setVoiceMode(false);};
  const [toggleVoiceNonce, setToggleVoiceNonce] = useState(0);
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

  return (
    <div className="analyst-conversation space-y-6">
      <DataContextHeader
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
        onChangeAutoReadAloud={session.setAutoReadAloud}
      />

      {session.permissionProfile.verifiedByServer &&
      !session.permissionProfile.canUseAnalyst ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-white p-5"
        >
          <Lock
            className="mt-0.5 h-4 w-4 shrink-0 text-[#9B3B32]"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">
              Growth Analyst access restricted (403)
            </h2>
            <p className="mt-1 text-[14px] text-[var(--color-ink-muted)]">
              Your account does not carry a sponsorship operations or viewer
              role required for Growth Analyst queries.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Main Conversation Area */}
          <section
            aria-label="Growth Analyst conversation"
            className={`${
              'block'
            } w-full`}
          >
            {!evidenceOpen && session.latestStructured ? (
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEvidenceOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
                >
                  <PanelRightOpen className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" aria-hidden="true" />
                  <span>Evidence & sources</span>
                </button>
              </div>
            ) : null}

            <OrbStage
              state={session.orbState}
              micOn={session.voiceListening}
              steps={session.progressSteps}
              transcript={session.interimTranscript}
              errorText={session.error?.message ?? null}
              onToggleMic={openVoice}
              onVoiceMode={openVoice}
              onStopSpeaking={stopSpeaking}
              onActivate={() => {
                const el = document.querySelector<HTMLTextAreaElement>(
                  'textarea[aria-label="Growth Analyst question"]'
                );
                el?.focus();
              }}
              compact={session.messages.length > 0}
            />

            {session.activeViewSpec ? (
              <div className="mb-4">
                <AiViewRenderer
                  viewSpec={session.activeViewSpec}
                  isPreview={session.viewPreviewPending}
                  onKeepView={() => session.keepActiveView()}
                  onUndoView={session.undoActiveView}
                  onClearView={session.clearActiveView}
                  onOpenScreen={onOpenAiViewScreen}
                />
              </div>
            ) : null}

            <GrowthAnalystChat
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
              toggleVoiceNonce={toggleVoiceNonce}
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
            />
          </section>

          {/* Right Side Workspace: Evidence & Context + Action Workspace */}
          {evidenceOpen && session.latestStructured ? (
            <div className="space-y-4">
              <div
                className={
                  'block'
                }
              >
                <EvidencePanel
                  filters={session.filters}
                  dataVersion={session.dataVersion}
                  latestStructured={session.latestStructured}
                  activeContextSection={activeContextSection}
                  activeRecordContext={activeRecordContext}
                  permissionProfile={session.permissionProfile}
                  onCollapse={() => setEvidenceOpen(false)}
                  onOpenLinkedRecord={onOpenRecord}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      <VoiceMode open={voiceMode} state={session.orbState} listening={session.voiceListening} transcript={session.interimTranscript} answer={[...session.messages].reverse().find(m=>m.role==='assistant')?.content??''} error={micError??session.error?.message} step={session.progressSteps.at(-1)} onToggleMic={()=>{stopSpeaking();setToggleVoiceNonce(n=>n+1);}} onStopSpeaking={stopSpeaking} onClose={closeVoice}/>
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
    </div>
  );
}


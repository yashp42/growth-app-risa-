import { CheckCircle2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import type { UseGrowthAnalystSessionResult } from '../../hooks/useGrowthAnalystSession';
import type { AiActionRecord, AiViewSpec } from '../../types/analyst';
import type { NavSectionId } from '../../types/overview';
import { GrowthAnalystLauncher } from '../analyst/GrowthAnalystLauncher';
import { AUDIT_LOG_ANCHOR_ID } from '../settings/AuditLogPanel';
import { GlobalSearchModal } from './GlobalSearchModal';
import { Sidebar } from './Sidebar';
import { TopNav, type QuickAddEntityType } from './TopNav';

/** Scroll to an element once the newly selected section has rendered it. */
function scrollToWhenRendered(elementId: string, attemptsLeft = 30): void {
  const el = document.getElementById(elementId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (attemptsLeft > 0) {
    window.setTimeout(() => scrollToWhenRendered(elementId, attemptsLeft - 1), 50);
  }
}

interface AppShellProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  onQuickAdd: (entity: QuickAddEntityType) => void;
  onOpenAnalystWorkspace: (promptContext?: string) => void;
  analystSession: UseGrowthAnalystSessionResult;
  autoStartVoiceNonce: number;
  onTriggerVoiceAsk: () => void;
  onEditAnalystAction?: (action: AiActionRecord) => void;
  onOpenAnalystLinkedRecord?: (recordType: string, recordId: string) => void;
  onOpenAiViewScreen?: (
    screen: AiViewSpec['screen'],
    filters?: Record<string, string>
  ) => void;
  devControlsEnabled: boolean;
  onToggleDevControls: () => void;
  children: ReactNode;
}

export function AppShell({
  activeSection,
  onSelectSection,
  onQuickAdd,
  onOpenAnalystWorkspace,
  analystSession,
  autoStartVoiceNonce,
  onTriggerVoiceAsk,
  onEditAnalystAction,
  onOpenAnalystLinkedRecord,
  onOpenAiViewScreen,
  devControlsEnabled,
  onToggleDevControls,
  children,
}: AppShellProps) {
  const { isReadOnlyHistorical } = useSeason();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);




  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleJumpToOverviewAnchor = (anchorId: string) => {
    if (activeSection !== 'overview') {
      onSelectSection('overview');
    }
    window.setTimeout(() => {
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };


  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          activeSection={activeSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onSelectQuickAdd={(entity) => {
            if (!isReadOnlyHistorical) {
              onQuickAdd(entity);
            }
          }}
          onNavigateSection={onSelectSection}
          devControlsEnabled={devControlsEnabled}
          onToggleDevControls={onToggleDevControls}
        />

        <main id="main-content" tabIndex={-1} className={activeSection==='growth-analyst'?"flex-1 min-w-0":"flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-9 lg:pt-9 lg:pb-24"}>
          <div className={activeSection==='growth-analyst'?"w-full":"mx-auto w-full max-w-[1440px]"}>
            {analystSession.appliedToast ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-accent)] bg-white px-4 py-3 text-[14px] shadow-sm"
              >
                <div className="flex items-center gap-2 text-[var(--color-ink)]">
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-[var(--color-accent)]"
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    Applied {analystSession.appliedToast.count}{' '}
                    {analystSession.appliedToast.count === 1
                      ? 'change'
                      : 'changes'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      analystSession.dismissAppliedToast();
                      onSelectSection('team-settings');
                      scrollToWhenRendered(AUDIT_LOG_ANCHOR_ID);
                    }}
                    className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
                  >
                    View audit log
                  </button>
                  <button
                    type="button"
                    onClick={analystSession.dismissAppliedToast}
                    aria-label="Dismiss notification"
                    className="text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>

      <GrowthAnalystLauncher orbState={analystSession.orbState} visible={activeSection!=='growth-analyst'} onClick={()=>onOpenAnalystWorkspace()} onVoiceClick={()=>{onOpenAnalystWorkspace();onTriggerVoiceAsk();}}/>

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigateSection={onSelectSection}
        onJumpToOverviewAnchor={handleJumpToOverviewAnchor}
        onOpenRecord={onOpenAnalystLinkedRecord}
      />

    </div>
  );
}



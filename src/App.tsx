/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnalyticsWorkspace } from './components/analytics/AnalyticsWorkspace';
import { AiViewRenderer } from './components/analyst/AiViewRenderer';
import { GrowthAnalystWorkspace } from './components/analyst/GrowthAnalystWorkspace';
import { DemoLandingScreen } from './components/auth/DemoLandingScreen';
import { CampaignsWorkspace } from './components/campaigns/CampaignsWorkspace';
import { CollectionsWorkspace } from './components/collections/CollectionsWorkspace';
import { OverviewDashboard } from './components/overview/OverviewDashboard';
import { PipelineWorkspace } from './components/pipeline/PipelineWorkspace';
import { TeamSettingsWorkspace } from './components/settings/TeamSettingsWorkspace';
import { AppShell } from './components/shell/AppShell';
import { SponsorsWorkspace } from './components/sponsors/SponsorsWorkspace';
import { TasksWorkspace } from './components/tasks/TasksWorkspace';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SeasonProvider } from './contexts/SeasonContext';
import { useGrowthAnalystSession } from './hooks/useGrowthAnalystSession';
import { apiFetch } from './services/authSession';
import type { AiActionRecord, AiViewSpec } from './types/analyst';
import type { NavSectionId } from './types/overview';
import type { TaskCreatePayload, TaskLinkedType, TaskType } from './types/tasks';

const VALID_NAV_SECTIONS: ReadonlySet<NavSectionId> = new Set([
  'overview',
  'campaigns',
  'sponsors',
  'pipeline',
  'tasks',
  'collections',
  'analytics',
  'growth-analyst',
  'team-settings',
]);

interface UrlNavState {
  section: NavSectionId;
  campaignId: string | null;
  sponsorId: string | null;
  opportunityId: string | null;
  taskId: string | null;
}

function readUrlNavState(): UrlNavState {
  if (typeof window === 'undefined') {
    return {
      section: 'overview',
      campaignId: null,
      sponsorId: null,
      opportunityId: null,
      taskId: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawSection = params.get('section') as NavSectionId | null;
  const section: NavSectionId =
    rawSection && VALID_NAV_SECTIONS.has(rawSection) ? rawSection : 'overview';
  return {
    section,
    campaignId: params.get('campaignId'),
    sponsorId: params.get('sponsorId'),
    opportunityId: params.get('opportunityId'),
    taskId: params.get('taskId'),
  };
}

function writeUrlNavState(state: UrlNavState, replace = false): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('section', state.section);

  if (state.campaignId) url.searchParams.set('campaignId', state.campaignId);
  else url.searchParams.delete('campaignId');

  if (state.sponsorId) url.searchParams.set('sponsorId', state.sponsorId);
  else url.searchParams.delete('sponsorId');

  if (state.opportunityId)
    url.searchParams.set('opportunityId', state.opportunityId);
  else url.searchParams.delete('opportunityId');

  if (state.taskId) url.searchParams.set('taskId', state.taskId);
  else url.searchParams.delete('taskId');

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;
  if (replace) {
    window.history.replaceState(null, '', nextUrl);
  } else {
    window.history.pushState(null, '', nextUrl);
  }
}

async function fetchDataVersion(): Promise<string | null> {
  const response = await apiFetch('/api/version', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  const data = (await response.json()) as {
    data_version?: string | number | null;
    version?: string | number | null;
  };
  const v = data.data_version ?? data.version;
  return v !== undefined && v !== null ? String(v) : null;
}

function AuthenticatedWorkspace() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const initialNav = useMemo(() => readUrlNavState(), []);

  const [activeSection, setActiveSection] = useState<NavSectionId>(
    initialNav.section
  );
  const [lastContextSection, setLastContextSection] = useState<NavSectionId>(
    initialNav.section === 'growth-analyst' ? 'overview' : initialNav.section
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    initialNav.campaignId
  );
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(
    initialNav.sponsorId
  );
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<
    string | null
  >(initialNav.opportunityId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialNav.taskId
  );
  const [prefillCreateTask, setPrefillCreateTask] =
    useState<Partial<TaskCreatePayload> | null>(null);
  const [analystPromptContext, setAnalystPromptContext] = useState<string | null>(
    null
  );
  const [autoStartVoiceNonce, setAutoStartVoiceNonce] = useState(0);
  const [externalDataNonce, setExternalDataNonce] = useState(0);
  const [devControlsEnabled, setDevControlsEnabled] = useState<boolean>(() => {
    if (!import.meta.env.DEV) return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  });

  // Poll GET /api/version every 10 seconds and invalidate React Query caches on change
  const lastVersionRef = useRef<string | null>(null);
  const versionQuery = useQuery({
    queryKey: ['data-version'],
    queryFn: fetchDataVersion,
    enabled: status === 'authenticated',
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const nextVersion = versionQuery.data;
    if (!nextVersion) return;
    if (lastVersionRef.current !== null && lastVersionRef.current !== nextVersion) {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== 'data-version',
      });
      setExternalDataNonce((prev) => prev + 1);
    }
    lastVersionRef.current = nextVersion;
  }, [versionQuery.data, queryClient]);

  // Sync navigation + drill-through selection into URL while preserving editionId/asOf/filters
  useEffect(() => {
    writeUrlNavState(
      {
        section: activeSection,
        campaignId: selectedCampaignId,
        sponsorId: selectedSponsorId,
        opportunityId: selectedOpportunityId,
        taskId: selectedTaskId,
      },
      true
    );
  }, [
    activeSection,
    selectedCampaignId,
    selectedSponsorId,
    selectedOpportunityId,
    selectedTaskId,
  ]);

  useEffect(() => {
    const onPopState = () => {
      const next = readUrlNavState();
      setActiveSection(next.section);
      if (next.section !== 'growth-analyst') {
        setLastContextSection(next.section);
      }
      setSelectedCampaignId(next.campaignId);
      setSelectedSponsorId(next.sponsorId);
      setSelectedOpportunityId(next.opportunityId);
      setSelectedTaskId(next.taskId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleAfterAnalystAction = useCallback(() => {
    void queryClient.invalidateQueries();
    setExternalDataNonce((prev) => prev + 1);
  }, [queryClient]);

  const analystContextMeta = useMemo(
    () => ({
      activeSection:
        activeSection === 'growth-analyst'
          ? lastContextSection
          : activeSection,
      selectedCampaignId,
      selectedSponsorId,
      selectedOpportunityId,
      selectedTaskId,
    }),
    [
      activeSection,
      lastContextSection,
      selectedCampaignId,
      selectedSponsorId,
      selectedOpportunityId,
      selectedTaskId,
    ]
  );

  const analystSession = useGrowthAnalystSession(
    analystContextMeta,
    handleAfterAnalystAction
  );

  const activeRecordContext = useMemo(() => {
    const contextSec =
      activeSection === 'growth-analyst' ? lastContextSection : activeSection;
    if (contextSec === 'campaigns' && selectedCampaignId) {
      return { entityType: 'campaign' as const, entityId: selectedCampaignId };
    }
    if (contextSec === 'sponsors' && selectedSponsorId) {
      return { entityType: 'sponsor' as const, entityId: selectedSponsorId };
    }
    if (contextSec === 'pipeline' && selectedOpportunityId) {
      return {
        entityType: 'opportunity' as const,
        entityId: selectedOpportunityId,
      };
    }
    if (contextSec === 'tasks' && selectedTaskId) {
      return { entityType: 'task' as const, entityId: selectedTaskId };
    }
    return null;
  }, [
    activeSection,
    lastContextSection,
    selectedCampaignId,
    selectedSponsorId,
    selectedOpportunityId,
    selectedTaskId,
  ]);

  const handleOpenAnalyst = (promptContext?: string) => {
    if (activeSection !== 'growth-analyst') {
      setLastContextSection(activeSection);
    }
    setAnalystPromptContext(promptContext ?? null);
    setActiveSection('growth-analyst');
  };

  const handleOpenCampaignDetail = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setLastContextSection('campaigns');
    setActiveSection('campaigns');
  };

  const handleOpenSponsorDetail = (sponsorId: string) => {
    setSelectedSponsorId(sponsorId);
    setLastContextSection('sponsors');
    setActiveSection('sponsors');
  };

  const handleOpenOpportunityDetail = (opportunityId: string) => {
    setSelectedOpportunityId(opportunityId);
    setLastContextSection('pipeline');
    setActiveSection('pipeline');
  };

  const handleOpenTaskDetail = (taskId: string) => {
    setSelectedTaskId(taskId);
    setLastContextSection('tasks');
    setActiveSection('tasks');
  };

  const handleOpenLinkedRecord = (recordType: string, recordId: string) => {
    if (!recordId) return;
    switch (recordType.toLowerCase()) {
      case 'sponsor':
        handleOpenSponsorDetail(recordId);
        break;
      case 'campaign':
        handleOpenCampaignDetail(recordId);
        break;
      case 'opportunity':
        handleOpenOpportunityDetail(recordId);
        break;
      case 'task':
        handleOpenTaskDetail(recordId);
        break;
      default:
        break;
    }
  };

  const handleEditAnalystAction = useCallback((action: AiActionRecord) => {
    const p = action.payload ?? {};
    if (action.action_type === 'create_task') {
      setSelectedTaskId(null);
      setPrefillCreateTask({
        title: typeof p.title === 'string' ? p.title : '',
        task_type:
          typeof p.task_type === 'string'
            ? (p.task_type as TaskType)
            : 'follow_up',
        owner_member_id:
          typeof p.owner_member_id === 'string' ? p.owner_member_id : undefined,
        due_at: typeof p.due_at === 'string' ? p.due_at : undefined,
        linked_type:
          typeof p.linked_type === 'string'
            ? (p.linked_type as TaskLinkedType)
            : undefined,
        linked_id: typeof p.linked_id === 'string' ? p.linked_id : undefined,
        bet_id: typeof p.bet_id === 'string' ? p.bet_id : undefined,
      });
      setLastContextSection('tasks');
      setActiveSection('tasks');
      return;
    }
    const oppId =
      action.linked_opportunity_id ||
      (typeof p.opportunity_id === 'string' ? p.opportunity_id : null);
    if (oppId) {
      handleOpenOpportunityDetail(oppId);
      return;
    }
    const sponsorId =
      action.linked_sponsor_id ||
      (typeof p.sponsor_id === 'string' ? p.sponsor_id : null);
    if (sponsorId) {
      handleOpenSponsorDetail(sponsorId);
      return;
    }
    const campId =
      action.linked_campaign_id ||
      (typeof p.campaign_id === 'string' ? p.campaign_id : null);
    if (campId) {
      handleOpenCampaignDetail(campId);
    }
  }, []);

  const handleOpenAiViewScreen = useCallback(
    (screen: AiViewSpec['screen'], filters?: Record<string, string>) => {
      setAnalystPromptContext(null);
      setSelectedSponsorId(null);
      setSelectedOpportunityId(null);
      setSelectedTaskId(null);
      if (screen === 'campaigns') {
        setSelectedCampaignId(filters?.campaign_id ?? null);
      } else {
        setSelectedCampaignId(null);
      }
      setLastContextSection(screen);
      setActiveSection(screen);
    },
    []
  );

  const handleSelectSection = (section: NavSectionId) => {
    if (section === 'growth-analyst') {
      if (activeSection !== 'growth-analyst') {
        setLastContextSection(activeSection);
      }
      setActiveSection('growth-analyst');
      return;
    }
    setAnalystPromptContext(null);
    setPrefillCreateTask(null);
    if (section !== 'campaigns') {
      setSelectedCampaignId(null);
    }
    if (section !== 'sponsors') {
      setSelectedSponsorId(null);
    }
    if (section !== 'pipeline') {
      setSelectedOpportunityId(null);
    }
    if (section !== 'tasks') {
      setSelectedTaskId(null);
    }
    setLastContextSection(section);
    setActiveSection(section);
  };

  const showDevControls = import.meta.env.DEV && devControlsEnabled;

  if (status !== 'authenticated') {
    return <DemoLandingScreen />;
  }

  return (
    <AppShell
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      onOpenAnalystWorkspace={handleOpenAnalyst}
      analystSession={analystSession}
      autoStartVoiceNonce={autoStartVoiceNonce}
      onTriggerVoiceAsk={() => setAutoStartVoiceNonce((n) => n + 1)}
      onEditAnalystAction={handleEditAnalystAction}
      onOpenAnalystLinkedRecord={handleOpenLinkedRecord}
      onOpenAiViewScreen={handleOpenAiViewScreen}
      devControlsEnabled={devControlsEnabled}
      onToggleDevControls={() => setDevControlsEnabled((prev) => !prev)}
    >
      {activeSection !== 'overview' &&
      activeSection !== 'growth-analyst' &&
      activeSection !== 'team-settings' &&
      analystSession.activeViewSpec?.screen === activeSection ? (
        <div className="mb-6">
          <AiViewRenderer
            viewSpec={analystSession.activeViewSpec}
            isPreview={analystSession.viewPreviewPending}
            onKeepView={() => analystSession.keepActiveView()}
            onUndoView={analystSession.undoActiveView}
            onClearView={analystSession.clearActiveView}
          />
        </div>
      ) : null}
      {activeSection === 'overview' ? (
        <OverviewDashboard
          key={`overview-${externalDataNonce}`}
          showDevControls={showDevControls}
          onNavigateSection={(sec) => handleSelectSection(sec)}
          onOpenCampaignDetail={handleOpenCampaignDetail}
          onOpenRecord={handleOpenLinkedRecord}
          savedViews={analystSession.savedViews}
          activeViewSpec={analystSession.activeViewSpec}
          viewPreviewPending={analystSession.viewPreviewPending}
          onSelectSavedView={analystSession.selectSavedView}
          onKeepView={() => analystSession.keepActiveView()}
          onUndoView={analystSession.undoActiveView}
          onClearView={analystSession.clearActiveView}
          onDeleteSavedView={analystSession.removeSavedView}
          onOpenAiViewScreen={handleOpenAiViewScreen}
        />
      ) : activeSection === 'campaigns' ? (
        <CampaignsWorkspace
          key={`campaigns-${externalDataNonce}`}
          showDevControls={showDevControls}
          initialCampaignId={selectedCampaignId}
          onClearInitialCampaignId={() => setSelectedCampaignId(null)}
          onOpenSponsor={handleOpenSponsorDetail}
        />
      ) : activeSection === 'sponsors' ? (
        <SponsorsWorkspace
          key={`sponsors-${externalDataNonce}`}
          showDevControls={showDevControls}
          initialSponsorId={selectedSponsorId}
          onClearInitialSponsorId={() => setSelectedSponsorId(null)}
          onOpenCampaign={handleOpenCampaignDetail}
        />
      ) : activeSection === 'pipeline' ? (
        <PipelineWorkspace
          key={`pipeline-${externalDataNonce}`}
          showDevControls={showDevControls}
          initialOpportunityId={selectedOpportunityId}
          onClearInitialOpportunityId={() => setSelectedOpportunityId(null)}
          onOpenSponsor={handleOpenSponsorDetail}
          onOpenCampaign={handleOpenCampaignDetail}
        />
      ) : activeSection === 'tasks' ? (
        <TasksWorkspace
          key={`tasks-${externalDataNonce}`}
          showDevControls={showDevControls}
          initialTaskId={selectedTaskId}
          prefillCreateTask={prefillCreateTask}
          onClearInitialTaskId={() => setSelectedTaskId(null)}
          onClearPrefillCreateTask={() => setPrefillCreateTask(null)}
          onOpenSponsor={handleOpenSponsorDetail}
          onOpenOpportunity={handleOpenOpportunityDetail}
          onOpenCampaign={handleOpenCampaignDetail}
        />
      ) : activeSection === 'collections' ? (
        <CollectionsWorkspace
          key={`collections-${externalDataNonce}`}
          showDevControls={showDevControls}
          onOpenSponsor={handleOpenSponsorDetail}
          onOpenOpportunity={handleOpenOpportunityDetail}
        />
      ) : activeSection === 'analytics' ? (
        <AnalyticsWorkspace
          key={`analytics-${externalDataNonce}`}
          showDevControls={showDevControls}
          onOpenCampaign={handleOpenCampaignDetail}
          onOpenCampaigns={() => handleSelectSection('campaigns')}
          onOpenSponsors={() => handleSelectSection('sponsors')}
          onOpenPipeline={() => handleSelectSection('pipeline')}
        />
      ) : activeSection === 'team-settings' ? (
        <TeamSettingsWorkspace />
      ) : (
        <GrowthAnalystWorkspace
          session={analystSession}
          activeContextSection={lastContextSection}
          activeRecordContext={activeRecordContext}
          initialDraft={analystPromptContext}
          autoStartVoiceNonce={autoStartVoiceNonce}
          onEditAction={handleEditAnalystAction}
          onOpenRecord={handleOpenLinkedRecord}
          onOpenAiViewScreen={handleOpenAiViewScreen}
        />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SeasonProvider>
        <AuthenticatedWorkspace />
      </SeasonProvider>
    </AuthProvider>
  );
}

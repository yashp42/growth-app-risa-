import { CurrentOutlookCard } from './CurrentOutlookCard';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import {
  createEmptyOverviewPayload,
  fetchOverviewSnapshot,
} from '../../services/overviewApi';
import type { AiViewSpec, SavedAnalystView } from '../../types/analyst';
import type {
  ApiErrorInfo,
  CampaignPerformanceRow,
  CampaignSortConfig,
  CampaignSortKey,
  DataClassFilter,
  DataLoadStatus,
  FunnelStageRecord,
  GrowthPulseMetric,
  NavSectionId,
  NeedsAttentionItem,
  OverviewFilterState,
  ScenarioKey,
} from '../../types/overview';
import { AiViewRenderer } from '../analyst/AiViewRenderer';
import { SlideOverDrawer } from '../ui/SlideOverDrawer';
import { CampaignPerformanceSection } from './CampaignPerformanceSection';
import { GrowthPulseSection } from './GrowthPulseSection';
import { NeedsAttentionQueueSection } from './NeedsAttentionQueueSection';
import {
  OverviewHeaderFilters,
  type PreviewStateMode,
} from './OverviewHeaderFilters';
import { StrategicBetsSection } from './StrategicBetsSection';
import { TargetPacingSection } from './TargetPacingSection';
import { OverviewFunnel } from './OverviewFunnel';
import { OverviewCampaignHighlights } from './OverviewCampaignHighlights';
import { TeamExecutionSection } from './TeamExecutionSection';

interface OverviewDashboardProps {
  showDevControls: boolean;
  onNavigateSection: (section: NavSectionId) => void;
  onOpenCampaignDetail?: (campaignId: string) => void;
  onOpenRecord?: (recordType: string, recordId: string) => void;
  savedViews?: SavedAnalystView[];
  activeViewSpec?: AiViewSpec | null;
  viewPreviewPending?: boolean;
  onSelectSavedView?: (view: SavedAnalystView) => void;
  onKeepView?: () => void;
  onUndoView?: () => void;
  onClearView?: () => void;
  onDeleteSavedView?: (id: string) => void;
  onOpenAiViewScreen?: (
    screen: AiViewSpec['screen'],
    filters?: Record<string, string>
  ) => void;
}

export function OverviewDashboard({
  showDevControls,
  onNavigateSection,
  onOpenCampaignDetail,
  onOpenRecord,
  savedViews = [],
  activeViewSpec = null,
  viewPreviewPending = false,
  onSelectSavedView,
  onKeepView,
  onUndoView,
  onClearView,
  onDeleteSavedView,
  onOpenAiViewScreen,
}: OverviewDashboardProps) {
  const { editionId, recordClass, asOf } = useSeason();

  const [dataClass, setDataClass] = useState<DataClassFilter>(() => {
    const p = new URLSearchParams(window.location.search).get('dataClass');
    return p === 'cash' || p === 'in_kind' ? p : 'all';
  });
  const [campaignId, setCampaignId] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('campaignFilter') || 'all';
  });

  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [previewMode, setPreviewMode] = useState<PreviewStateMode>('default');
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string | null>(
    null
  );

  const [sortConfig, setSortConfig] = useState<CampaignSortConfig>({
    key: 'signedValue',
    direction: 'desc',
  });

  const [inspectedStage, setInspectedStage] = useState<FunnelStageRecord | null>(
    null
  );
  const [cashOutcomeDrawerOpen, setCashOutcomeDrawerOpen] = useState(false);
  const [inspectedMetric, setInspectedMetric] =
    useState<GrowthPulseMetric | null>(null);
  const [campaignDrawerOpen, setCampaignDrawerOpen] = useState(false);
  const [inspectedCampaign, setInspectedCampaign] =
    useState<CampaignPerformanceRow | null>(null);

  useEffect(() => {
    if (!showDevControls && previewMode !== 'default') {
      setPreviewMode('default');
    }
  }, [showDevControls, previewMode]);

  useEffect(() => {
    if (!activeViewSpec) {
      setSelectedSavedViewId(null);
    }
  }, [activeViewSpec]);

  // Preserve campaignFilter and dataClass in URL for drill-through continuity
  useEffect(() => {
    const url = new URL(window.location.href);
    if (campaignId !== 'all') url.searchParams.set('campaignFilter', campaignId);
    else url.searchParams.delete('campaignFilter');
    if (dataClass !== 'all') url.searchParams.set('dataClass', dataClass);
    else url.searchParams.delete('dataClass');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [campaignId, dataClass]);

  const filters = useMemo<OverviewFilterState>(
    () => ({
      editionId,
      recordClass,
      asOf,
      dataClass,
      campaignId,
    }),
    [editionId, recordClass, asOf, dataClass, campaignId]
  );

  const effectiveMode = showDevControls ? previewMode : 'default';

  const overviewQuery = useQuery({
    queryKey: [
      'overview-snapshot',
      editionId,
      recordClass,
      asOf,
      dataClass,
      campaignId,
      scenario,
      effectiveMode,
    ],
    queryFn: ({ signal }) =>
      fetchOverviewSnapshot(filters, scenario, effectiveMode, signal),
  });

  const status: DataLoadStatus = overviewQuery.isLoading
    ? 'loading'
    : overviewQuery.isError
      ? 'error'
      : overviewQuery.data?.status ?? 'ready';

  const payload =
    overviewQuery.data?.payload ?? createEmptyOverviewPayload(scenario, filters);

  const error: ApiErrorInfo | null = overviewQuery.isError
    ? {
        code:
          (overviewQuery.error as { code?: string } | null)?.code ?? 'API_ERROR',
        message:
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : 'Sponsorship metrics could not be retrieved right now.',
        endpoint:
          (overviewQuery.error as { endpoint?: string } | null)?.endpoint ??
          '/api/metrics/query',
      }
    : overviewQuery.data?.error ?? null;

  const handleRetry = useCallback(() => {
    setPreviewMode('default');
    void overviewQuery.refetch();
  }, [overviewQuery]);

  const handleRefresh = useCallback(() => {
    void overviewQuery.refetch();
  }, [overviewQuery]);

  const handleSortChange = (key: CampaignSortKey) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : {
            key,
            direction:
              key === 'campaignName' || key === 'ownerName' ? 'asc' : 'desc',
          }
    );
  };

  const handleInspectAttentionItem = (item: NeedsAttentionItem | null) => {
    if (!item) return;
    if (item.targetEntityType === 'collections') {
      onNavigateSection('collections');
      return;
    }
    if (item.targetEntityType === 'analytics') {
      onNavigateSection('analytics');
      return;
    }
    if (item.targetEntityType && item.targetEntityId && onOpenRecord) {
      onOpenRecord(item.targetEntityType, item.targetEntityId);
      return;
    }
    if (item.category === 'overdue_follow_ups') {
      onNavigateSection('tasks');
    } else if (item.category === 'collection_risks') {
      onNavigateSection('collections');
    } else if (item.category === 'campaign_warnings') {
      onNavigateSection('analytics');
    } else {
      onNavigateSection('pipeline');
    }
  };

  return (
    <div className="space-y-10 pb-8">
      {/* A. Page heading and global filters */}
      <OverviewHeaderFilters
        filters={filters}
        campaignOptions={payload.campaignOptions}
        onChangeDataClass={setDataClass}
        onChangeCampaignId={setCampaignId}
        showDevControls={showDevControls}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
        onRefresh={handleRefresh}
        asOfTimestamp={payload.asOfTimestamp}
        savedViews={savedViews}
        activeSavedViewId={selectedSavedViewId}
        hasActiveView={Boolean(activeViewSpec)}
        onSelectSavedView={(view) => {
          setSelectedSavedViewId(view.id);
          onSelectSavedView?.(view);
        }}
        onDeleteSavedView={(id) => {
          if (selectedSavedViewId === id) {
            setSelectedSavedViewId(null);
            onClearView?.();
          }
          onDeleteSavedView?.(id);
        }}
        onClearActiveView={() => {
          setSelectedSavedViewId(null);
          onClearView?.();
        }}
      />

      {/* A2. My view (Analyst-configured or saved custom view above standard sections) */}
      {activeViewSpec &&
      (activeViewSpec.screen === 'overview' || selectedSavedViewId !== null) ? (
        <AiViewRenderer
          viewSpec={activeViewSpec}
          isPreview={viewPreviewPending}
          onKeepView={onKeepView}
          onUndoView={onUndoView}
          onClearView={() => {
            setSelectedSavedViewId(null);
            onClearView?.();
          }}
          onOpenScreen={
            activeViewSpec.screen !== 'overview' ? onOpenAiViewScreen : undefined
          }
        />
      ) : null}

      {/* B. Growth pulse */}
      <GrowthPulseSection
        metrics={payload.pulseMetrics}
        status={status}
        error={error}
        onRetry={handleRetry}
        onInspectMetric={(metric) => setInspectedMetric(metric)}
        recordClass={recordClass}
        asOfDate={asOf}
      />
      <CurrentOutlookCard />
      <div className="overview-main-grid">
        <TargetPacingSection pacing={payload.targetPacing} selectedScenario={scenario} onSelectScenario={setScenario} status={status} error={error} onRetry={handleRetry} recordClass={recordClass} asOfDate={asOf}/>
        <OverviewFunnel status={status} error={error} onRetry={handleRetry} stages={payload.funnelStages} cashOutcome={payload.cashOutcome} onSelectStage={setInspectedStage} onInspectCashOutcome={()=>setCashOutcomeDrawerOpen(true)}/>
      </div>
      <div className="overview-main-grid overview-lower-grid">
        <NeedsAttentionQueueSection items={payload.attentionItems} status={status} error={error} onRetry={handleRetry} onInspectItem={handleInspectAttentionItem}/>
        <OverviewCampaignHighlights status={status} error={error} onRetry={handleRetry} campaigns={payload.campaigns} onViewAll={()=>onNavigateSection('campaigns')} onOpen={campaign=>{if(campaign.id&&onOpenCampaignDetail){onOpenCampaignDetail(campaign.id);return;}setInspectedCampaign(campaign);setCampaignDrawerOpen(true);}}/>
      </div>
      <details className="overview-more"><summary>Growth initiatives &amp; team execution</summary><div className="mt-5 space-y-7">
        <StrategicBetsSection bets={payload.strategicBets} status={status} error={error} onRetry={handleRetry} recordClass={recordClass} asOfDate={asOf}/>
        <TeamExecutionSection execution={payload.teamExecution} status={status} error={error} onRetry={handleRetry} onNavigateSection={onNavigateSection}/>
      </div></details>
      <details className="overview-more"><summary>Full campaign comparison</summary><div className="mt-5">
        <CampaignPerformanceSection campaigns={payload.campaigns} sortConfig={sortConfig} onChangeSort={handleSortChange} onOpenCampaignProfile={campaign=>{if(campaign?.id&&onOpenCampaignDetail){onOpenCampaignDetail(campaign.id);return;}setInspectedCampaign(campaign);setCampaignDrawerOpen(true);}} onNavigateCampaigns={()=>onNavigateSection('campaigns')} status={status} error={error} onRetry={handleRetry}/>
      </div></details>

      {/* Funnel stage inspection drawer */}
      <SlideOverDrawer
        open={Boolean(inspectedStage)}
        onClose={() => setInspectedStage(null)}
        meta={`${inspectedStage?.metricId ?? 'Metric'} · ${recordClass} · As of ${asOf}`}
        title={inspectedStage?.label ?? ''}
        subtitle={inspectedStage?.description}
      >
        {inspectedStage ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
                <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                  Count
                </p>
                <p className="mt-1 text-[20px] font-semibold text-[var(--color-ink)] tabular-nums">
                  {inspectedStage.count ?? '—'}
                </p>
              </div>
              <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
                <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                  Conversion rate
                </p>
                <p className="mt-1 text-[20px] font-semibold text-[var(--color-ink)] tabular-nums">
                  {inspectedStage.rateFormatted ?? inspectedStage.reason ?? '—'}
                </p>
              </div>
              <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
                <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                  Cash value (separate)
                </p>
                <p className="mt-1 font-mono text-[14px] font-medium text-[var(--color-ink)] tabular-nums">
                  {inspectedStage.cashValueFormatted ?? '—'}
                </p>
              </div>
              <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
                <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                  In-kind / note
                </p>
                <p className="mt-1 font-mono text-[14px] font-medium text-[var(--color-ink)] tabular-nums">
                  {inspectedStage.inKindValueFormatted ?? '—'}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setInspectedStage(null);
                  onNavigateSection('pipeline');
                }}
                className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
              >
                Open Pipeline
              </button>
            </div>
          </div>
        ) : null}
      </SlideOverDrawer>

      {/* Connected cash outcome inspection drawer */}
      <SlideOverDrawer
        open={cashOutcomeDrawerOpen}
        onClose={() => setCashOutcomeDrawerOpen(false)}
        meta={`Financial outcome · ${recordClass} · As of ${asOf}`}
        title="Cash collected & collection rate"
        subtitle={payload.cashOutcome.definitionNote}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Cleared cash collected
              </p>
              <p className="mt-1 text-[20px] font-semibold text-[var(--color-ink)] tabular-nums">
                {payload.cashOutcome.collectedCashFormatted ??
                  payload.cashOutcome.collectedReason ??
                  'Not computable'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Collection rate
              </p>
              <p className="mt-1 text-[20px] font-semibold text-[var(--color-accent)] tabular-nums">
                {payload.cashOutcome.collectionRateFormatted ??
                  payload.cashOutcome.collectionRateReason ??
                  'Not computable'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Signed cash basis
              </p>
              <p className="mt-1 font-mono text-[14px] font-medium text-[var(--color-ink)] tabular-nums">
                {payload.cashOutcome.confirmedCashBasisFormatted ?? '—'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                In-kind value (non-cash)
              </p>
              <p className="mt-1 font-mono text-[14px] font-medium text-[var(--color-ink-muted)] tabular-nums">
                {payload.cashOutcome.inKindValueSeparateFormatted ?? '—'}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setCashOutcomeDrawerOpen(false);
                onNavigateSection('collections');
              }}
              className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
            >
              Open Collections
            </button>
          </div>
        </div>
      </SlideOverDrawer>

      {/* Growth pulse metric definition drawer */}
      <SlideOverDrawer
        open={Boolean(inspectedMetric)}
        onClose={() => setInspectedMetric(null)}
        meta={`${inspectedMetric?.metricId ?? 'Metric'} · ${recordClass} · As of ${asOf}`}
        title={inspectedMetric?.label ?? ''}
        subtitle={inspectedMetric?.supportingLabel}
      >
        {inspectedMetric ? (
          <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4">
            <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
              Current value ({recordClass} · as of {asOf})
            </p>
            <p className="mt-1 text-[22px] font-semibold text-[var(--color-ink)] tabular-nums">
              {inspectedMetric.computable && inspectedMetric.formattedValue
                ? inspectedMetric.formattedValue
                : inspectedMetric.reason || 'Not computable'}
            </p>
            {inspectedMetric.secondaryBreakdownLabel ? (
              <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
                {inspectedMetric.secondaryBreakdownLabel}
              </p>
            ) : null}
          </div>
        ) : null}
      </SlideOverDrawer>

      {/* Campaign profile drawer */}
      <SlideOverDrawer
        open={campaignDrawerOpen}
        onClose={() => {
          setCampaignDrawerOpen(false);
          setInspectedCampaign(null);
        }}
        meta={`Campaign · ${recordClass} · As of ${asOf}`}
        title={inspectedCampaign?.campaignName ?? 'Campaign profile'}
        subtitle={
          inspectedCampaign ? `Owner: ${inspectedCampaign.ownerName}` : undefined
        }
      >
        {inspectedCampaign ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">Pipeline</p>
              <p className="mt-1 font-mono text-[15px] font-medium text-[var(--color-ink)] tabular-nums">
                {inspectedCampaign.pipelineFormatted ?? '—'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">Proposals</p>
              <p className="mt-1 font-mono text-[15px] font-medium text-[var(--color-ink)] tabular-nums">
                {inspectedCampaign.proposalCount ?? '—'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Signed value
              </p>
              <p className="mt-1 font-mono text-[15px] font-medium text-[var(--color-ink)] tabular-nums">
                {inspectedCampaign.signedFormatted ?? '—'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Signed cash
              </p>
              <p className="mt-1 font-mono text-[15px] font-medium text-[var(--color-ink)] tabular-nums">
                {inspectedCampaign.signedCashFormatted ?? '—'}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Collected
              </p>
              <p className="mt-1 font-mono text-[15px] font-medium text-[var(--color-accent)] tabular-nums">
                {inspectedCampaign.collectedCashFormatted ?? '—'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[14px] text-[var(--color-ink-muted)]">No campaign selected.</p>
        )}
      </SlideOverDrawer>
    </div>
  );
}

# Product UI redesign

Frontend-only implementation; backend contracts, schemas, metrics, approved strategy, source data, authentication and permissions are unchanged.

## Transformation

Shared tokens, typography, table treatment, forms and overlay patterns now span the existing modules. The shell has fewer competing controls and a keyboard skip link. Overview brings pacing and exceptions together after the season measures. Campaigns has a functional core/all-metrics view. Sponsors have clearer identity. Pipeline stages use locally scrolling lanes with independently scrollable deal lists. Tasks retain their operations with the shared typography and forms. Collections emphasizes collected cash, preserves financial qualifications and explains the allocation empty state. Analytics puts calculation/source detail behind disclosure while keeping existing tabs and comparisons.

Growth Analyst is conversation-first: empty evidence/action workspaces are removed, evidence opens on demand, and actions remain with their proposing turn. The composer and starter prompts are quieter. Technical context, quotas and raw errors are secondary disclosures. Source figures, verification warnings and citations remain accessible.

The orb has one restrained material surface with transform/opacity motion and reduced-motion support. A focused native voice dialog uses actual microphone activity and recognised transcript. Speech lifecycle events drive speaking state, with explicit stop/close controls, stale-event protection and unsupported-browser feedback. Voice input still uses the existing browser-native APIs. Existing human confirmation remains intact.

## Verification and limits

See PR #7 for the latest TypeScript/build/regression results. New MOCKED tests exercise speech start/end/error/cancel/replacement behavior and the conversation-first empty layout. Existing source-block tests retain their original expected provenance strings behind the new disclosures.

The existing deployed application was inspected, but this branch has not been deployed for visual acceptance. Physical microphone permission/recognition/playback, real-device responsive checks, route/navigation interaction and frame-rate measurements remain LIVE acceptance items. Static markup and CI are not a screenshot or browser-performance pass. No new business values or mocked product responses are shipped.

## File manifest

- Created: `SPONSORSHIP_GROWTH_PLATFORM_UI_DESIGN_GUIDELINES.md`
- Created: `scripts/test-product-ui.ts`
- Modified: `src/components/analyst/ActionConfirmationDialog.tsx`
- Modified: `src/components/analyst/AiViewRenderer.tsx`
- Modified: `src/components/analyst/AnalystOrb.tsx`
- Modified: `src/components/analyst/AnswerBlocks.tsx`
- Modified: `src/components/analyst/ChatComposer.tsx`
- Modified: `src/components/analyst/ChatMessage.tsx`
- Modified: `src/components/analyst/CitationList.tsx`
- Modified: `src/components/analyst/DataContextHeader.tsx`
- Modified: `src/components/analyst/EvidencePanel.tsx`
- Modified: `src/components/analyst/GrowthAnalystChat.tsx`
- Modified: `src/components/analyst/GrowthAnalystLauncher.tsx`
- Modified: `src/components/analyst/GrowthAnalystPanel.tsx`
- Modified: `src/components/analyst/GrowthAnalystWorkspace.tsx`
- Modified: `src/components/analyst/MarkdownAnswer.tsx`
- Modified: `src/components/analyst/MetricEvidenceCard.tsx`
- Modified: `src/components/analyst/OrbStage.tsx`
- Modified: `src/components/analyst/ProposedActionCard.tsx`
- Modified: `src/components/analyst/ReadAloudToggle.tsx`
- Created: `src/components/analyst/VoiceMode.tsx`
- Modified: `src/components/analytics/AnalyticsMetricCard.tsx`
- Modified: `src/components/analytics/AnalyticsWorkspace.tsx`
- Modified: `src/components/analytics/CampaignChannelComparisonSection.tsx`
- Modified: `src/components/analytics/FunnelDiagnosticsSection.tsx`
- Modified: `src/components/analytics/MetricExplorerSection.tsx`
- Modified: `src/components/analytics/PerformancePacingSection.tsx`
- Modified: `src/components/analytics/StrategyPipelineCapacitySection.tsx`
- Modified: `src/components/auth/DemoLandingScreen.tsx`
- Modified: `src/components/campaigns/CampaignDetailView.tsx`
- Modified: `src/components/campaigns/CampaignFormDrawer.tsx`
- Modified: `src/components/campaigns/CampaignPortfolioPage.tsx`
- Modified: `src/components/collections/AllocateReceiptDrawer.tsx`
- Modified: `src/components/collections/CollectionsOverviewSection.tsx`
- Modified: `src/components/collections/CollectionsWorkspacePage.tsx`
- Modified: `src/components/collections/InvoiceFormDrawer.tsx`
- Modified: `src/components/collections/PaymentScheduleFormDrawer.tsx`
- Modified: `src/components/collections/PaymentTermsDrawer.tsx`
- Modified: `src/components/collections/ReceiptFormDrawer.tsx`
- Modified: `src/components/modules/ModulePlaceholderView.tsx`
- Modified: `src/components/overview/CampaignPerformanceSection.tsx`
- Modified: `src/components/overview/GrowthPulseSection.tsx`
- Modified: `src/components/overview/NeedsAttentionQueueSection.tsx`
- Modified: `src/components/overview/OverviewDashboard.tsx`
- Modified: `src/components/overview/OverviewHeaderFilters.tsx`
- Modified: `src/components/overview/SponsorshipFunnelSection.tsx`
- Modified: `src/components/overview/StrategicBetsSection.tsx`
- Modified: `src/components/overview/TargetPacingSection.tsx`
- Modified: `src/components/overview/TeamExecutionSection.tsx`
- Modified: `src/components/pipeline/ConfirmOpportunityDrawer.tsx`
- Modified: `src/components/pipeline/OpportunityDetailView.tsx`
- Modified: `src/components/pipeline/OpportunityFormDrawer.tsx`
- Modified: `src/components/pipeline/OpportunityStageDrawer.tsx`
- Modified: `src/components/pipeline/PipelineDirectoryPage.tsx`
- Modified: `src/components/settings/AuditLogPanel.tsx`
- Modified: `src/components/settings/EvaluationPanel.tsx`
- Modified: `src/components/settings/TeamSettingsWorkspace.tsx`
- Modified: `src/components/shell/AppShell.tsx`
- Modified: `src/components/shell/GlobalSearchModal.tsx`
- Modified: `src/components/shell/Sidebar.tsx`
- Modified: `src/components/shell/TopNav.tsx`
- Modified: `src/components/sponsors/ContactFormDrawer.tsx`
- Modified: `src/components/sponsors/SponsorDetailView.tsx`
- Modified: `src/components/sponsors/SponsorDirectoryPage.tsx`
- Modified: `src/components/sponsors/SponsorFormDrawer.tsx`
- Modified: `src/components/tasks/TaskDetailView.tsx`
- Modified: `src/components/tasks/TaskFormDrawer.tsx`
- Modified: `src/components/tasks/TasksDirectoryPage.tsx`
- Modified: `src/components/ui/DataStateWrapper.tsx`
- Modified: `src/components/ui/InfoHint.tsx`
- Modified: `src/components/ui/SectionHeader.tsx`
- Modified: `src/components/ui/SelectControl.tsx`
- Modified: `src/components/ui/SlideOverDrawer.tsx`
- Created: `src/hooks/useDialogFocus.ts`
- Modified: `src/hooks/useGrowthAnalystSession.ts`
- Modified: `src/index.css`
- Modified: `src/lib/orbState.ts`
- Modified: `src/lib/speech.ts`

No source files were removed. The prior design-guideline file was absent from the connected repository; it is created here to document the implemented system.

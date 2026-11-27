import { basicAnalyticsIntent, type BasicAnalyticsIntent } from './basicAnalytics.ts';
import { financialIntent, type FinancialIntent } from './financialAnswers.ts';
import { operationalIntent, type OperationalIntent } from './operationalAnswers.ts';
import { prospectIntent, type ProspectIntent } from './prospectAnswers.ts';
import { strategyIntents, type StrategyIntent } from './strategyAnswers.ts';

export interface AnalystEvidencePlan {
  question: string;
  facets: {
    analytics: BasicAnalyticsIntent | null;
    financial: FinancialIntent | null;
    operational: OperationalIntent | null;
    strategy: StrategyIntent[];
    prospect: ProspectIntent | null;
  };
  requiredEvidence: string[];
  requiredSections: string[];
}

export function planAnalystEvidence(input: {
  question: string;
  previousQuestion?: string;
  hasFilters?: boolean;
  usesUpload?: boolean;
}): AnalystEvidencePlan {
  const { question } = input;
  const previousQuestion = input.previousQuestion ?? '';
  const hasFilters = input.hasFilters ?? false;
  const disabled = input.usesUpload ?? false;
  const facets = {
    analytics: disabled ? null : basicAnalyticsIntent(question, hasFilters, previousQuestion),
    financial: disabled ? null : financialIntent(question, hasFilters),
    operational: disabled ? null : operationalIntent(question, hasFilters, previousQuestion),
    strategy: disabled ? [] : strategyIntents(question, hasFilters),
    prospect: disabled ? null : prospectIntent(question, hasFilters, previousQuestion),
  };
  const requiredEvidence: string[] = [];
  const requiredSections: string[] = [];

  if (facets.analytics === 'campaign_leakage') {
    requiredEvidence.push('M-10, M-17, M-18 and M-19 by campaign', 'M-17, M-18 and M-19 by channel', 'M-13 kept at opportunity grain');
    requiredSections.push('campaign leakage', 'channel stage comparison');
    if (/\b(recommend|actions?)\b/i.test(question)) requiredSections.push('measurable recommendations');
  }
  if (facets.analytics === 'historical_funnel_compare') {
    requiredEvidence.push('M-11, M-12 and M-13 queried separately for ED-2025 and ED-2026-DEMO');
    requiredSections.push('both editions', 'directional comparison', 'interpretation limits');
  }
  if (facets.financial === 'cash_position') {
    requiredEvidence.push('M-02 signed total', 'M-03 signed cash', 'M-04 in-kind', 'M-01 collected cash', 'M-07 outstanding cash');
    requiredSections.push('cash position', 'cash reconciliation');
    if (facets.operational?.kind === 'receivable_followup' || /\b(due dates?|overdue|due-date|urgency)\b/i.test(question)) {
      requiredEvidence.push('permission-scoped receivable schedules and due dates');
      requiredSections.push('due-date evidence');
    }
  }
  if (facets.strategy.includes('growth_bets')) {
    requiredEvidence.push('approved D-010 rules and linked latest observations');
    requiredSections.push('growth-bet evaluation');
  }
  if (facets.strategy.includes('capacity_allocation')) {
    requiredEvidence.push('approved D-009 scenarios, D-010 economics, capacity and current pipeline metrics');
    requiredSections.push('capacity comparison');
  }
  return { question, facets, requiredEvidence, requiredSections };
}

const sectionPatterns: Record<string, RegExp> = {
  'campaign leakage': /qualified[- ]lead leakage by campaign|\|\s*campaign\s*\|/i,
  'channel stage comparison': /stage comparison by acquisition channel/i,
  'measurable recommendations': /recommended actions for this week/i,
  'both editions': /ED-2025[\s\S]*ED-2026-DEMO|ED-2026-DEMO[\s\S]*ED-2025/i,
  'directional comparison': /directional comparison/i,
  'interpretation limits': /interpretation limits/i,
  'cash position': /current cash position/i,
  'cash reconciliation': /reconciliation:/i,
  'due-date evidence': /due-date and urgency evidence/i,
  'growth-bet evaluation': /D-010 approved thresholds evaluated/i,
  'capacity comparison': /approved capacity scenarios|current selected-edition pipeline evidence/i,
};

export function missingPlannedSections(answer: string, plan: AnalystEvidencePlan): string[] {
  return plan.requiredSections.filter((section) => !sectionPatterns[section]?.test(answer));
}

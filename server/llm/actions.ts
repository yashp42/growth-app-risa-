import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  getVerifiedActor,
  requireAuth,
  type AuthDependencies,
} from '../auth.ts';
import type { ServerConfig } from '../config.ts';
import type { DatabasePoolState } from '../db.ts';
import { AppApiError, asyncHandler } from '../errors.ts';
import { isValidIsoDate } from '../gates.ts';
import {
  canConfirmOpportunity,
  evaluatePermission,
  type CanonicalRole,
} from '../permissions.ts';
import {
  assertLinkedRecordExists,
  ensureUiImportBatch,
  fetchAppDataVersion,
  generatePrefixedId,
  getCurrentSponsorOwnerId,
  getOpportunityOwnerId,
  insertAuditEvent,
  isSponsorOwner,
  rejectHistoricalWriteRequest,
  requireWriteRoles,
  resolveWritableEdition,
  resolveWritableEditionByClass,
  runWriteTransaction,
} from '../writeUtils.ts';
import type { OpenRouterToolDefinition } from './openrouter.ts';
import type { QueryablePool } from './tools.ts';

export const ALLOWED_AI_ACTION_TYPES = [
  'create_task',
  'log_interaction',
  'log_meeting',
  'upsert_sponsor_contact',
  'create_sponsor',
  'update_sponsor',
  'change_owner',
  'create_contact',
  'update_contact',
  'create_campaign',
  'update_campaign',
  'log_outreach',
  'record_qualification',
  'create_opportunity',
  'update_opportunity',
  'change_stage',
  'confirm_deal',
  'update_task',
  'log_time',
  'create_network_partner',
  'record_referral',
] as const;

export type AllowedAiActionType = (typeof ALLOWED_AI_ACTION_TYPES)[number];

const SPONSOR_LIFECYCLE_VALUES = [
  'research_target',
  'prospect',
  'active',
  'past_sponsor',
  'do_not_contact',
] as const;

const SPONSOR_FIRST_SOURCE_VALUES = [
  'research',
  'referral',
  'inbound',
  'outreach',
  'renewal',
] as const;

const CONTACT_DECISION_ROLES = [
  'decision_maker',
  'influencer',
  'user',
  'unknown',
] as const;

const CONTACT_CONSENT_BASIS_VALUES = [
  'legitimate_interest',
  'inbound_consent',
  'referral_intro',
  'prior_sponsor',
  'public_directory',
  'unknown',
] as const;

const CAMPAIGN_STATUS_VALUES = ['planned', 'active', 'stopped', 'closed'] as const;

const OUTREACH_ROOT_EVENT_VALUES = [
  'outreach_sent',
  'introduction_received',
  'web_inbound',
] as const;

const INTERACTION_EVENT_VALUES = [
  'outreach_sent',
  'delivered',
  'replied',
  'meeting_booked',
  'meeting_held',
  'opt_out',
  'introduction_received',
  'web_inbound',
  'bounced',
  'meeting_cancelled',
  'follow_up_sent',
  'note',
] as const;

const INTERACTION_OUTCOME_VALUES = [
  'sent',
  'delivered',
  'positive',
  'neutral',
  'not_interested',
  'wrong_contact',
  'scheduled',
  'attended',
  'do_not_contact',
  'introduced',
  'interest_submitted',
  'no_response',
  'bounced',
  'cancelled',
  'completed',
  'other',
] as const;

const MEETING_STATUS_VALUES = ['booked', 'held', 'no_show', 'cancelled'] as const;
const MEETING_PURPOSE_VALUES = [
  'discovery',
  'renewal_screen',
  'title_pitch',
  'negotiation',
] as const;

const QUALIFICATION_STATUS_VALUES = [
  'unreviewed',
  'engaged',
  'qualified',
  'unqualified',
  'dormant',
] as const;

const OPPORTUNITY_SUPPORT_TYPES = ['cash', 'in_kind', 'mixed'] as const;
const OPPORTUNITY_STAGES = [
  'prospecting',
  'contacted',
  'proposal_sent',
  'negotiating',
  'lost',
  'withdrawn',
] as const;

const DROP_REASON_VALUES = [
  'budget_mismatch',
  'timing_fit',
  'category_conflict',
  'terms_dispute',
  'no_response',
  'sla_breach_dropped',
  'sponsor_declined',
  'internal_withdrawn',
  'other',
] as const;

const LOSS_REASON_VALUES = [
  'terms_dispute',
  'budget_mismatch',
  'competitor_exclusivity',
  'timing_fit',
  'no_response',
  'category_conflict',
  'other',
] as const;

const PAYMENT_TERMS_VALUES = ['standard_50_50', '100_upfront', 'custom'] as const;
const TASK_TYPE_VALUES = [
  'follow_up',
  'proposal',
  'invoice',
  'call',
  'pitch',
  'admin',
] as const;
const TASK_STATUS_VALUES = [
  'open',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const;
const TASK_LINKED_TYPE_VALUES = [
  'sponsor',
  'opportunity',
  'invoice',
  'campaign',
  'referral',
] as const;
const PARTNER_TYPE_VALUES = [
  'creator',
  'vc_fund',
  'alumnus',
  'past_sponsor',
  'other',
] as const;
const PARTNER_STATUS_VALUES = ['invited', 'active', 'inactive'] as const;
const REFERRAL_STATUS_VALUES = [
  'speculative',
  'committed',
  'met',
  'declined',
  'lapsed',
] as const;

function sortKeysRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursively);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort()) {
      if (record[k] !== undefined) {
        sorted[k] = sortKeysRecursively(record[k]);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysRecursively(value));
}

export function computePayloadSha256(payload: Record<string, unknown>): string {
  return crypto
    .createHash('sha256')
    .update(canonicalJsonStringify(payload))
    .digest('hex');
}

function getProp<T = unknown>(
  obj: Record<string, unknown>,
  ...keys: string[]
): T | undefined {
  for (const key of keys) {
    if (key in obj && obj[key] !== undefined) {
      return obj[key] as T;
    }
  }
  return undefined;
}

function normalizeTimestamp(val: unknown): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const s = String(val).trim();
  if (!s) return undefined;
  if (isValidIsoDate(s)) {
    return `${s}T18:00:00+05:30`;
  }
  return s;
}

function normalizeConsentBasis(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  const aliases: Record<string, string> = {
    inbound_form: 'inbound_consent',
    warm_introduction: 'referral_intro',
    public_profile: 'public_directory',
    past_sponsor: 'prior_sponsor',
  };
  return aliases[s] ?? s;
}

function stripInternalPayloadMeta(
  rawObj: Record<string, unknown>
): Record<string, unknown> {
  if (!rawObj || typeof rawObj !== 'object') return {};
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawObj)) {
    if (k === '_preview' || k === '_target_guard') continue;
    copy[k] = v;
  }
  return copy;
}

function parseActionPayload(
  actionType: AllowedAiActionType,
  rawInput: Record<string, unknown>
): Record<string, unknown> {
  const rawObj = stripInternalPayloadMeta(rawInput);
  const errForbiddenFields = (keys: string[]) => {
    for (const k of keys) {
      if (k in rawObj && rawObj[k] !== undefined) {
        throw new AppApiError(
          422,
          'FORBIDDEN_PAYLOAD_FIELD',
          `Field "${k}" is not allowed in AI action "${actionType}".`
        );
      }
    }
  };

  errForbiddenFields(['is_deleted', 'isDeleted']);

  switch (actionType) {
    case 'create_task': {
      const schema = z.object({
        title: z.string().trim().min(1).max(240),
        task_type: z.enum(TASK_TYPE_VALUES).default('follow_up'),
        owner_member_id: z.string().trim().min(1).optional(),
        due_at: z.string().trim().min(1),
        status: z.enum(TASK_STATUS_VALUES).default('open'),
        linked_type: z.enum(TASK_LINKED_TYPE_VALUES).nullable().optional(),
        linked_id: z.string().trim().min(1).nullable().optional(),
        bet_id: z.string().trim().min(1).nullable().optional(),
      });
      const inferredLinkedId =
        getProp<string>(rawObj, 'linked_id', 'linkedId', 'opportunity_id', 'opportunityId') ||
        null;
      const inferredLinkedType =
        getProp<string>(rawObj, 'linked_type', 'linkedType') ||
        (getProp(rawObj, 'opportunity_id', 'opportunityId')
          ? 'opportunity'
          : inferredLinkedId
            ? inferredLinkedId.startsWith('S2')
              ? 'sponsor'
              : 'opportunity'
            : null);
      const parsed = schema.parse({
        title: getProp(rawObj, 'title'),
        task_type: getProp(rawObj, 'task_type', 'taskType') ?? 'follow_up',
        owner_member_id:
          getProp(rawObj, 'owner_member_id', 'ownerMemberId') || undefined,
        due_at:
          normalizeTimestamp(getProp(rawObj, 'due_at', 'dueAt')) ?? undefined,
        status: getProp(rawObj, 'status') ?? 'open',
        linked_type: inferredLinkedType,
        linked_id: inferredLinkedId,
        bet_id: getProp(rawObj, 'bet_id', 'betId') || null,
      });
      if (Boolean(parsed.linked_type) !== Boolean(parsed.linked_id)) {
        throw new AppApiError(
          400,
          'INVALID_LINKED_PAIR',
          'linked_type and linked_id must both be provided together.'
        );
      }
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'update_task': {
      const schema = z.object({
        task_id: z.string().trim().min(1),
        title: z.string().trim().min(1).max(240).optional(),
        task_type: z.enum(TASK_TYPE_VALUES).optional(),
        owner_member_id: z.string().trim().min(1).optional(),
        due_at: z.string().trim().min(1).optional(),
        status: z.enum(TASK_STATUS_VALUES).optional(),
        linked_type: z.enum(TASK_LINKED_TYPE_VALUES).nullable().optional(),
        linked_id: z.string().trim().min(1).nullable().optional(),
        bet_id: z.string().trim().min(1).nullable().optional(),
      });
      const parsed = schema.parse({
        task_id: getProp(rawObj, 'task_id', 'taskId', 'id'),
        title: getProp(rawObj, 'title'),
        task_type: getProp(rawObj, 'task_type', 'taskType'),
        owner_member_id: getProp(rawObj, 'owner_member_id', 'ownerMemberId'),
        due_at: normalizeTimestamp(getProp(rawObj, 'due_at', 'dueAt')),
        status: getProp(rawObj, 'status'),
        linked_type: getProp(rawObj, 'linked_type', 'linkedType'),
        linked_id: getProp(rawObj, 'linked_id', 'linkedId'),
        bet_id: getProp(rawObj, 'bet_id', 'betId'),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'log_interaction': {
      const schema = z.object({
        attempt_id: z.string().trim().min(1),
        origin_interaction_id: z.string().trim().min(1).nullable().optional(),
        event_type: z.enum(INTERACTION_EVENT_VALUES),
        outcome: z.enum(INTERACTION_OUTCOME_VALUES).nullable().optional(),
        occurred_at: z.string().trim().min(1).optional(),
        summary: z.string().trim().max(1000).nullable().optional(),
      });
      const parsed = schema.parse({
        attempt_id: getProp(rawObj, 'attempt_id', 'attemptId'),
        origin_interaction_id:
          getProp(rawObj, 'origin_interaction_id', 'originInteractionId') || null,
        event_type: getProp(rawObj, 'event_type', 'eventType'),
        outcome: getProp(rawObj, 'outcome') || null,
        occurred_at: normalizeTimestamp(getProp(rawObj, 'occurred_at', 'occurredAt')),
        summary: getProp(rawObj, 'summary') || null,
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'log_meeting': {
      const schema = z.object({
        sponsor_id: z.string().trim().min(1),
        attempt_id: z.string().trim().min(1).nullable().optional(),
        opportunity_id: z.string().trim().min(1).nullable().optional(),
        scheduled_at: z.string().trim().min(1),
        status: z.enum(MEETING_STATUS_VALUES).default('booked'),
        purpose: z.enum(MEETING_PURPOSE_VALUES).nullable().optional(),
        attendee_member_ids: z.array(z.string().trim().min(1)).nullable().optional(),
        outcome_note: z.string().trim().max(2000).nullable().optional(),
      });
      const parsed = schema.parse({
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId'),
        attempt_id: getProp(rawObj, 'attempt_id', 'attemptId') || null,
        opportunity_id: getProp(rawObj, 'opportunity_id', 'opportunityId') || null,
        scheduled_at:
          normalizeTimestamp(getProp(rawObj, 'scheduled_at', 'scheduledAt')) ??
          undefined,
        status: getProp(rawObj, 'status') ?? 'booked',
        purpose: getProp(rawObj, 'purpose') || null,
        attendee_member_ids:
          getProp<string[]>(
            rawObj,
            'attendee_member_ids',
            'attendeeMemberIds'
          ) || null,
        outcome_note: getProp(rawObj, 'outcome_note', 'outcomeNote') || null,
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'upsert_sponsor_contact': {
      const schema = z
        .object({
          sponsor_id: z.string().trim().min(1).optional(),
          sponsor_display_name: z.string().trim().min(1).max(200).optional(),
          category_id: z.string().trim().min(1).nullable().optional(),
          lifecycle_status: z.enum(SPONSOR_LIFECYCLE_VALUES).optional(),
          contact_id: z.string().trim().min(1).optional(),
          full_name: z.string().trim().min(1).max(200),
          job_title: z.string().trim().max(160).nullable().optional(),
          decision_role: z.enum(CONTACT_DECISION_ROLES).default('unknown'),
          email: z.string().trim().email().max(240).nullable().optional(),
          phone: z.string().trim().max(64).nullable().optional(),
          consent_basis: z
            .enum(CONTACT_CONSENT_BASIS_VALUES)
            .nullable()
            .optional(),
        })
        .refine(
          (d) => Boolean(d.contact_id || d.sponsor_id || d.sponsor_display_name),
          'Provide contact_id, sponsor_id, or sponsor_display_name.'
        );
      const rawEmail = getProp(rawObj, 'email');
      const parsed = schema.parse({
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId') || undefined,
        sponsor_display_name:
          getProp(rawObj, 'sponsor_display_name', 'sponsorDisplayName') ||
          undefined,
        category_id: getProp(rawObj, 'category_id', 'categoryId') || undefined,
        lifecycle_status: getProp(
          rawObj,
          'lifecycle_status',
          'lifecycleStatus'
        ),
        contact_id: getProp(rawObj, 'contact_id', 'contactId') || undefined,
        full_name: getProp(rawObj, 'full_name', 'fullName'),
        job_title: getProp(rawObj, 'job_title', 'jobTitle') || null,
        decision_role:
          getProp(rawObj, 'decision_role', 'decisionRole') ?? 'unknown',
        email: rawEmail === '' || rawEmail == null ? null : rawEmail,
        phone: getProp(rawObj, 'phone') || null,
        consent_basis: normalizeConsentBasis(
          getProp(rawObj, 'consent_basis', 'consentBasis')
        ),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'create_sponsor': {
      const schema = z.object({
        display_name: z.string().trim().min(1).max(200),
        legal_name: z.string().trim().max(240).nullable().optional(),
        category_id: z.string().trim().min(1).nullable().optional(),
        lifecycle_status: z.enum(SPONSOR_LIFECYCLE_VALUES).default('prospect'),
        first_source: z.enum(SPONSOR_FIRST_SOURCE_VALUES).nullable().optional(),
        website: z.string().trim().max(300).nullable().optional(),
        city: z.string().trim().max(120).nullable().optional(),
        owner_member_id: z.string().trim().min(1).nullable().optional(),
      });
      const parsed = schema.parse({
        display_name: getProp(rawObj, 'display_name', 'displayName'),
        legal_name: getProp(rawObj, 'legal_name', 'legalName') || null,
        category_id: getProp(rawObj, 'category_id', 'categoryId') || null,
        lifecycle_status:
          getProp(rawObj, 'lifecycle_status', 'lifecycleStatus') ?? 'prospect',
        first_source: getProp(rawObj, 'first_source', 'firstSource') || null,
        website: getProp(rawObj, 'website') || null,
        city: getProp(rawObj, 'city') || null,
        owner_member_id:
          getProp(rawObj, 'owner_member_id', 'ownerMemberId') || null,
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'update_sponsor': {
      const schema = z.object({
        sponsor_id: z.string().trim().min(1),
        display_name: z.string().trim().min(1).max(200).optional(),
        legal_name: z.string().trim().max(240).nullable().optional(),
        category_id: z.string().trim().min(1).nullable().optional(),
        lifecycle_status: z.enum(SPONSOR_LIFECYCLE_VALUES).optional(),
        first_source: z.enum(SPONSOR_FIRST_SOURCE_VALUES).nullable().optional(),
        website: z.string().trim().max(300).nullable().optional(),
        city: z.string().trim().max(120).nullable().optional(),
      });
      const parsed = schema.parse({
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId', 'id'),
        display_name: getProp(rawObj, 'display_name', 'displayName'),
        legal_name: getProp(rawObj, 'legal_name', 'legalName'),
        category_id: getProp(rawObj, 'category_id', 'categoryId'),
        lifecycle_status: getProp(
          rawObj,
          'lifecycle_status',
          'lifecycleStatus'
        ),
        first_source: getProp(rawObj, 'first_source', 'firstSource'),
        website: getProp(rawObj, 'website'),
        city: getProp(rawObj, 'city'),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'change_owner': {
      const schema = z.object({
        subject_type: z.enum(['sponsor', 'opportunity', 'network_partner']),
        subject_id: z.string().trim().min(1),
        member_id: z.string().trim().min(1),
        reason: z.string().trim().max(300).nullable().optional(),
        role_in_relationship: z.enum(['owner', 'support']).default('owner'),
      });
      const parsed = schema.parse({
        subject_type: getProp(rawObj, 'subject_type', 'subjectType'),
        subject_id: getProp(rawObj, 'subject_id', 'subjectId'),
        member_id: getProp(rawObj, 'member_id', 'memberId', 'owner_member_id'),
        reason: getProp(rawObj, 'reason') || null,
        role_in_relationship:
          getProp(rawObj, 'role_in_relationship', 'roleInRelationship') ??
          'owner',
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'create_contact': {
      const schema = z.object({
        sponsor_id: z.string().trim().min(1),
        full_name: z.string().trim().min(1).max(200),
        job_title: z.string().trim().max(160).nullable().optional(),
        decision_role: z.enum(CONTACT_DECISION_ROLES).default('unknown'),
        email: z.string().trim().email().max(240).nullable().optional(),
        phone: z.string().trim().max(64).nullable().optional(),
        consent_basis: z
          .enum(CONTACT_CONSENT_BASIS_VALUES)
          .nullable()
          .optional(),
      });
      const rawEmail = getProp(rawObj, 'email');
      const parsed = schema.parse({
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId'),
        full_name: getProp(rawObj, 'full_name', 'fullName'),
        job_title: getProp(rawObj, 'job_title', 'jobTitle') || null,
        decision_role:
          getProp(rawObj, 'decision_role', 'decisionRole') ?? 'unknown',
        email: rawEmail === '' || rawEmail == null ? null : rawEmail,
        phone: getProp(rawObj, 'phone') || null,
        consent_basis: normalizeConsentBasis(
          getProp(rawObj, 'consent_basis', 'consentBasis')
        ),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'update_contact': {
      const schema = z.object({
        contact_id: z.string().trim().min(1),
        full_name: z.string().trim().min(1).max(200).optional(),
        job_title: z.string().trim().max(160).nullable().optional(),
        decision_role: z.enum(CONTACT_DECISION_ROLES).optional(),
        email: z.string().trim().email().max(240).nullable().optional(),
        phone: z.string().trim().max(64).nullable().optional(),
        consent_basis: z
          .enum(CONTACT_CONSENT_BASIS_VALUES)
          .nullable()
          .optional(),
        opt_out: z.boolean().optional(),
      });
      const rawEmail = getProp(rawObj, 'email');
      const parsed = schema.parse({
        contact_id: getProp(rawObj, 'contact_id', 'contactId', 'id'),
        full_name: getProp(rawObj, 'full_name', 'fullName'),
        job_title: getProp(rawObj, 'job_title', 'jobTitle'),
        decision_role: getProp(rawObj, 'decision_role', 'decisionRole'),
        email:
          rawEmail === undefined
            ? undefined
            : rawEmail === '' || rawEmail == null
              ? null
              : rawEmail,
        phone: getProp(rawObj, 'phone'),
        consent_basis: normalizeConsentBasis(
          getProp(rawObj, 'consent_basis', 'consentBasis')
        ),
        opt_out: getProp(rawObj, 'opt_out', 'optOut'),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'create_campaign': {
      errForbiddenFields([
        'planned_hours',
        'plannedHours',
        'planned_person_weeks',
        'plannedPersonWeeks',
      ]);
      const schema = z.object({
        name: z.string().trim().min(1).max(200),
        channel_id: z.string().trim().min(1),
        bet_id: z.string().trim().min(1).nullable().optional(),
        owner_member_id: z.string().trim().min(1).nullable().optional(),
        planned_start: z.string().trim().nullable().optional(),
        planned_end: z.string().trim().nullable().optional(),
        objective: z.string().trim().max(1000).nullable().optional(),
        status: z.enum(CAMPAIGN_STATUS_VALUES).default('planned'),
      });
      const parsed = schema.parse({
        name: getProp(rawObj, 'name'),
        channel_id: getProp(rawObj, 'channel_id', 'channelId'),
        bet_id: getProp(rawObj, 'bet_id', 'betId') || null,
        owner_member_id:
          getProp(rawObj, 'owner_member_id', 'ownerMemberId') || null,
        planned_start:
          normalizeTimestamp(getProp(rawObj, 'planned_start', 'plannedStart')) ||
          null,
        planned_end:
          normalizeTimestamp(getProp(rawObj, 'planned_end', 'plannedEnd')) ||
          null,
        objective: getProp(rawObj, 'objective') || null,
        status: getProp(rawObj, 'status') ?? 'planned',
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'update_campaign': {
      errForbiddenFields([
        'planned_hours',
        'plannedHours',
        'planned_person_weeks',
        'plannedPersonWeeks',
      ]);
      const schema = z.object({
        campaign_id: z.string().trim().min(1),
        name: z.string().trim().min(1).max(200).optional(),
        channel_id: z.string().trim().min(1).optional(),
        bet_id: z.string().trim().min(1).nullable().optional(),
        owner_member_id: z.string().trim().min(1).nullable().optional(),
        planned_start: z.string().trim().nullable().optional(),
        planned_end: z.string().trim().nullable().optional(),
        objective: z.string().trim().max(1000).nullable().optional(),
        status: z.enum(CAMPAIGN_STATUS_VALUES).optional(),
      });
      const parsed = schema.parse({
        campaign_id: getProp(rawObj, 'campaign_id', 'campaignId', 'id'),
        name: getProp(rawObj, 'name'),
        channel_id: getProp(rawObj, 'channel_id', 'channelId'),
        bet_id: getProp(rawObj, 'bet_id', 'betId'),
        owner_member_id: getProp(rawObj, 'owner_member_id', 'ownerMemberId'),
        planned_start: normalizeTimestamp(
          getProp(rawObj, 'planned_start', 'plannedStart')
        ),
        planned_end: normalizeTimestamp(
          getProp(rawObj, 'planned_end', 'plannedEnd')
        ),
        objective: getProp(rawObj, 'objective'),
        status: getProp(rawObj, 'status'),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'log_outreach': {
      const schema = z.object({
        campaign_id: z.string().trim().min(1),
        sponsor_id: z.string().trim().min(1),
        contact_id: z.string().trim().min(1).nullable().optional(),
        referral_id: z.string().trim().min(1).nullable().optional(),
        root_event_type: z
          .enum(OUTREACH_ROOT_EVENT_VALUES)
          .default('outreach_sent'),
        started_at: z.string().trim().min(1).optional(),
        summary: z.string().trim().max(1000).nullable().optional(),
        outcome: z.enum(INTERACTION_OUTCOME_VALUES).nullable().optional(),
      });
      const parsed = schema.parse({
        campaign_id: getProp(rawObj, 'campaign_id', 'campaignId'),
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId'),
        contact_id: getProp(rawObj, 'contact_id', 'contactId') || null,
        referral_id: getProp(rawObj, 'referral_id', 'referralId') || null,
        root_event_type:
          getProp(rawObj, 'root_event_type', 'rootEventType') ?? 'outreach_sent',
        started_at: normalizeTimestamp(getProp(rawObj, 'started_at', 'startedAt')),
        summary: getProp(rawObj, 'summary') || null,
        outcome: getProp(rawObj, 'outcome') || null,
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'record_qualification': {
      const schema = z.object({
        sponsor_id: z.string().trim().min(1),
        source_campaign_id: z.string().trim().min(1).nullable().optional(),
        status: z.enum(QUALIFICATION_STATUS_VALUES),
        reason: z.string().trim().max(500).nullable().optional(),
        checklist_passed: z.boolean().nullable().optional(),
      });
      const parsed = schema.parse({
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId'),
        source_campaign_id:
          getProp(rawObj, 'source_campaign_id', 'sourceCampaignId') || null,
        status: getProp(rawObj, 'status'),
        reason: getProp(rawObj, 'reason') || null,
        checklist_passed:
          getProp<boolean>(rawObj, 'checklist_passed', 'checklistPassed') ??
          null,
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'create_opportunity': {
      const schema = z.object({
        sponsor_id: z.string().trim().min(1),
        primary_contact_id: z.string().trim().min(1).nullable().optional(),
        originating_campaign_id: z.string().trim().min(1).nullable().optional(),
        bet_id: z.string().trim().min(1).nullable().optional(),
        support_type: z.enum(OPPORTUNITY_SUPPORT_TYPES).default('cash'),
        is_renewal: z.boolean().default(false),
        renewal_route: z
          .enum([
            'direct_past_owner',
            'warm_intro',
            'inbound',
            'reassigned',
            'other',
          ])
          .nullable()
          .optional(),
        recovered_lead: z.boolean().default(false),
        name: z.string().trim().max(240).nullable().optional(),
        proposed_value: z.coerce.number().finite().min(0).nullable().optional(),
        owner_member_id: z.string().trim().min(1).nullable().optional(),
      });
      const rawVal = getProp(rawObj, 'proposed_value', 'proposedValue');
      const parsed = schema.parse({
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId'),
        primary_contact_id:
          getProp(rawObj, 'primary_contact_id', 'primaryContactId') || null,
        originating_campaign_id:
          getProp(
            rawObj,
            'originating_campaign_id',
            'originatingCampaignId'
          ) || null,
        bet_id: getProp(rawObj, 'bet_id', 'betId') || null,
        support_type: getProp(rawObj, 'support_type', 'supportType') ?? 'cash',
        is_renewal: Boolean(getProp(rawObj, 'is_renewal', 'isRenewal') ?? false),
        renewal_route: getProp(rawObj, 'renewal_route', 'renewalRoute') || null,
        recovered_lead: Boolean(
          getProp(rawObj, 'recovered_lead', 'recoveredLead') ?? false
        ),
        name: getProp(rawObj, 'name') || null,
        proposed_value:
          rawVal === undefined || rawVal === null || rawVal === '' ? null : rawVal,
        owner_member_id:
          getProp(rawObj, 'owner_member_id', 'ownerMemberId') || null,
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'update_opportunity': {
      errForbiddenFields([
        'originating_campaign_id',
        'originatingCampaignId',
        'sponsor_id',
        'sponsorId',
        'edition_id',
        'editionId',
      ]);
      const schema = z.object({
        opportunity_id: z.string().trim().min(1),
        name: z.string().trim().max(240).nullable().optional(),
        primary_contact_id: z.string().trim().min(1).nullable().optional(),
        bet_id: z.string().trim().min(1).nullable().optional(),
      });
      const parsed = schema.parse({
        opportunity_id: getProp(rawObj, 'opportunity_id', 'opportunityId', 'id'),
        name: getProp(rawObj, 'name'),
        primary_contact_id: getProp(
          rawObj,
          'primary_contact_id',
          'primaryContactId'
        ),
        bet_id: getProp(rawObj, 'bet_id', 'betId'),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'change_stage': {
      const rawStage = getProp(rawObj, 'stage');
      if (rawStage === 'partner_confirmed') {
        throw new AppApiError(
          422,
          'USE_CONFIRM_DEAL',
          'Cannot move directly to partner_confirmed via change_stage; use confirm_deal with payment_terms and contract lines.'
        );
      }
      const schema = z.object({
        opportunity_id: z.string().trim().min(1),
        stage: z.enum(OPPORTUNITY_STAGES),
        proposed_value: z.coerce.number().finite().min(0).nullable().optional(),
        owner_member_id: z.string().trim().min(1).nullable().optional(),
        drop_reason: z.enum(DROP_REASON_VALUES).nullable().optional(),
        loss_reason: z.enum(LOSS_REASON_VALUES).nullable().optional(),
      });
      const rawVal = getProp(rawObj, 'proposed_value', 'proposedValue');
      const parsed = schema.parse({
        opportunity_id: getProp(rawObj, 'opportunity_id', 'opportunityId', 'id'),
        stage: rawStage,
        proposed_value:
          rawVal === undefined || rawVal === null || rawVal === '' ? undefined : rawVal,
        owner_member_id:
          getProp(rawObj, 'owner_member_id', 'ownerMemberId') || undefined,
        drop_reason: getProp(rawObj, 'drop_reason', 'dropReason') || null,
        loss_reason: getProp(rawObj, 'loss_reason', 'lossReason') || null,
      });
      if (
        (parsed.stage === 'lost' || parsed.stage === 'withdrawn') &&
        !parsed.drop_reason
      ) {
        throw new AppApiError(
          422,
          'DROP_REASON_REQUIRED',
          'A drop_reason is required when marking an opportunity as lost or withdrawn.'
        );
      }
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'confirm_deal': {
      const lineSchema = z.object({
        consideration_type: z.enum(['cash', 'in_kind']),
        value: z.coerce
          .number()
          .finite()
          .positive('Contract line value must be greater than 0.'),
        asset_id: z.string().trim().min(1).nullable().optional(),
        price_id: z.string().trim().min(1).nullable().optional(),
      });
      const schema = z.object({
        opportunity_id: z.string().trim().min(1),
        signed_at: z.string().trim().min(1),
        payment_terms: z.enum(PAYMENT_TERMS_VALUES),
        signatory_contact_id: z.string().trim().min(1).nullable().optional(),
        document_uri: z.string().trim().max(500).nullable().optional(),
        signed_value_total: z.coerce.number().finite().positive(),
        lines: z.array(lineSchema).min(1),
      });
      const rawTotal = Number(
        getProp(
          rawObj,
          'signed_value_total',
          'signedValueTotal',
          'confirmed_value',
          'confirmedValue',
          'amount',
          'value'
        ) ?? 0
      );
      const rawLines = Array.isArray(rawObj.lines)
        ? rawObj.lines.map((line) => {
            const l = (line ?? {}) as Record<string, unknown>;
            return {
              consideration_type:
                getProp(l, 'consideration_type', 'considerationType') ?? 'cash',
              value: getProp(l, 'value') ?? rawTotal,
              asset_id: getProp(l, 'asset_id', 'assetId') || null,
              price_id: getProp(l, 'price_id', 'priceId') || null,
            };
          })
        : rawTotal > 0
          ? [
              {
                consideration_type: 'cash' as const,
                value: rawTotal,
                asset_id: null,
                price_id: null,
              },
            ]
          : [];

      const parsed = schema.parse({
        opportunity_id: getProp(rawObj, 'opportunity_id', 'opportunityId', 'id'),
        signed_at:
          normalizeTimestamp(getProp(rawObj, 'signed_at', 'signedAt')) ??
          new Date().toISOString(),
        payment_terms:
          getProp(rawObj, 'payment_terms', 'paymentTerms') ?? 'standard_50_50',
        signatory_contact_id:
          getProp(rawObj, 'signatory_contact_id', 'signatoryContactId') || null,
        document_uri: getProp(rawObj, 'document_uri', 'documentUri') || null,
        signed_value_total: rawTotal,
        lines: rawLines,
      });
      const linesSum = parsed.lines.reduce(
        (sum, line) => sum + Number(line.value ?? 0),
        0
      );
      if (Math.abs(linesSum - parsed.signed_value_total) > 0.01) {
        throw new AppApiError(
          422,
          'LINE_SUM_MISMATCH',
          `Contract line values (${linesSum}) must equal signed_value_total (${parsed.signed_value_total}).`
        );
      }
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'log_time': {
      const schema = z.object({
        member_id: z.string().trim().min(1).optional(),
        task_id: z.string().trim().min(1).nullable().optional(),
        bet_id: z.string().trim().min(1).nullable().optional(),
        task_type: z.enum(TASK_TYPE_VALUES),
        work_date: z
          .string()
          .trim()
          .refine(isValidIsoDate, 'work_date must be YYYY-MM-DD'),
        hours: z.coerce.number().finite().gt(0).lte(16),
      });
      const parsed = schema.parse({
        member_id: getProp(rawObj, 'member_id', 'memberId') || undefined,
        task_id: getProp(rawObj, 'task_id', 'taskId') || null,
        bet_id: getProp(rawObj, 'bet_id', 'betId') || null,
        task_type: getProp(rawObj, 'task_type', 'taskType') ?? 'follow_up',
        work_date: getProp(rawObj, 'work_date', 'workDate'),
        hours: getProp(rawObj, 'hours'),
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'create_network_partner': {
      const schema = z.object({
        partner_type: z.enum(PARTNER_TYPE_VALUES),
        name: z.string().trim().min(1).max(200),
        owner_member_id: z.string().trim().min(1).nullable().optional(),
        recruited_at: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        status: z.enum(PARTNER_STATUS_VALUES).default('invited'),
      });
      const parsed = schema.parse({
        partner_type: getProp(rawObj, 'partner_type', 'partnerType'),
        name: getProp(rawObj, 'name'),
        owner_member_id:
          getProp(rawObj, 'owner_member_id', 'ownerMemberId') || null,
        recruited_at: getProp(rawObj, 'recruited_at', 'recruitedAt') || null,
        status: getProp(rawObj, 'status') ?? 'invited',
      });
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }

    case 'record_referral': {
      const schema = z.object({
        referral_id: z.string().trim().min(1).nullable().optional(),
        partner_id: z.string().trim().min(1),
        sponsor_id: z.string().trim().min(1),
        contact_id: z.string().trim().min(1).nullable().optional(),
        campaign_id: z.string().trim().min(1).nullable().optional(),
        commitment_status: z.enum(REFERRAL_STATUS_VALUES),
        committed_at: z.string().trim().nullable().optional(),
        ask_sent_at: z.string().trim().nullable().optional(),
      });
      const parsed = schema.parse({
        referral_id: getProp(rawObj, 'referral_id', 'referralId') || null,
        partner_id: getProp(rawObj, 'partner_id', 'partnerId'),
        sponsor_id: getProp(rawObj, 'sponsor_id', 'sponsorId'),
        contact_id: getProp(rawObj, 'contact_id', 'contactId') || null,
        campaign_id: getProp(rawObj, 'campaign_id', 'campaignId') || null,
        commitment_status: getProp(
          rawObj,
          'commitment_status',
          'commitmentStatus'
        ),
        committed_at:
          normalizeTimestamp(getProp(rawObj, 'committed_at', 'committedAt')) ||
          null,
        ask_sent_at:
          normalizeTimestamp(getProp(rawObj, 'ask_sent_at', 'askSentAt')) || null,
      });
      if (parsed.commitment_status === 'committed' && !parsed.contact_id) {
        throw new AppApiError(
          422,
          'INV_04_VIOLATION',
          'INV-04: Committed introduction requires a named contact_id.'
        );
      }
      return sortKeysRecursively(parsed) as Record<string, unknown>;
    }
  }
}

export function getActionPermissionSpec(actionType: AllowedAiActionType): {
  permissionLevel: 'L5';
  allowed: (roles: ReadonlyArray<CanonicalRole>) => {
    allowed: boolean;
    scope: 'all' | 'own' | 'none';
    reason?: string;
  };
} {
  switch (actionType) {
    case 'confirm_deal':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const dec = evaluatePermission(roles, 'opportunities_stage', 'approve');
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : {
                allowed: false,
                scope: 'none',
                reason:
                  'Confirming deals requires coordination_lead or the owning sales role.',
              };
        },
      };

    case 'create_campaign':
    case 'update_campaign':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const op = actionType === 'create_campaign' ? 'create' : 'update';
          const dec = evaluatePermission(
            roles,
            'outreach_interactions_meetings_qualifications',
            op
          );
          if (
            !roles.includes('coordination_lead') &&
            !roles.includes('pipeline_ops')
          ) {
            return {
              allowed: false,
              scope: 'none',
              reason:
                'Creating or updating campaigns requires coordination_lead or pipeline_ops.',
            };
          }
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : { allowed: false, scope: 'none', reason: 'Forbidden by role.' };
        },
      };

    case 'create_task':
    case 'update_task':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const op = actionType === 'create_task' ? 'create' : 'update';
          const dec = evaluatePermission(roles, 'tasks', op);
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : {
                allowed: false,
                scope: 'none',
                reason: 'Your role cannot create or update tasks.',
              };
        },
      };

    case 'log_time':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const dec = evaluatePermission(roles, 'hours_staffing', 'create');
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : {
                allowed: false,
                scope: 'none',
                reason: 'Your role cannot log hours.',
              };
        },
      };

    case 'create_sponsor':
    case 'update_sponsor':
    case 'create_contact':
    case 'update_contact':
    case 'upsert_sponsor_contact':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const op =
            actionType === 'create_sponsor' || actionType === 'create_contact'
              ? 'create'
              : 'update';
          const dec = evaluatePermission(
            roles,
            'sponsors_contacts_research',
            op
          );
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : {
                allowed: false,
                scope: 'none',
                reason: 'Your role cannot modify sponsors or contacts.',
              };
        },
      };

    case 'change_owner':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const spDec = evaluatePermission(
            roles,
            'sponsors_contacts_research',
            'update'
          );
          const oppDec = evaluatePermission(roles, 'opportunities_stage', 'update');
          return spDec.allowed || oppDec.allowed
            ? {
                allowed: true,
                scope:
                  spDec.scope === 'all' || oppDec.scope === 'all' ? 'all' : 'own',
              }
            : {
                allowed: false,
                scope: 'none',
                reason: 'Your role cannot reassign ownership.',
              };
        },
      };

    case 'create_opportunity':
    case 'update_opportunity':
    case 'change_stage':
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const op = actionType === 'create_opportunity' ? 'create' : 'update';
          const dec = evaluatePermission(roles, 'opportunities_stage', op);
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : {
                allowed: false,
                scope: 'none',
                reason: 'Your role cannot create or update pipeline opportunities.',
              };
        },
      };

    default:
      return {
        permissionLevel: 'L5',
        allowed: (roles) => {
          const dec = evaluatePermission(
            roles,
            'outreach_interactions_meetings_qualifications',
            'create'
          );
          return dec.allowed
            ? { allowed: true, scope: dec.scope }
            : {
                allowed: false,
                scope: 'none',
                reason: 'Your role cannot log outreach, meetings, or referrals.',
              };
        },
      };
  }
}

export const PROPOSE_CHANGES_TOOL_DEFINITION: OpenRouterToolDefinition = {
  type: 'function',
  function: {
    name: 'propose_changes',
    description:
      'Propose 1-4 CRM/task changes for user review before writing. Never use for receipts, invoices, targets, rules, deletes, or ED-2025.',
    parameters: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              action_type: {
                type: 'string',
                enum: [...ALLOWED_AI_ACTION_TYPES],
              },
              target_id: {
                type: 'string',
                description: 'Record ID or entity name to resolve server-side.',
              },
              fields: {
                type: 'object',
                description: 'Fields to create or update.',
              },
              summary: {
                type: 'string',
                description: 'Short plain-language summary.',
              },
            },
            required: ['action_type', 'fields'],
          },
        },
        reason: {
          type: 'string',
          description: 'Brief reason for these changes.',
        },
      },
      required: ['changes', 'reason'],
      additionalProperties: false,
    },
  },
};

function inferTargetField(
  actionType: AllowedAiActionType
): string | null {
  switch (actionType) {
    case 'change_stage':
    case 'confirm_deal':
    case 'update_opportunity':
      return 'opportunity_id';
    case 'update_task':
      return 'task_id';
    case 'update_sponsor':
    case 'record_qualification':
    case 'create_opportunity':
    case 'create_contact':
    case 'log_meeting':
    case 'log_outreach':
      return 'sponsor_id';
    case 'update_contact':
      return 'contact_id';
    case 'update_campaign':
      return 'campaign_id';
    case 'record_referral':
      return 'partner_id';
    case 'change_owner':
      return 'subject_id';
    case 'log_interaction':
      return 'attempt_id';
    default:
      return null;
  }
}

const SingleActionItemSchema = z.object({
  type: z.enum(ALLOWED_AI_ACTION_TYPES),
  payload: z.record(z.string(), z.unknown()),
  summary: z.string().trim().max(300).optional(),
});

const ProposeChangesArgsSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== 'object') return input;
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.changes)) {
      const normalized = obj.changes.map((c) => {
        const ch = (c ?? {}) as Record<string, unknown>;
        const actionType = (ch.action_type ?? ch.type) as AllowedAiActionType;
        const fields = {
          ...((ch.fields && typeof ch.fields === 'object'
            ? ch.fields
            : ch.payload && typeof ch.payload === 'object'
              ? ch.payload
              : {}) as Record<string, unknown>),
        };
        if (typeof ch.target_id === 'string' && ch.target_id.trim()) {
          const targetField = inferTargetField(actionType);
          if (targetField && fields[targetField] === undefined) {
            fields[targetField] = ch.target_id.trim();
          }
        }
        return {
          type: actionType,
          payload: fields,
          summary: typeof ch.summary === 'string' ? ch.summary : undefined,
        };
      });
      return {
        actions: normalized,
        reason: typeof obj.reason === 'string' ? obj.reason : undefined,
      };
    }
    return obj;
  },
  z
    .object({
      actions: z
        .array(SingleActionItemSchema)
        .min(1, 'At least 1 action is required.')
        .max(4, 'At most 4 actions may be proposed in a single turn.'),
      reason: z.string().trim().max(400).optional(),
    })
    .strict()
);

export interface PendingAiActionInsert {
  ai_action_id: string;
  action_type: AllowedAiActionType;
  permission_level: 'L5';
  payload: Record<string, unknown>;
  payload_sha256: string;
  record_class: 'live' | 'simulated';
  source_ref: string;
  data_version: string;
}

export interface ActionFieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

interface TargetGuard {
  kind: 'opportunity' | 'task' | 'sponsor' | 'contact' | 'campaign';
  id: string;
  updated_at: string | null;
  history_id?: string | null;
}

export interface EntityAmbiguityItem {
  field: string;
  query: string;
  not_found?: boolean;
  candidates: Array<{ id: string; label: string }>;
}

function isCanonicalIdLike(val: string): boolean {
  return /^[A-Z0-9]{1,8}-[A-Z0-9_-]+$/.test(val.trim());
}

/**
 * Shared name -> ID resolvers. Used by propose_changes (resolveEntitiesForAction)
 * and by set_view, so "Kavya" resolves the same way everywhere.
 * An exact canonical ID is verified to exist; anything else is a name search.
 */
export type ResolveOutcome =
  | { ok: true; id: string; label: string }
  | { ok: false; ambiguity: EntityAmbiguityItem };

export async function resolveTeamMember(
  pool: QueryablePool,
  query: string,
  field = 'owner_member_id'
): Promise<ResolveOutcome> {
  const q = query.trim();
  if (isCanonicalIdLike(q)) {
    const byId = await pool.query<{ member_id: string; full_name: string }>(
      `SELECT member_id, full_name FROM public.team_member
        WHERE member_id = $1 AND NOT is_deleted LIMIT 1`,
      [q]
    );
    const row = byId.rows[0];
    return row
      ? { ok: true, id: row.member_id, label: row.full_name }
      : { ok: false, ambiguity: { field, query: q, not_found: true, candidates: [] } };
  }
  const res = await pool.query<{ member_id: string; full_name: string; email: string | null }>(
    `SELECT member_id, full_name, email
       FROM public.team_member
      WHERE is_active = true
        AND NOT is_deleted
        AND (LOWER(full_name) LIKE LOWER($1) OR LOWER(COALESCE(email, '')) LIKE LOWER($1))
      ORDER BY full_name ASC
      LIMIT 10`,
    [`%${q}%`]
  );
  if (res.rows.length === 1) {
    return { ok: true, id: res.rows[0].member_id, label: res.rows[0].full_name };
  }
  return {
    ok: false,
    ambiguity: {
      field,
      query: q,
      not_found: res.rows.length === 0 ? true : undefined,
      candidates: res.rows.map((r) => ({
        id: r.member_id,
        label: r.email
          ? `${r.full_name} (${r.member_id}, ${r.email})`
          : `${r.full_name} (${r.member_id})`,
      })),
    },
  };
}

export async function resolveCampaign(
  pool: QueryablePool,
  query: string,
  editionId: string,
  recordClass: string,
  field = 'campaign_id'
): Promise<ResolveOutcome> {
  const q = query.trim();
  if (isCanonicalIdLike(q)) {
    const byId = await pool.query<{ campaign_id: string; name: string }>(
      `SELECT campaign_id, name FROM public.campaign
        WHERE campaign_id = $1 AND edition_id = $2 AND NOT is_deleted LIMIT 1`,
      [q, editionId]
    );
    const row = byId.rows[0];
    return row
      ? { ok: true, id: row.campaign_id, label: row.name }
      : { ok: false, ambiguity: { field, query: q, not_found: true, candidates: [] } };
  }
  const res = await pool.query<{ campaign_id: string; name: string }>(
    `SELECT campaign_id, name
       FROM public.campaign
      WHERE edition_id = $1
        AND record_class = $2
        AND NOT is_deleted
        AND LOWER(name) LIKE LOWER($3)
      ORDER BY name ASC
      LIMIT 10`,
    [editionId, recordClass, `%${q}%`]
  );
  if (res.rows.length === 1) {
    return { ok: true, id: res.rows[0].campaign_id, label: res.rows[0].name };
  }
  return {
    ok: false,
    ambiguity: {
      field,
      query: q,
      not_found: res.rows.length === 0 ? true : undefined,
      candidates: res.rows.map((r) => ({
        id: r.campaign_id,
        label: `${r.name} (${r.campaign_id})`,
      })),
    },
  };
}

async function resolveEntitiesForAction(
  pool: QueryablePool,
  actionType: AllowedAiActionType,
  rawPayload: Record<string, unknown>,
  editionId: string,
  recordClass: string
): Promise<{
  payload: Record<string, unknown>;
  ambiguities: EntityAmbiguityItem[];
}> {
  const payload = { ...rawPayload };
  const ambiguities: EntityAmbiguityItem[] = [];

  // 1. Resolve team member name -> owner_member_id / member_id
  const explicitOwnerName = getProp<string>(
    payload,
    'owner_name',
    'ownerName',
    'member_name',
    'memberName',
    'assignee_name',
    'assigneeName',
    'owner',
    'assignee'
  );
  const targetMemberField =
    actionType === 'log_time'
      ? 'member_id'
      : actionType === 'change_owner'
        ? 'member_id'
        : 'owner_member_id';
  const rawMemberVal = getProp<string>(
    payload,
    targetMemberField,
    'owner_member_id',
    'ownerMemberId',
    'member_id',
    'memberId'
  );
  const memberQuery =
    (typeof explicitOwnerName === 'string' && explicitOwnerName.trim()) ||
    (typeof rawMemberVal === 'string' &&
    rawMemberVal.trim() &&
    !isCanonicalIdLike(rawMemberVal)
      ? rawMemberVal.trim()
      : null);

  if (memberQuery) {
    const member = await resolveTeamMember(pool, memberQuery, targetMemberField);
    if (member.ok) {
      payload[targetMemberField] = member.id;
    } else {
      ambiguities.push(member.ambiguity);
    }
    delete payload.owner_name;
    delete payload.ownerName;
    delete payload.member_name;
    delete payload.memberName;
    delete payload.assignee_name;
    delete payload.assigneeName;
    delete payload.owner;
    delete payload.assignee;
  }

  // 2. Resolve opportunity name / sponsor name -> opportunity_id
  if (
    actionType === 'change_stage' ||
    actionType === 'confirm_deal' ||
    actionType === 'update_opportunity'
  ) {
    const explicitOppName = getProp<string>(
      payload,
      'opportunity_name',
      'opportunityName',
      'sponsor_name',
      'sponsorName'
    );
    const rawOppVal = getProp<string>(
      payload,
      'opportunity_id',
      'opportunityId',
      'id'
    );
    const oppQuery =
      (typeof explicitOppName === 'string' && explicitOppName.trim()) ||
      (typeof rawOppVal === 'string' &&
      rawOppVal.trim() &&
      !isCanonicalIdLike(rawOppVal)
        ? rawOppVal.trim()
        : null);

    if (oppQuery) {
      const res = await pool.query<{
        opportunity_id: string;
        name: string | null;
        sponsor_name: string;
        stage: string | null;
      }>(
        `SELECT o.opportunity_id, o.name, sp.display_name AS sponsor_name, sv.stage
           FROM public.opportunity o
           JOIN public.sponsor sp ON sp.sponsor_id = o.sponsor_id
           LEFT JOIN LATERAL (
             SELECT stage
               FROM public.opportunity_stage_version osv
              WHERE osv.opportunity_id = o.opportunity_id AND NOT osv.is_deleted
              ORDER BY osv.valid_from DESC, osv.history_id DESC LIMIT 1
           ) sv ON true
          WHERE o.edition_id = $1
            AND o.record_class = $2
            AND NOT o.is_deleted
            AND (LOWER(COALESCE(o.name, '')) LIKE LOWER($3) OR LOWER(sp.display_name) LIKE LOWER($3))
          ORDER BY o.opportunity_id ASC
          LIMIT 10`,
        [editionId, recordClass, `%${oppQuery}%`]
      );
      if (res.rows.length > 1) {
        ambiguities.push({
          field: 'opportunity_id',
          query: oppQuery,
          candidates: res.rows.map((r) => ({
            id: r.opportunity_id,
            label: `${r.sponsor_name}${r.name ? ` — ${r.name}` : ''} (${r.opportunity_id}, ${r.stage ?? 'open'})`,
          })),
        });
      } else if (res.rows.length === 0) {
        ambiguities.push({
          field: 'opportunity_id',
          query: oppQuery,
          not_found: true,
          candidates: [],
        });
      } else {
        payload.opportunity_id = res.rows[0].opportunity_id;
      }
      delete payload.opportunity_name;
      delete payload.opportunityName;
      delete payload.sponsor_name;
      delete payload.sponsorName;
    }
  }

  // 3. Resolve sponsor name -> sponsor_id (for sponsor-referencing actions, excluding create_sponsor)
  if (actionType !== 'create_sponsor') {
    const explicitSponsorName = getProp<string>(
      payload,
      'sponsor_name',
      'sponsorName'
    );
    const rawSponsorVal = getProp<string>(payload, 'sponsor_id', 'sponsorId');
    const sponsorQuery =
      (typeof explicitSponsorName === 'string' && explicitSponsorName.trim()) ||
      (typeof rawSponsorVal === 'string' &&
      rawSponsorVal.trim() &&
      !isCanonicalIdLike(rawSponsorVal)
        ? rawSponsorVal.trim()
        : null);

    if (sponsorQuery) {
      const res = await pool.query<{
        sponsor_id: string;
        display_name: string;
      }>(
        `SELECT sponsor_id, display_name
           FROM public.sponsor
          WHERE record_class = $1
            AND NOT is_deleted
            AND LOWER(display_name) LIKE LOWER($2)
          ORDER BY display_name ASC
          LIMIT 10`,
        [recordClass, `%${sponsorQuery}%`]
      );
      if (res.rows.length > 1) {
        ambiguities.push({
          field: 'sponsor_id',
          query: sponsorQuery,
          candidates: res.rows.map((r) => ({
            id: r.sponsor_id,
            label: `${r.display_name} (${r.sponsor_id})`,
          })),
        });
      } else if (res.rows.length === 0) {
        ambiguities.push({
          field: 'sponsor_id',
          query: sponsorQuery,
          not_found: true,
          candidates: [],
        });
      } else {
        payload.sponsor_id = res.rows[0].sponsor_id;
      }
      delete payload.sponsor_name;
      delete payload.sponsorName;
    }
  }

  // 4. Resolve campaign name -> campaign_id
  const explicitCampaignName = getProp<string>(
    payload,
    'campaign_name',
    'campaignName'
  );
  const rawCampaignVal = getProp<string>(payload, 'campaign_id', 'campaignId');
  const campaignQuery =
    (typeof explicitCampaignName === 'string' && explicitCampaignName.trim()) ||
    (typeof rawCampaignVal === 'string' &&
    rawCampaignVal.trim() &&
    !isCanonicalIdLike(rawCampaignVal)
      ? rawCampaignVal.trim()
      : null);

  if (campaignQuery) {
    const campaign = await resolveCampaign(
      pool,
      campaignQuery,
      editionId,
      recordClass
    );
    if (campaign.ok) {
      payload.campaign_id = campaign.id;
    } else {
      ambiguities.push(campaign.ambiguity);
    }
    delete payload.campaign_name;
    delete payload.campaignName;
  }

  // 5. Resolve linked_id when create_task/update_task passes a human name
  if (
    (actionType === 'create_task' || actionType === 'update_task') &&
    typeof payload.linked_id === 'string' &&
    payload.linked_id.trim() &&
    !isCanonicalIdLike(payload.linked_id)
  ) {
    const linkedQuery = payload.linked_id.trim();
    const linkedType = String(payload.linked_type ?? 'opportunity');
    if (linkedType === 'opportunity') {
      const res = await pool.query<{
        opportunity_id: string;
        name: string | null;
        sponsor_name: string;
      }>(
        `SELECT o.opportunity_id, o.name, sp.display_name AS sponsor_name
           FROM public.opportunity o
           JOIN public.sponsor sp ON sp.sponsor_id = o.sponsor_id
          WHERE o.edition_id = $1 AND o.record_class = $2 AND NOT o.is_deleted
            AND (LOWER(COALESCE(o.name, '')) LIKE LOWER($3) OR LOWER(sp.display_name) LIKE LOWER($3))
          ORDER BY o.opportunity_id ASC LIMIT 10`,
        [editionId, recordClass, `%${linkedQuery}%`]
      );
      if (res.rows.length > 1) {
        ambiguities.push({
          field: 'linked_id',
          query: linkedQuery,
          candidates: res.rows.map((r) => ({
            id: r.opportunity_id,
            label: `${r.sponsor_name} (${r.opportunity_id})`,
          })),
        });
      } else if (res.rows.length === 0) {
        ambiguities.push({
          field: 'linked_id',
          query: linkedQuery,
          not_found: true,
          candidates: [],
        });
      } else {
        payload.linked_id = res.rows[0].opportunity_id;
      }
    } else if (linkedType === 'sponsor') {
      const res = await pool.query<{ sponsor_id: string; display_name: string }>(
        `SELECT sponsor_id, display_name
           FROM public.sponsor
          WHERE record_class = $1 AND NOT is_deleted AND LOWER(display_name) LIKE LOWER($2)
          ORDER BY display_name ASC LIMIT 10`,
        [recordClass, `%${linkedQuery}%`]
      );
      if (res.rows.length > 1) {
        ambiguities.push({
          field: 'linked_id',
          query: linkedQuery,
          candidates: res.rows.map((r) => ({
            id: r.sponsor_id,
            label: `${r.display_name} (${r.sponsor_id})`,
          })),
        });
      } else if (res.rows.length === 0) {
        ambiguities.push({
          field: 'linked_id',
          query: linkedQuery,
          not_found: true,
          candidates: [],
        });
      } else {
        payload.linked_id = res.rows[0].sponsor_id;
      }
    }
  }

  return { payload, ambiguities };
}

async function fetchBeforeSnapshot(
  pool: QueryablePool,
  actionType: AllowedAiActionType,
  payload: Record<string, unknown>
): Promise<{
  beforeSnapshot: Record<string, unknown> | null;
  fieldDiffs: ActionFieldDiff[];
  impactedNote: string;
  targetGuard: TargetGuard | null;
  linkedSponsorId: string | null;
  linkedContactId: string | null;
  linkedCampaignId: string | null;
  linkedOpportunityId: string | null;
  defaultSummary: string;
}> {
  let linkedSponsorId: string | null =
    typeof payload.sponsor_id === 'string' ? payload.sponsor_id : null;
  let linkedContactId: string | null =
    typeof payload.contact_id === 'string' ? payload.contact_id : null;
  let linkedCampaignId: string | null =
    typeof payload.campaign_id === 'string' ? payload.campaign_id : null;
  const linkedOpportunityId: string | null =
    typeof payload.opportunity_id === 'string' ? payload.opportunity_id : null;

  if (
    linkedOpportunityId &&
    (actionType === 'change_stage' ||
      actionType === 'confirm_deal' ||
      actionType === 'update_opportunity')
  ) {
    const r = await pool.query<Record<string, unknown>>(
      `SELECT o.opportunity_id, o.name, o.sponsor_id, sp.display_name AS sponsor_name,
              o.primary_contact_id, o.originating_campaign_id, o.bet_id, o.updated_at,
              sv.history_id, sv.stage, sv.proposed_value, sv.confirmed_value, sv.owner_member_id
         FROM public.opportunity o
         JOIN public.sponsor sp ON sp.sponsor_id = o.sponsor_id
         LEFT JOIN LATERAL (
           SELECT history_id, stage, proposed_value, confirmed_value, owner_member_id
             FROM public.opportunity_stage_version osv
            WHERE osv.opportunity_id = o.opportunity_id AND NOT osv.is_deleted
            ORDER BY osv.valid_from DESC, osv.history_id DESC LIMIT 1
         ) sv ON true
        WHERE o.opportunity_id = $1 AND NOT o.is_deleted LIMIT 1`,
      [linkedOpportunityId]
    );
    const opp = r.rows[0] ?? null;
    if (opp) {
      if (!linkedSponsorId && typeof opp.sponsor_id === 'string') {
        linkedSponsorId = opp.sponsor_id;
      }
      if (!linkedContactId && typeof opp.primary_contact_id === 'string') {
        linkedContactId = opp.primary_contact_id;
      }
      if (!linkedCampaignId && typeof opp.originating_campaign_id === 'string') {
        linkedCampaignId = opp.originating_campaign_id;
      }
    }
    const label =
      (opp?.name as string | undefined) ||
      (opp?.sponsor_name as string | undefined) ||
      linkedOpportunityId;

    const diffs: ActionFieldDiff[] = [];
    let impactedNote = 'Pipeline opportunity view will update.';
    if (actionType === 'change_stage') {
      diffs.push({
        field: 'stage',
        before: opp?.stage ?? null,
        after: payload.stage,
      });
      if (payload.proposed_value !== undefined) {
        diffs.push({
          field: 'proposed_value',
          before: opp?.proposed_value ?? null,
          after: payload.proposed_value,
        });
      }
      if (payload.owner_member_id !== undefined) {
        diffs.push({
          field: 'owner_member_id',
          before: opp?.owner_member_id ?? null,
          after: payload.owner_member_id,
        });
      }
      impactedNote =
        'Pipeline stage, Sponsorship Funnel, and conversion rates will update.';
    } else if (actionType === 'confirm_deal') {
      const lines = Array.isArray(payload.lines)
        ? (payload.lines as Array<Record<string, unknown>>)
        : [];
      diffs.push(
        {
          field: 'stage',
          before: opp?.stage ?? null,
          after: 'partner_confirmed',
        },
        {
          field: 'signed_value_total',
          before: opp?.confirmed_value ?? 0,
          after: payload.signed_value_total,
        },
        {
          field: 'payment_terms',
          before: null,
          after: payload.payment_terms,
        },
        {
          field: 'contract_lines',
          before: [],
          after: lines.map((l) => `${String(l.consideration_type)}: ₹${Number(l.value ?? 0).toLocaleString('en-IN')}`),
        }
      );
      impactedNote =
        'Signed sponsorship value (M-02), M-03/M-04, Pipeline, and Collections → Receivables will be recomputed.';
    } else {
      for (const k of ['name', 'primary_contact_id', 'bet_id'] as const) {
        if (payload[k] !== undefined) {
          diffs.push({ field: k, before: opp?.[k] ?? null, after: payload[k] });
        }
      }
    }

    const summary =
      actionType === 'change_stage'
        ? `Move ${label} from ${String(opp?.stage ?? 'current stage')} to ${String(payload.stage)}`
        : actionType === 'confirm_deal'
          ? `Confirm deal ${label} at ₹${Number(payload.signed_value_total ?? 0).toLocaleString('en-IN')} (${String(payload.payment_terms)})`
          : `Update opportunity ${label}`;
    return {
      beforeSnapshot: opp,
      fieldDiffs: diffs,
      impactedNote,
      targetGuard: opp
        ? {
            kind: 'opportunity',
            id: linkedOpportunityId,
            updated_at: opp.updated_at ? String(opp.updated_at) : null,
            history_id: opp.history_id ? String(opp.history_id) : null,
          }
        : null,
      linkedSponsorId,
      linkedContactId,
      linkedCampaignId,
      linkedOpportunityId,
      defaultSummary: summary,
    };
  }

  if (actionType === 'create_task') {
    const owner =
      typeof payload.owner_member_id === 'string'
        ? payload.owner_member_id
        : 'current user';
    return {
      beforeSnapshot: null,
      fieldDiffs: [
        { field: 'title', before: null, after: payload.title },
        { field: 'task_type', before: null, after: payload.task_type },
        { field: 'owner_member_id', before: null, after: owner },
        { field: 'due_at', before: null, after: payload.due_at },
        ...(payload.linked_id
          ? [
              {
                field: 'linked_record',
                before: null,
                after: `${String(payload.linked_type)}:${String(payload.linked_id)}`,
              },
            ]
          : []),
      ],
      impactedNote: 'Tasks queue and Team execution task count will increase by 1.',
      targetGuard: null,
      linkedSponsorId:
        payload.linked_type === 'sponsor'
          ? String(payload.linked_id ?? '')
          : linkedSponsorId,
      linkedContactId,
      linkedCampaignId:
        payload.linked_type === 'campaign'
          ? String(payload.linked_id ?? '')
          : linkedCampaignId,
      linkedOpportunityId:
        payload.linked_type === 'opportunity'
          ? String(payload.linked_id ?? '')
          : linkedOpportunityId,
      defaultSummary: `Create ${String(payload.task_type)} task "${String(payload.title)}" for ${owner} due ${String(payload.due_at).slice(0, 10)}`,
    };
  }

  if (actionType === 'update_task' && typeof payload.task_id === 'string') {
    const r = await pool.query<Record<string, unknown>>(
      `SELECT task_id, title, task_type, status, owner_member_id, due_at, updated_at
         FROM public.task WHERE task_id = $1 AND NOT is_deleted LIMIT 1`,
      [payload.task_id]
    );
    const task = r.rows[0] ?? null;
    const diffs: ActionFieldDiff[] = [];
    for (const k of ['title', 'task_type', 'owner_member_id', 'due_at', 'status'] as const) {
      if (payload[k] !== undefined) {
        diffs.push({ field: k, before: task?.[k] ?? null, after: payload[k] });
      }
    }
    return {
      beforeSnapshot: task,
      fieldDiffs: diffs,
      impactedNote: 'Tasks workspace and Team Execution metrics will update.',
      targetGuard: task
        ? {
            kind: 'task',
            id: payload.task_id,
            updated_at: task.updated_at ? String(task.updated_at) : null,
          }
        : null,
      linkedSponsorId,
      linkedContactId,
      linkedCampaignId,
      linkedOpportunityId,
      defaultSummary: `Update task ${payload.task_id}`,
    };
  }

  if (actionType === 'update_sponsor' && typeof payload.sponsor_id === 'string') {
    const r = await pool.query<Record<string, unknown>>(
      `SELECT sponsor_id, display_name, legal_name, category_id, lifecycle_status, website, city, updated_at
         FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
      [payload.sponsor_id]
    );
    const sp = r.rows[0] ?? null;
    const diffs: ActionFieldDiff[] = [];
    for (const k of [
      'display_name',
      'legal_name',
      'category_id',
      'lifecycle_status',
      'first_source',
      'website',
      'city',
    ] as const) {
      if (payload[k] !== undefined) {
        diffs.push({ field: k, before: sp?.[k] ?? null, after: payload[k] });
      }
    }
    return {
      beforeSnapshot: sp,
      fieldDiffs: diffs,
      impactedNote: 'Sponsor directory & detail profile will update.',
      targetGuard: sp
        ? {
            kind: 'sponsor',
            id: payload.sponsor_id,
            updated_at: sp.updated_at ? String(sp.updated_at) : null,
          }
        : null,
      linkedSponsorId,
      linkedContactId,
      linkedCampaignId,
      linkedOpportunityId,
      defaultSummary: `Update sponsor ${String(sp?.display_name ?? payload.sponsor_id)}`,
    };
  }

  const genericDiffs: ActionFieldDiff[] = Object.entries(payload).map(
    ([field, after]) => ({
      field,
      before: null,
      after,
    })
  );
  return {
    beforeSnapshot: null,
    fieldDiffs: genericDiffs,
    impactedNote: 'Dashboard & CRM records will reflect the confirmed change.',
    targetGuard: null,
    linkedSponsorId,
    linkedContactId,
    linkedCampaignId,
    linkedOpportunityId,
    defaultSummary: `${actionType.replace(/_/g, ' ')} proposal`,
  };
}

export async function prepareProposeChanges(
  rawArgs: unknown,
  ctx: {
    actorMemberId: string;
    roles: CanonicalRole[];
    editionId: string;
    recordClass: 'live' | 'simulated' | 'historical_synthetic';
    asOf: string;
    queryId: string;
    pool: QueryablePool;
    persistNow?: boolean;
  }
): Promise<{
  batchId: string;
  actions: Array<Record<string, unknown>>;
  pendingInserts: PendingAiActionInsert[];
  answer: string;
  toolPayload: Record<string, unknown>;
}> {
  if (ctx.recordClass === 'historical_synthetic' || ctx.editionId === 'ED-2025') {
    throw new AppApiError(
      403,
      'READ_ONLY_EDITION',
      'Historical synthetic edition ED-2025 is read-only; no write actions can be proposed.'
    );
  }

  const parsedArgs = ProposeChangesArgsSchema.parse(rawArgs);
  const writableClass: 'live' | 'simulated' =
    ctx.recordClass === 'live' ? 'live' : 'simulated';

  // Server-side name -> ID resolution & ambiguity detection before creating any ai_action rows
  const resolvedItems: Array<{
    type: AllowedAiActionType;
    payload: Record<string, unknown>;
    summary?: string;
  }> = [];
  const allAmbiguities: EntityAmbiguityItem[] = [];

  for (const item of parsedArgs.actions) {
    const resolved = await resolveEntitiesForAction(
      ctx.pool,
      item.type,
      item.payload,
      ctx.editionId,
      writableClass
    );
    if (resolved.ambiguities.length > 0) {
      allAmbiguities.push(...resolved.ambiguities);
    } else {
      resolvedItems.push({
        type: item.type,
        payload: resolved.payload,
        summary: item.summary,
      });
    }
  }

  if (allAmbiguities.length > 0) {
    const lines = allAmbiguities.map((amb) => {
      if (amb.not_found) {
        return `- No matching ${amb.field.replace(/_id$/, '')} found for "${amb.query}".`;
      }
      const opts = amb.candidates.map((c) => c.label).join(', ');
      return `- Multiple matches found for "${amb.query}" (${amb.field}): ${opts}. Which one did you mean?`;
    });
    return {
      batchId: '',
      actions: [],
      pendingInserts: [],
      answer: `Please clarify before I propose any changes:\n${lines.join('\n')}`,
      toolPayload: {
        status: allAmbiguities.every((a) => a.not_found)
          ? 'not_found'
          : 'ambiguous',
        ambiguities: allAmbiguities,
      },
    };
  }

  // Reject (do not store) any change the signed-in user's role cannot make.
  // The same check runs again at confirm time in executeAiActionInTransaction.
  const forbidden: Array<{ type: AllowedAiActionType; reason: string }> = [];
  const permittedItems = resolvedItems.filter((item) => {
    const check = getActionPermissionSpec(item.type).allowed(ctx.roles);
    if (!check.allowed) {
      forbidden.push({
        type: item.type,
        reason: check.reason ?? `Your role is not permitted to ${item.type}.`,
      });
      return false;
    }
    return true;
  });
  const forbiddenLines = forbidden.map(
    (f) => `- Not proposed (${f.type}): ${f.reason}`
  );

  if (permittedItems.length === 0) {
    return {
      batchId: '',
      actions: [],
      pendingInserts: [],
      answer: `I can't propose ${forbidden.length === 1 ? 'this change' : 'these changes'} for your role:\n${forbiddenLines.join('\n')}`,
      toolPayload: {
        status: 'forbidden',
        rejected: forbidden,
      },
    };
  }

  const batchId = generatePrefixedId('AIB-');
  const verRes = await ctx.pool.query<{ data_version: string | number }>(
    `SELECT data_version FROM public.app_state WHERE id = 1`
  );
  const dataVersion = String(verRes.rows[0]?.data_version ?? 1);

  const actions: Array<Record<string, unknown>> = [];
  const pendingInserts: PendingAiActionInsert[] = [];

  for (const item of permittedItems) {
    const cleanPayload = parseActionPayload(item.type, item.payload);
    const payloadSha256 = computePayloadSha256(cleanPayload);
    const permSpec = getActionPermissionSpec(item.type);
    const permCheck = permSpec.allowed(ctx.roles);
    const actionId = generatePrefixedId('AIA-');

    const snapshot = await fetchBeforeSnapshot(ctx.pool, item.type, cleanPayload);
    const affectedSummary = item.summary || snapshot.defaultSummary;
    const storedPayload: Record<string, unknown> = {
      ...cleanPayload,
      _preview: {
        summary: affectedSummary,
        field_diffs: snapshot.fieldDiffs,
        impacted_note: snapshot.impactedNote,
        before_snapshot: snapshot.beforeSnapshot,
      },
      _target_guard: snapshot.targetGuard,
    };

    actions.push({
      ai_action_id: actionId,
      batch_id: batchId,
      query_id: ctx.queryId,
      action_type: item.type,
      permission_level: permSpec.permissionLevel,
      payload: cleanPayload,
      payload_hash: payloadSha256,
      payload_sha256: payloadSha256,
      status: 'proposed',
      permission_allowed: permCheck.allowed,
      permission_reason: permCheck.reason ?? null,
      affected_summary: affectedSummary,
      field_diffs: snapshot.fieldDiffs,
      impacted_note: snapshot.impactedNote,
      before_snapshot: snapshot.beforeSnapshot,
      linked_sponsor_id: snapshot.linkedSponsorId,
      linked_contact_id: snapshot.linkedContactId,
      linked_campaign_id: snapshot.linkedCampaignId,
      linked_opportunity_id: snapshot.linkedOpportunityId,
    });

    pendingInserts.push({
      ai_action_id: actionId,
      action_type: item.type,
      permission_level: permSpec.permissionLevel,
      payload: storedPayload,
      payload_sha256: payloadSha256,
      record_class: writableClass,
      source_ref: `ai_batch:${batchId}`,
      data_version: dataVersion,
    });
  }

  const summaryLines = actions.map(
    (a, idx) =>
      `${idx + 1}. ${String(a.affected_summary)} [${String(a.action_type)} · ${String(a.ai_action_id)}]`
  );

  const answer =
    `Prepared ${actions.length} proposed ${actions.length === 1 ? 'change' : 'changes'} for your review (${ctx.editionId}, ${writableClass}, data v${dataVersion}). No database records have been modified yet — confirm below to apply:\n` +
    summaryLines.join('\n') +
    (forbiddenLines.length > 0
      ? `\n\nNot proposed for your role:\n${forbiddenLines.join('\n')}`
      : '');

  return {
    batchId,
    actions,
    pendingInserts,
    answer,
    toolPayload: {
      batch_id: batchId,
      count: actions.length,
      status: 'proposed',
      ...(forbidden.length > 0 ? { rejected: forbidden } : {}),
      actions: actions.map((a) => ({
        ai_action_id: a.ai_action_id,
        action_type: a.action_type,
        affected_summary: a.affected_summary,
        field_diffs: a.field_diffs,
        impacted_note: a.impacted_note,
        permission_allowed: a.permission_allowed,
      })),
    },
  };
}

export async function insertPendingAiActions(
  client: PoolClient,
  params: {
    queryId: string | null;
    importBatchId: string;
    actorMemberId: string;
    inserts: ReadonlyArray<PendingAiActionInsert>;
  }
): Promise<void> {
  for (const ins of params.inserts) {
    await client.query(
      `INSERT INTO public.ai_action (
         ai_action_id, query_id, action_type, permission_level,
         payload, payload_sha256, status,
         record_class, import_batch_id, source_ref, evidence_class,
         data_version, created_by
       ) VALUES (
         $1, $2, $3, $4,
         $5::jsonb, $6, 'proposed',
         $7, $8, $9, 'T',
         $10, $11
       )`,
      [
        ins.ai_action_id,
        params.queryId,
        ins.action_type,
        ins.permission_level,
        JSON.stringify(ins.payload),
        ins.payload_sha256,
        ins.record_class,
        params.importBatchId,
        ins.source_ref,
        ins.data_version,
        params.actorMemberId,
      ]
    );
  }
}

interface StoredAiActionRow {
  ai_action_id: string;
  query_id: string | null;
  action_type: string;
  permission_level: string;
  payload: Record<string, unknown>;
  payload_sha256: string;
  status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  executed_at: string | null;
  created_at?: string | null;
  record_class: 'live' | 'simulated';
  import_batch_id: string;
  source_ref: string | null;
  data_version: string | null;
}

async function assertTargetGuardFresh(
  client: PoolClient,
  rawPayload: Record<string, unknown>,
  sameBatchActionIds?: ReadonlySet<string>
): Promise<void> {
  const guard = rawPayload._target_guard as TargetGuard | null | undefined;
  if (!guard || !guard.kind || !guard.id) return;

  if (guard.kind === 'opportunity') {
    const res = await client.query<{
      updated_at: string | Date | null;
      history_id: string | null;
      sv_ai_action_id: string | null;
    }>(
      `SELECT o.updated_at, sv.history_id, sv.ai_action_id AS sv_ai_action_id
         FROM public.opportunity o
         LEFT JOIN LATERAL (
           SELECT history_id, ai_action_id
             FROM public.opportunity_stage_version osv
            WHERE osv.opportunity_id = o.opportunity_id AND NOT osv.is_deleted
            ORDER BY osv.valid_from DESC, osv.history_id DESC LIMIT 1
         ) sv ON true
        WHERE o.opportunity_id = $1 AND NOT o.is_deleted LIMIT 1`,
      [guard.id]
    );
    const cur = res.rows[0];
    if (!cur) {
      throw new AppApiError(
        409,
        'STALE_PROPOSAL',
        'This record changed since the proposal; ask again'
      );
    }
    if (
      cur.sv_ai_action_id &&
      sameBatchActionIds?.has(String(cur.sv_ai_action_id))
    ) {
      return;
    }
    if (guard.history_id && cur.history_id && String(cur.history_id) !== String(guard.history_id)) {
      throw new AppApiError(
        409,
        'STALE_PROPOSAL',
        'This record changed since the proposal; ask again'
      );
    }
    if (guard.updated_at && cur.updated_at) {
      const prevMs = Date.parse(String(guard.updated_at));
      const curMs = Date.parse(String(cur.updated_at));
      if (Number.isFinite(prevMs) && Number.isFinite(curMs) && curMs !== prevMs) {
        throw new AppApiError(
          409,
          'STALE_PROPOSAL',
          'This record changed since the proposal; ask again'
        );
      }
    }
  } else if (guard.kind === 'task' && guard.updated_at) {
    const res = await client.query<{
      updated_at: string | Date | null;
      ai_action_id: string | null;
    }>(
      `SELECT updated_at, ai_action_id FROM public.task WHERE task_id = $1 AND NOT is_deleted LIMIT 1`,
      [guard.id]
    );
    const cur = res.rows[0];
    if (!cur) {
      throw new AppApiError(
        409,
        'STALE_PROPOSAL',
        'This record changed since the proposal; ask again'
      );
    }
    if (cur.ai_action_id && sameBatchActionIds?.has(String(cur.ai_action_id))) {
      return;
    }
    if (cur.updated_at) {
      const prevMs = Date.parse(String(guard.updated_at));
      const curMs = Date.parse(String(cur.updated_at));
      if (Number.isFinite(prevMs) && Number.isFinite(curMs) && curMs !== prevMs) {
        throw new AppApiError(
          409,
          'STALE_PROPOSAL',
          'This record changed since the proposal; ask again'
        );
      }
    }
  } else if (guard.kind === 'sponsor' && guard.updated_at) {
    const res = await client.query<{
      updated_at: string | Date | null;
      ai_action_id: string | null;
    }>(
      `SELECT updated_at, ai_action_id FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
      [guard.id]
    );
    const cur = res.rows[0];
    if (!cur) {
      throw new AppApiError(
        409,
        'STALE_PROPOSAL',
        'This record changed since the proposal; ask again'
      );
    }
    if (cur.ai_action_id && sameBatchActionIds?.has(String(cur.ai_action_id))) {
      return;
    }
    if (cur.updated_at) {
      const prevMs = Date.parse(String(guard.updated_at));
      const curMs = Date.parse(String(cur.updated_at));
      if (Number.isFinite(prevMs) && Number.isFinite(curMs) && curMs !== prevMs) {
        throw new AppApiError(
          409,
          'STALE_PROPOSAL',
          'This record changed since the proposal; ask again'
        );
      }
    }
  }
}


export async function executeAiActionInTransaction(
  client: PoolClient,
  actionRow: StoredAiActionRow,
  actorMemberId: string,
  roles: ReadonlyArray<CanonicalRole>,
  defaultEditionId: string,
  sameBatchActionIds?: ReadonlySet<string>
): Promise<{
  action: Record<string, unknown>;
  auditEventId: string;
  dataVersion: number;
  createdRecordType: string;
  createdRecordId: string;
}> {
  if (actionRow.status !== 'proposed') {
    throw new AppApiError(
      409,
      'ACTION_NOT_PROPOSED',
      `Action ${actionRow.ai_action_id} is already "${actionRow.status}" and cannot be executed again.`
    );
  }

  if (actionRow.created_at) {
    const createdMs = Date.parse(String(actionRow.created_at));
    if (Number.isFinite(createdMs) && Date.now() - createdMs > 30 * 60 * 1000) {
      throw new AppApiError(
        409,
        'ACTION_EXPIRED',
        'This proposal expired (older than 30 minutes); ask again.'
      );
    }
  }

  if (!(ALLOWED_AI_ACTION_TYPES as ReadonlyArray<string>).includes(actionRow.action_type)) {
    throw new AppApiError(
      422,
      'INVALID_ACTION_TYPE',
      `Action type "${actionRow.action_type}" is not allowed.`
    );
  }
  const actionType = actionRow.action_type as AllowedAiActionType;
  const rawPayloadObj = (actionRow.payload ?? {}) as Record<string, unknown>;
  const payload = parseActionPayload(actionType, rawPayloadObj);
  const recomputedHash = computePayloadSha256(payload);
  if (recomputedHash !== actionRow.payload_sha256) {
    throw new AppApiError(
      409,
      'PAYLOAD_HASH_MISMATCH',
      'Stored payload failed canonical SHA-256 verification.'
    );
  }

  await assertTargetGuardFresh(client, rawPayloadObj, sameBatchActionIds);

  const permSpec = getActionPermissionSpec(actionType);
  const permCheck = permSpec.allowed(roles);
  if (!permCheck.allowed) {
    throw new AppApiError(
      403,
      'FORBIDDEN',
      permCheck.reason ?? `Role is not permitted to confirm ${actionType}.`
    );
  }
  const scope = permCheck.scope;

  rejectHistoricalWriteRequest(null, actionRow.record_class);
  const edition = await resolveWritableEditionByClass(
    client,
    actionRow.record_class,
    defaultEditionId
  );
  const batchId = await ensureUiImportBatch(
    client,
    edition.editionId,
    edition.recordClass,
    actorMemberId
  );
  const sourceRef = `ai_action:${actionType}`;
  const aiActionId = actionRow.ai_action_id;

  let auditEntity = 'AI_ACTION';
  let auditEntityId = aiActionId;
  let auditOp: 'insert' | 'update' = 'insert';
  let auditAfter: Record<string, unknown> = {};
  let createdRecordType = '';
  let createdRecordId = '';

  switch (actionType) {
    case 'create_task': {
      const ownerId =
        scope === 'own'
          ? actorMemberId
          : (payload.owner_member_id as string | undefined) ?? actorMemberId;
      if (
        scope === 'own' &&
        payload.owner_member_id &&
        payload.owner_member_id !== actorMemberId
      ) {
        throw new AppApiError(
          403,
          'FORBIDDEN',
          'You can only confirm tasks assigned to yourself.'
        );
      }
      if (payload.linked_type && payload.linked_id) {
        await assertLinkedRecordExists(
          client,
          payload.linked_type as (typeof TASK_LINKED_TYPE_VALUES)[number],
          String(payload.linked_id)
        );
      }
      const taskId = generatePrefixedId('TK-');
      const tRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.task (
           task_id, title, task_type, owner_member_id, due_at, status,
           completed_at, linked_type, linked_id, bet_id, origin,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5::timestamptz, $6,
           ${payload.status === 'done' ? 'now()' : 'NULL'}, $7, $8, $9, 'ai_confirmed',
           $10, $11, $12, 'T',
           $13, $14
         ) RETURNING *`,
        [
          taskId,
          payload.title,
          payload.task_type,
          ownerId,
          payload.due_at,
          payload.status,
          payload.linked_type ?? null,
          payload.linked_id ?? null,
          payload.bet_id ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'TASK';
      auditEntityId = taskId;
      createdRecordType = 'task';
      createdRecordId = taskId;
      auditAfter = tRes.rows[0] ?? { task_id: taskId };
      break;
    }

    case 'update_task': {
      const taskId = String(payload.task_id);
      const curRes = await client.query<{
        task_id: string;
        owner_member_id: string;
        record_class: string;
      }>(
        `SELECT task_id, owner_member_id, record_class
           FROM public.task WHERE task_id = $1 AND NOT is_deleted LIMIT 1`,
        [taskId]
      );
      const existing = curRes.rows[0];
      if (!existing) {
        throw new AppApiError(404, 'TASK_NOT_FOUND', `Task ${taskId} not found.`);
      }
      if (scope === 'own' && existing.owner_member_id !== actorMemberId) {
        throw new AppApiError(403, 'FORBIDDEN', 'You can only update your own tasks.');
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      const addSet = (col: string, val: unknown, cast = '') => {
        params.push(val);
        sets.push(`${col} = $${params.length}${cast}`);
      };
      if (payload.title !== undefined) addSet('title', payload.title);
      if (payload.task_type !== undefined) addSet('task_type', payload.task_type);
      if (payload.owner_member_id !== undefined)
        addSet('owner_member_id', payload.owner_member_id);
      if (payload.due_at !== undefined)
        addSet('due_at', payload.due_at, '::timestamptz');
      if (payload.status !== undefined) {
        addSet('status', payload.status);
        if (payload.status === 'done') {
          sets.push('completed_at = COALESCE(completed_at, now())');
        } else {
          sets.push('completed_at = NULL');
        }
      }
      if (payload.linked_type !== undefined) addSet('linked_type', payload.linked_type);
      if (payload.linked_id !== undefined) addSet('linked_id', payload.linked_id);
      if (payload.bet_id !== undefined) addSet('bet_id', payload.bet_id);
      addSet('ai_action_id', aiActionId);
      addSet('source_ref', sourceRef);

      params.push(taskId);
      const updRes = await client.query<Record<string, unknown>>(
        `UPDATE public.task SET ${sets.join(', ')} WHERE task_id = $${params.length} RETURNING *`,
        params
      );
      auditEntity = 'TASK';
      auditEntityId = taskId;
      auditOp = 'update';
      createdRecordType = 'task';
      createdRecordId = taskId;
      auditAfter = updRes.rows[0] ?? { task_id: taskId };
      break;
    }

    case 'log_interaction': {
      const attemptId = String(payload.attempt_id);
      const attRes = await client.query<{
        attempt_id: string;
        sponsor_id: string;
        owner_member_id: string | null;
        record_class: string;
      }>(
        `SELECT attempt_id, sponsor_id, owner_member_id, record_class
           FROM public.outreach_attempt WHERE attempt_id = $1 AND NOT is_deleted LIMIT 1`,
        [attemptId]
      );
      const att = attRes.rows[0];
      if (!att) {
        throw new AppApiError(404, 'OUTREACH_ATTEMPT_NOT_FOUND', `Outreach attempt ${attemptId} not found.`);
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, att.sponsor_id, actorMemberId, att.record_class);
        if (att.owner_member_id !== actorMemberId && !owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only log interactions for your own sponsors.');
        }
      }
      const interactionId = generatePrefixedId('IN-');
      const intRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.interaction (
           interaction_id, attempt_id, origin_interaction_id, event_type,
           outcome, occurred_at, summary, logged_by,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6::timestamptz, $7, $8,
           $9, $10, $11, 'T',
           $8, $12
         ) RETURNING *`,
        [
          interactionId,
          attemptId,
          payload.origin_interaction_id ?? null,
          payload.event_type,
          payload.outcome ?? null,
          (payload.occurred_at as string | undefined) ?? new Date().toISOString(),
          payload.summary ?? null,
          actorMemberId,
          edition.recordClass,
          batchId,
          sourceRef,
          aiActionId,
        ]
      );
      auditEntity = 'INTERACTION';
      auditEntityId = interactionId;
      createdRecordType = 'interaction';
      createdRecordId = interactionId;
      auditAfter = intRes.rows[0] ?? { interaction_id: interactionId };
      break;
    }

    case 'log_meeting': {
      const sponsorId = String(payload.sponsor_id);
      const spRes = await client.query<{ record_class: string }>(
        `SELECT record_class FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
        [sponsorId]
      );
      if (!spRes.rows[0]) {
        throw new AppApiError(404, 'SPONSOR_NOT_FOUND', `Sponsor ${sponsorId} not found.`);
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, sponsorId, actorMemberId, spRes.rows[0].record_class);
        if (!owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only log meetings for sponsors you own.');
        }
      }
      const meetingId = generatePrefixedId('MT-');
      const mtRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.meeting (
           meeting_id, attempt_id, opportunity_id, sponsor_id,
           scheduled_at, status, purpose, attendee_member_ids, outcome_note,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5::timestamptz, $6, $7, $8::text[], $9,
           $10, $11, $12, 'T',
           $13, $14
         ) RETURNING *`,
        [
          meetingId,
          payload.attempt_id ?? null,
          payload.opportunity_id ?? null,
          sponsorId,
          payload.scheduled_at,
          payload.status ?? 'booked',
          payload.purpose ?? null,
          (payload.attendee_member_ids as string[] | null) ?? [actorMemberId],
          payload.outcome_note ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'MEETING';
      auditEntityId = meetingId;
      createdRecordType = 'meeting';
      createdRecordId = meetingId;
      auditAfter = mtRes.rows[0] ?? { meeting_id: meetingId };
      break;
    }

    case 'create_sponsor': {
      const sponsorId = generatePrefixedId('SP-');
      const spRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.sponsor (
           sponsor_id, display_name, legal_name, category_id,
           lifecycle_status, first_source, website, city, gstin,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8, NULL,
           $9, $10, $11, 'T',
           $12, $13
         ) RETURNING *`,
        [
          sponsorId,
          payload.display_name,
          payload.legal_name ?? null,
          payload.category_id ?? null,
          payload.lifecycle_status ?? 'prospect',
          payload.first_source ?? null,
          payload.website ?? null,
          payload.city ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      const ownerId =
        scope === 'own'
          ? actorMemberId
          : (payload.owner_member_id as string | null) ?? actorMemberId;
      const assignmentId = generatePrefixedId('OA-');
      await client.query(
        `INSERT INTO public.ownership_assignment (
           assignment_id, subject_type, subject_id, member_id,
           role_in_relationship, reason, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, 'sponsor', $2, $3,
           'owner', 'Initial sponsor creation', 1,
           $4, $5, $6, 'T',
           $7, $8
         )`,
        [
          assignmentId,
          sponsorId,
          ownerId,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'SPONSOR';
      auditEntityId = sponsorId;
      createdRecordType = 'sponsor';
      createdRecordId = sponsorId;
      auditAfter = spRes.rows[0] ?? { sponsor_id: sponsorId };
      break;
    }

    case 'update_sponsor': {
      const sponsorId = String(payload.sponsor_id);
      const curRes = await client.query<{ record_class: string }>(
        `SELECT record_class FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
        [sponsorId]
      );
      if (!curRes.rows[0]) {
        throw new AppApiError(404, 'SPONSOR_NOT_FOUND', `Sponsor ${sponsorId} not found.`);
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, sponsorId, actorMemberId, curRes.rows[0].record_class);
        if (!owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only update sponsors you own.');
        }
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      const addSet = (col: string, val: unknown) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      };
      if (payload.display_name !== undefined) addSet('display_name', payload.display_name);
      if (payload.legal_name !== undefined) addSet('legal_name', payload.legal_name);
      if (payload.category_id !== undefined) addSet('category_id', payload.category_id);
      if (payload.lifecycle_status !== undefined)
        addSet('lifecycle_status', payload.lifecycle_status);
      if (payload.first_source !== undefined) addSet('first_source', payload.first_source);
      if (payload.website !== undefined) addSet('website', payload.website);
      if (payload.city !== undefined) addSet('city', payload.city);
      addSet('ai_action_id', aiActionId);
      addSet('source_ref', sourceRef);
      params.push(sponsorId);
      const updRes = await client.query<Record<string, unknown>>(
        `UPDATE public.sponsor SET ${sets.join(', ')} WHERE sponsor_id = $${params.length} RETURNING *`,
        params
      );
      auditEntity = 'SPONSOR';
      auditEntityId = sponsorId;
      auditOp = 'update';
      createdRecordType = 'sponsor';
      createdRecordId = sponsorId;
      auditAfter = updRes.rows[0] ?? { sponsor_id: sponsorId };
      break;
    }

    case 'change_owner': {
      const subjectType = String(payload.subject_type) as
        | 'sponsor'
        | 'opportunity'
        | 'network_partner';
      const subjectId = String(payload.subject_id);
      const targetTable =
        subjectType === 'sponsor'
          ? { table: 'sponsor', pk: 'sponsor_id' }
          : subjectType === 'opportunity'
            ? { table: 'opportunity', pk: 'opportunity_id' }
            : { table: 'network_partner', pk: 'partner_id' };
      const subRes = await client.query<{ record_class: string }>(
        `SELECT record_class FROM public.${targetTable.table} WHERE ${targetTable.pk} = $1 AND NOT is_deleted LIMIT 1`,
        [subjectId]
      );
      if (!subRes.rows[0]) {
        throw new AppApiError(404, 'NOT_FOUND', `${subjectType} ${subjectId} not found.`);
      }
      if (scope === 'own') {
        const currentOwner =
          subjectType === 'sponsor'
            ? await getCurrentSponsorOwnerId(client, subjectId, subRes.rows[0].record_class)
            : subjectType === 'opportunity'
              ? await getOpportunityOwnerId(client, subjectId)
              : null;
        if (currentOwner !== actorMemberId) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only reassign records you currently own.');
        }
      }
      let nextVersion = 1;
      let prevId: string | null = null;
      if (payload.role_in_relationship === 'owner') {
        const prevRes = await client.query<{ assignment_id: string; version_no: number }>(
          `UPDATE public.ownership_assignment SET valid_to = now()
            WHERE subject_type = $1 AND subject_id = $2 AND record_class = $3
              AND role_in_relationship = 'owner' AND valid_to IS NULL AND NOT is_deleted
            RETURNING assignment_id, version_no`,
          [subjectType, subjectId, edition.recordClass]
        );
        if (prevRes.rows[0]) {
          prevId = prevRes.rows[0].assignment_id;
          nextVersion = Number(prevRes.rows[0].version_no ?? 1) + 1;
        }
      }
      const assignmentId = generatePrefixedId('OA-');
      const oaRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.ownership_assignment (
           assignment_id, subject_type, subject_id, member_id,
           role_in_relationship, reason, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8, $9, $10, 'T',
           $11, $12
         ) RETURNING *`,
        [
          assignmentId,
          subjectType,
          subjectId,
          payload.member_id,
          payload.role_in_relationship ?? 'owner',
          payload.reason ?? null,
          nextVersion,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      if (prevId) {
        await client.query(
          `UPDATE public.ownership_assignment SET superseded_by = $1 WHERE assignment_id = $2`,
          [assignmentId, prevId]
        );
      }
      auditEntity = 'OWNERSHIP_ASSIGNMENT';
      auditEntityId = assignmentId;
      createdRecordType = subjectType;
      createdRecordId = subjectId;
      auditAfter = oaRes.rows[0] ?? { assignment_id: assignmentId };
      break;
    }

    case 'create_contact': {
      const sponsorId = String(payload.sponsor_id);
      const spRes = await client.query<{ record_class: string }>(
        `SELECT record_class FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
        [sponsorId]
      );
      if (!spRes.rows[0]) {
        throw new AppApiError(404, 'SPONSOR_NOT_FOUND', `Sponsor ${sponsorId} not found.`);
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, sponsorId, actorMemberId, spRes.rows[0].record_class);
        if (!owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only add contacts to sponsors you own.');
        }
      }
      const contactId = generatePrefixedId('CT-');
      const cRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.contact (
           contact_id, sponsor_id, full_name, job_title, decision_role,
           email, phone, consent_basis, opted_out_at,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, NULL,
           $9, $10, $11, 'T',
           $12, $13
         ) RETURNING *`,
        [
          contactId,
          sponsorId,
          payload.full_name,
          payload.job_title ?? null,
          payload.decision_role ?? 'unknown',
          payload.email ?? null,
          payload.phone ?? null,
          payload.consent_basis ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'CONTACT';
      auditEntityId = contactId;
      createdRecordType = 'sponsor';
      createdRecordId = sponsorId;
      auditAfter = cRes.rows[0] ?? { contact_id: contactId };
      break;
    }

    case 'update_contact': {
      const contactId = String(payload.contact_id);
      const curRes = await client.query<{ sponsor_id: string; record_class: string }>(
        `SELECT sponsor_id, record_class FROM public.contact WHERE contact_id = $1 AND NOT is_deleted LIMIT 1`,
        [contactId]
      );
      if (!curRes.rows[0]) {
        throw new AppApiError(404, 'CONTACT_NOT_FOUND', `Contact ${contactId} not found.`);
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, curRes.rows[0].sponsor_id, actorMemberId, curRes.rows[0].record_class);
        if (!owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only update contacts for sponsors you own.');
        }
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      const addSet = (col: string, val: unknown) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      };
      if (payload.full_name !== undefined) addSet('full_name', payload.full_name);
      if (payload.job_title !== undefined) addSet('job_title', payload.job_title);
      if (payload.decision_role !== undefined) addSet('decision_role', payload.decision_role);
      if (payload.email !== undefined) addSet('email', payload.email);
      if (payload.phone !== undefined) addSet('phone', payload.phone);
      if (payload.consent_basis !== undefined) addSet('consent_basis', payload.consent_basis);
      if (payload.opt_out === true) {
        sets.push('opted_out_at = COALESCE(opted_out_at, now())');
      }
      addSet('ai_action_id', aiActionId);
      addSet('source_ref', sourceRef);
      params.push(contactId);
      const updRes = await client.query<Record<string, unknown>>(
        `UPDATE public.contact SET ${sets.join(', ')} WHERE contact_id = $${params.length} RETURNING *`,
        params
      );
      auditEntity = 'CONTACT';
      auditEntityId = contactId;
      auditOp = 'update';
      createdRecordType = 'sponsor';
      createdRecordId = curRes.rows[0].sponsor_id;
      auditAfter = updRes.rows[0] ?? { contact_id: contactId };
      break;
    }

    case 'upsert_sponsor_contact': {
      let targetSponsorId = payload.sponsor_id as string | undefined;
      if (!targetSponsorId && payload.contact_id) {
        const ctRes = await client.query<{ sponsor_id: string }>(
          `SELECT sponsor_id FROM public.contact WHERE contact_id = $1 AND NOT is_deleted LIMIT 1`,
          [payload.contact_id]
        );
        if (!ctRes.rows[0]) {
          throw new AppApiError(404, 'CONTACT_NOT_FOUND', `Contact ${String(payload.contact_id)} not found.`);
        }
        targetSponsorId = ctRes.rows[0].sponsor_id;
      }
      if (!targetSponsorId && payload.sponsor_display_name) {
        const spFind = await client.query<{ sponsor_id: string }>(
          `SELECT sponsor_id FROM public.sponsor
            WHERE record_class = $1 AND LOWER(display_name) = LOWER($2) AND NOT is_deleted LIMIT 1`,
          [edition.recordClass, payload.sponsor_display_name]
        );
        if (spFind.rows[0]) {
          targetSponsorId = spFind.rows[0].sponsor_id;
        } else {
          targetSponsorId = generatePrefixedId('SP-');
          await client.query(
            `INSERT INTO public.sponsor (
               sponsor_id, display_name, category_id, lifecycle_status,
               record_class, import_batch_id, source_ref, evidence_class,
               created_by, ai_action_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'T', $8, $9)`,
            [
              targetSponsorId,
              payload.sponsor_display_name,
              payload.category_id ?? null,
              payload.lifecycle_status ?? 'prospect',
              edition.recordClass,
              batchId,
              sourceRef,
              actorMemberId,
              aiActionId,
            ]
          );
          const oaId = generatePrefixedId('OA-');
          await client.query(
            `INSERT INTO public.ownership_assignment (
               assignment_id, subject_type, subject_id, member_id,
               role_in_relationship, reason, version_no,
               record_class, import_batch_id, source_ref, evidence_class,
               created_by, ai_action_id
             ) VALUES ($1, 'sponsor', $2, $3, 'owner', 'AI upsert sponsor contact', 1, $4, $5, $6, 'T', $7, $8)`,
            [oaId, targetSponsorId, actorMemberId, edition.recordClass, batchId, sourceRef, actorMemberId, aiActionId]
          );
        }
      }
      if (!targetSponsorId) {
        throw new AppApiError(400, 'INVALID_ARGUMENT', 'Could not resolve target sponsor.');
      }

      if (payload.contact_id) {
        const updRes = await client.query<Record<string, unknown>>(
          `UPDATE public.contact
              SET full_name = $1,
                  job_title = COALESCE($2, job_title),
                  decision_role = COALESCE($3, decision_role),
                  email = COALESCE($4, email),
                  phone = COALESCE($5, phone),
                  consent_basis = COALESCE($6, consent_basis),
                  ai_action_id = $7,
                  source_ref = $8
            WHERE contact_id = $9
            RETURNING *`,
          [
            payload.full_name,
            payload.job_title ?? null,
            payload.decision_role ?? 'unknown',
            payload.email ?? null,
            payload.phone ?? null,
            payload.consent_basis ?? null,
            aiActionId,
            sourceRef,
            payload.contact_id,
          ]
        );
        auditEntity = 'CONTACT';
        auditEntityId = String(payload.contact_id);
        auditOp = 'update';
        createdRecordType = 'sponsor';
        createdRecordId = targetSponsorId;
        auditAfter = updRes.rows[0] ?? { contact_id: payload.contact_id };
      } else {
        const contactId = generatePrefixedId('CT-');
        const insRes = await client.query<Record<string, unknown>>(
          `INSERT INTO public.contact (
             contact_id, sponsor_id, full_name, job_title, decision_role,
             email, phone, consent_basis, opted_out_at,
             record_class, import_batch_id, source_ref, evidence_class,
             created_by, ai_action_id
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, NULL,
             $9, $10, $11, 'T',
             $12, $13
           ) RETURNING *`,
          [
            contactId,
            targetSponsorId,
            payload.full_name,
            payload.job_title ?? null,
            payload.decision_role ?? 'unknown',
            payload.email ?? null,
            payload.phone ?? null,
            payload.consent_basis ?? null,
            edition.recordClass,
            batchId,
            sourceRef,
            actorMemberId,
            aiActionId,
          ]
        );
        auditEntity = 'CONTACT';
        auditEntityId = contactId;
        createdRecordType = 'sponsor';
        createdRecordId = targetSponsorId;
        auditAfter = insRes.rows[0] ?? { contact_id: contactId };
      }
      break;
    }

    case 'create_campaign': {
      const campaignId = generatePrefixedId('CA-');
      const cRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.campaign (
           campaign_id, edition_id, name, channel_id, bet_id, owner_member_id,
           planned_start, planned_end, objective, status,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7::timestamptz, $8::timestamptz, $9, $10,
           $11, $12, $13, 'T',
           $14, $15
         ) RETURNING *`,
        [
          campaignId,
          edition.editionId,
          payload.name,
          payload.channel_id,
          payload.bet_id ?? null,
          (payload.owner_member_id as string | null) ?? actorMemberId,
          payload.planned_start ?? null,
          payload.planned_end ?? null,
          payload.objective ?? null,
          payload.status ?? 'planned',
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'CAMPAIGN';
      auditEntityId = campaignId;
      createdRecordType = 'campaign';
      createdRecordId = campaignId;
      auditAfter = cRes.rows[0] ?? { campaign_id: campaignId };
      break;
    }

    case 'update_campaign': {
      const campaignId = String(payload.campaign_id);
      const curRes = await client.query<{ campaign_id: string }>(
        `SELECT campaign_id FROM public.campaign WHERE campaign_id = $1 AND NOT is_deleted LIMIT 1`,
        [campaignId]
      );
      if (!curRes.rows[0]) {
        throw new AppApiError(404, 'CAMPAIGN_NOT_FOUND', `Campaign ${campaignId} not found.`);
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      const addSet = (col: string, val: unknown, cast = '') => {
        params.push(val);
        sets.push(`${col} = $${params.length}${cast}`);
      };
      if (payload.name !== undefined) addSet('name', payload.name);
      if (payload.channel_id !== undefined) addSet('channel_id', payload.channel_id);
      if (payload.bet_id !== undefined) addSet('bet_id', payload.bet_id);
      if (payload.owner_member_id !== undefined)
        addSet('owner_member_id', payload.owner_member_id);
      if (payload.planned_start !== undefined)
        addSet('planned_start', payload.planned_start, '::timestamptz');
      if (payload.planned_end !== undefined)
        addSet('planned_end', payload.planned_end, '::timestamptz');
      if (payload.objective !== undefined) addSet('objective', payload.objective);
      if (payload.status !== undefined) addSet('status', payload.status);
      addSet('ai_action_id', aiActionId);
      addSet('source_ref', sourceRef);
      params.push(campaignId);
      const updRes = await client.query<Record<string, unknown>>(
        `UPDATE public.campaign SET ${sets.join(', ')} WHERE campaign_id = $${params.length} RETURNING *`,
        params
      );
      auditEntity = 'CAMPAIGN';
      auditEntityId = campaignId;
      auditOp = 'update';
      createdRecordType = 'campaign';
      createdRecordId = campaignId;
      auditAfter = updRes.rows[0] ?? { campaign_id: campaignId };
      break;
    }

    case 'log_outreach': {
      const spRes = await client.query<{
        lifecycle_status: string | null;
        record_class: string;
      }>(
        `SELECT lifecycle_status, record_class FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
        [payload.sponsor_id]
      );
      const sp = spRes.rows[0];
      if (!sp) {
        throw new AppApiError(404, 'SPONSOR_NOT_FOUND', `Sponsor ${String(payload.sponsor_id)} not found.`);
      }
      if (sp.lifecycle_status === 'do_not_contact') {
        throw new AppApiError(422, 'OUTREACH_BLOCKED', 'Sponsor is marked do_not_contact.');
      }
      if (payload.contact_id) {
        const ctRes = await client.query<{ sponsor_id: string; opted_out_at: string | null }>(
          `SELECT sponsor_id, opted_out_at FROM public.contact WHERE contact_id = $1 AND NOT is_deleted LIMIT 1`,
          [payload.contact_id]
        );
        if (!ctRes.rows[0] || ctRes.rows[0].sponsor_id !== payload.sponsor_id) {
          throw new AppApiError(422, 'INVALID_CONTACT', 'Contact does not belong to sponsor.');
        }
        if (ctRes.rows[0].opted_out_at) {
          throw new AppApiError(422, 'OUTREACH_BLOCKED', 'Contact has opted out of outreach.');
        }
      }
      const attemptId = generatePrefixedId('AT-');
      const startedAtIso =
        (payload.started_at as string | undefined) ?? new Date().toISOString();
      const attRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.outreach_attempt (
           attempt_id, campaign_id, sponsor_id, contact_id, referral_id,
           owner_member_id, started_at, root_event_type,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7::timestamptz, $8,
           $9, $10, $11, 'T',
           $6, $12
         ) RETURNING *`,
        [
          attemptId,
          payload.campaign_id,
          payload.sponsor_id,
          payload.contact_id ?? null,
          payload.referral_id ?? null,
          actorMemberId,
          startedAtIso,
          payload.root_event_type ?? 'outreach_sent',
          edition.recordClass,
          batchId,
          sourceRef,
          aiActionId,
        ]
      );
      const interactionId = generatePrefixedId('IN-');
      await client.query(
        `INSERT INTO public.interaction (
           interaction_id, attempt_id, event_type, outcome, occurred_at,
           summary, logged_by,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5::timestamptz,
           $6, $7,
           $8, $9, $10, 'T',
           $7, $11
         )`,
        [
          interactionId,
          attemptId,
          payload.root_event_type ?? 'outreach_sent',
          payload.outcome ?? 'sent',
          startedAtIso,
          payload.summary ?? null,
          actorMemberId,
          edition.recordClass,
          batchId,
          sourceRef,
          aiActionId,
        ]
      );
      auditEntity = 'OUTREACH_ATTEMPT';
      auditEntityId = attemptId;
      createdRecordType = 'campaign';
      createdRecordId = String(payload.campaign_id);
      auditAfter = attRes.rows[0] ?? { attempt_id: attemptId };
      break;
    }

    case 'record_qualification': {
      const sponsorId = String(payload.sponsor_id);
      const spRes = await client.query<{ record_class: string }>(
        `SELECT record_class FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
        [sponsorId]
      );
      if (!spRes.rows[0]) {
        throw new AppApiError(404, 'SPONSOR_NOT_FOUND', `Sponsor ${sponsorId} not found.`);
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, sponsorId, actorMemberId, spRes.rows[0].record_class);
        if (!owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only qualify sponsors you own.');
        }
      }
      const verRes = await client.query<{ max_ver: string | number }>(
        `SELECT COALESCE(MAX(version_no), 0) AS max_ver
           FROM public.qualification_version
          WHERE sponsor_id = $1 AND edition_id = $2 AND NOT is_deleted`,
        [sponsorId, edition.editionId]
      );
      const nextVersion = Number(verRes.rows[0]?.max_ver ?? 0) + 1;
      const historyId = generatePrefixedId('QV-');
      const qRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.qualification_version (
           history_id, sponsor_id, edition_id, source_campaign_id,
           status, reason, checklist_passed, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11, 'T',
           $12, $13
         ) RETURNING *`,
        [
          historyId,
          sponsorId,
          edition.editionId,
          payload.source_campaign_id ?? null,
          payload.status,
          payload.reason ?? null,
          payload.checklist_passed ?? null,
          nextVersion,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'QUALIFICATION_VERSION';
      auditEntityId = historyId;
      createdRecordType = 'sponsor';
      createdRecordId = sponsorId;
      auditAfter = qRes.rows[0] ?? { history_id: historyId };
      break;
    }

    case 'create_opportunity': {
      const sponsorId = String(payload.sponsor_id);
      const spRes = await client.query<{ lifecycle_status: string | null; record_class: string }>(
        `SELECT lifecycle_status, record_class FROM public.sponsor WHERE sponsor_id = $1 AND NOT is_deleted LIMIT 1`,
        [sponsorId]
      );
      const sp = spRes.rows[0];
      if (!sp) {
        throw new AppApiError(404, 'SPONSOR_NOT_FOUND', `Sponsor ${sponsorId} not found.`);
      }
      if (sp.lifecycle_status === 'research_target') {
        throw new AppApiError(422, 'INV_03_VIOLATION', 'INV-03: research_target sponsor cannot open an opportunity.');
      }
      if (scope === 'own') {
        const owns = await isSponsorOwner(client, sponsorId, actorMemberId, sp.record_class);
        if (!owns) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only create opportunities for sponsors you own.');
        }
      }
      const opportunityId = generatePrefixedId('OP-');
      const ownerId =
        scope === 'own'
          ? actorMemberId
          : (payload.owner_member_id as string | null) ?? actorMemberId;
      const oppRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.opportunity (
           opportunity_id, sponsor_id, edition_id, primary_contact_id,
           originating_campaign_id, bet_id, support_type, is_renewal,
           renewal_route, recovered_lead, name,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14, 'T',
           $15, $16
         ) RETURNING *`,
        [
          opportunityId,
          sponsorId,
          edition.editionId,
          payload.primary_contact_id ?? null,
          payload.originating_campaign_id ?? null,
          payload.bet_id ?? null,
          payload.support_type ?? 'cash',
          Boolean(payload.is_renewal ?? false),
          payload.renewal_route ?? null,
          Boolean(payload.recovered_lead ?? false),
          payload.name ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      const historyId = generatePrefixedId('HV-');
      const stgRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.opportunity_stage_version (
           history_id, opportunity_id, stage, owner_member_id,
           proposed_value, confirmed_value, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, 'prospecting', $3,
           $4, 0, 1,
           $5, $6, $7, 'T',
           $8, $9
         ) RETURNING *`,
        [
          historyId,
          opportunityId,
          ownerId,
          payload.proposed_value ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'OPPORTUNITY';
      auditEntityId = opportunityId;
      createdRecordType = 'opportunity';
      createdRecordId = opportunityId;
      auditAfter = { opportunity: oppRes.rows[0], initial_stage: stgRes.rows[0] };
      break;
    }

    case 'update_opportunity': {
      const opportunityId = String(payload.opportunity_id);
      const curRes = await client.query<{ edition_id: string }>(
        `SELECT edition_id FROM public.opportunity WHERE opportunity_id = $1 AND NOT is_deleted LIMIT 1`,
        [opportunityId]
      );
      if (!curRes.rows[0]) {
        throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', `Opportunity ${opportunityId} not found.`);
      }
      if (scope === 'own') {
        const ownerId = await getOpportunityOwnerId(client, opportunityId);
        if (ownerId !== actorMemberId) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only update opportunities you own.');
        }
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      const addSet = (col: string, val: unknown) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      };
      if (payload.name !== undefined) addSet('name', payload.name);
      if (payload.primary_contact_id !== undefined)
        addSet('primary_contact_id', payload.primary_contact_id);
      if (payload.bet_id !== undefined) addSet('bet_id', payload.bet_id);
      addSet('ai_action_id', aiActionId);
      addSet('source_ref', sourceRef);
      params.push(opportunityId);
      const updRes = await client.query<Record<string, unknown>>(
        `UPDATE public.opportunity SET ${sets.join(', ')} WHERE opportunity_id = $${params.length} RETURNING *`,
        params
      );
      auditEntity = 'OPPORTUNITY';
      auditEntityId = opportunityId;
      auditOp = 'update';
      createdRecordType = 'opportunity';
      createdRecordId = opportunityId;
      auditAfter = updRes.rows[0] ?? { opportunity_id: opportunityId };
      break;
    }

    case 'change_stage': {
      const opportunityId = String(payload.opportunity_id);
      const oppRes = await client.query<{ edition_id: string }>(
        `SELECT edition_id FROM public.opportunity WHERE opportunity_id = $1 AND NOT is_deleted LIMIT 1`,
        [opportunityId]
      );
      if (!oppRes.rows[0]) {
        throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', `Opportunity ${opportunityId} not found.`);
      }
      await resolveWritableEdition(client, oppRes.rows[0].edition_id);

      const latestRes = await client.query<{
        owner_member_id: string | null;
        proposed_value: string | number | null;
        version_no: number;
      }>(
        `SELECT owner_member_id, proposed_value, version_no
           FROM public.opportunity_stage_version
          WHERE opportunity_id = $1 AND NOT is_deleted
          ORDER BY valid_from DESC, history_id DESC LIMIT 1`,
        [opportunityId]
      );
      const latest = latestRes.rows[0];
      if (scope === 'own' && latest?.owner_member_id !== actorMemberId) {
        throw new AppApiError(403, 'FORBIDDEN', 'You can only advance stages for opportunities you own.');
      }
      const historyId = generatePrefixedId('HV-');
      const nextVersion = Number(latest?.version_no ?? 0) + 1;
      const nextOwner =
        (payload.owner_member_id as string | null) ??
        latest?.owner_member_id ??
        actorMemberId;
      const nextProposed =
        payload.proposed_value !== undefined
          ? payload.proposed_value
          : latest?.proposed_value ?? null;
      const stage = String(payload.stage);

      const stgRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.opportunity_stage_version (
           history_id, opportunity_id, stage, owner_member_id,
           proposed_value, confirmed_value, drop_reason, loss_reason, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, 0, $6, $7, $8,
           $9, $10, $11, 'T',
           $12, $13
         ) RETURNING *`,
        [
          historyId,
          opportunityId,
          stage,
          nextOwner,
          nextProposed,
          stage === 'lost' || stage === 'withdrawn' ? payload.drop_reason ?? null : null,
          stage === 'lost' || stage === 'withdrawn' ? payload.loss_reason ?? null : null,
          nextVersion,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'OPPORTUNITY_STAGE_VERSION';
      auditEntityId = historyId;
      createdRecordType = 'opportunity';
      createdRecordId = opportunityId;
      auditAfter = stgRes.rows[0] ?? { history_id: historyId };
      break;
    }

    case 'confirm_deal': {
      const opportunityId = String(payload.opportunity_id);
      const oppRes = await client.query<{
        opportunity_id: string;
        sponsor_id: string;
        edition_id: string;
      }>(
        `SELECT opportunity_id, sponsor_id, edition_id
           FROM public.opportunity WHERE opportunity_id = $1 AND NOT is_deleted LIMIT 1`,
        [opportunityId]
      );
      const opp = oppRes.rows[0];
      if (!opp) {
        throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', `Opportunity ${opportunityId} not found.`);
      }
      await resolveWritableEdition(client, opp.edition_id);

      const latestRes = await client.query<{
        owner_member_id: string | null;
        proposed_value: string | number | null;
        version_no: number;
      }>(
        `SELECT owner_member_id, proposed_value, version_no
           FROM public.opportunity_stage_version
          WHERE opportunity_id = $1 AND NOT is_deleted
          ORDER BY valid_from DESC, history_id DESC LIMIT 1`,
        [opportunityId]
      );
      const latest = latestRes.rows[0];
      const isOwner =
        latest?.owner_member_id === actorMemberId ||
        (await isSponsorOwner(client, opp.sponsor_id, actorMemberId, edition.recordClass));
      if (!canConfirmOpportunity(roles, isOwner)) {
        throw new AppApiError(
          403,
          'FORBIDDEN',
          'Confirming a deal requires coordination_lead or the owning sales role.'
        );
      }

      const existingContract = await client.query<{ contract_id: string }>(
        `SELECT contract_id FROM public.contract
          WHERE opportunity_id = $1 AND status = 'active' AND valid_to IS NULL AND NOT is_deleted LIMIT 1`,
        [opportunityId]
      );
      if (existingContract.rows[0]) {
        throw new AppApiError(
          422,
          'CONTRACT_ALREADY_EXISTS',
          `Opportunity ${opportunityId} already has active contract ${existingContract.rows[0].contract_id}.`
        );
      }

      const contractId = generatePrefixedId('KC-');
      const signedTotal = Number(payload.signed_value_total);
      const cRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.contract (
           contract_id, opportunity_id, signed_at, signed_value_total,
           payment_terms, signatory_contact_id, document_uri, status, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3::timestamptz, $4,
           $5, $6, $7, 'active', 1,
           $8, $9, $10, 'T',
           $11, $12
         ) RETURNING *`,
        [
          contractId,
          opportunityId,
          payload.signed_at,
          signedTotal,
          payload.payment_terms,
          payload.signatory_contact_id ?? null,
          payload.document_uri ?? null,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );

      const lines = Array.isArray(payload.lines)
        ? (payload.lines as Array<Record<string, unknown>>)
        : [];
      const insertedLines: Array<Record<string, unknown>> = [];
      for (const line of lines) {
        const lineId = generatePrefixedId('KL-');
        const lRes = await client.query<Record<string, unknown>>(
          `INSERT INTO public.contract_line (
             contract_line_id, contract_id, asset_id, consideration_type, value, price_id,
             record_class, import_batch_id, source_ref, evidence_class,
             created_by, ai_action_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, 'T',
             $10, $11
           ) RETURNING *`,
          [
            lineId,
            contractId,
            line.asset_id ?? null,
            line.consideration_type,
            line.value,
            line.price_id ?? null,
            edition.recordClass,
            batchId,
            sourceRef,
            actorMemberId,
            aiActionId,
          ]
        );
        if (lRes.rows[0]) insertedLines.push(lRes.rows[0]);
      }

      const historyId = generatePrefixedId('HV-');
      const nextVersion = Number(latest?.version_no ?? 0) + 1;
      const stgRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.opportunity_stage_version (
           history_id, opportunity_id, stage, owner_member_id,
           proposed_value, confirmed_value, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, 'partner_confirmed', $3,
           $4, $5, $6,
           $7, $8, $9, 'T',
           $10, $11
         ) RETURNING *`,
        [
          historyId,
          opportunityId,
          latest?.owner_member_id ?? actorMemberId,
          latest?.proposed_value ?? signedTotal,
          signedTotal,
          nextVersion,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'CONTRACT';
      auditEntityId = contractId;
      createdRecordType = 'opportunity';
      createdRecordId = opportunityId;
      auditAfter = {
        contract: cRes.rows[0],
        lines: insertedLines,
        stage_version: stgRes.rows[0],
      };
      break;
    }

    case 'log_time': {
      const targetMember =
        scope === 'own'
          ? actorMemberId
          : (payload.member_id as string | undefined) ?? actorMemberId;
      if (scope === 'own' && payload.member_id && payload.member_id !== actorMemberId) {
        throw new AppApiError(403, 'FORBIDDEN', 'You can only log hours for yourself.');
      }
      const timeLogId = generatePrefixedId('TL-');
      const tlRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.time_log (
           time_log_id, member_id, task_id, bet_id, task_type, work_date, hours,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6::date, $7,
           $8, $9, $10, 'T',
           $11, $12
         ) RETURNING *`,
        [
          timeLogId,
          targetMember,
          payload.task_id ?? null,
          payload.bet_id ?? null,
          payload.task_type,
          payload.work_date,
          payload.hours,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'TIME_LOG';
      auditEntityId = timeLogId;
      createdRecordType = 'time_log';
      createdRecordId = timeLogId;
      auditAfter = tlRes.rows[0] ?? { time_log_id: timeLogId };
      break;
    }

    case 'create_network_partner': {
      const partnerId = generatePrefixedId('NP-');
      const ownerId =
        scope === 'own'
          ? actorMemberId
          : (payload.owner_member_id as string | null) ?? actorMemberId;
      const npRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.network_partner (
           partner_id, partner_type, name, owner_member_id, recruited_at, status,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5::date, $6,
           $7, $8, $9, 'T',
           $10, $11
         ) RETURNING *`,
        [
          partnerId,
          payload.partner_type,
          payload.name,
          ownerId,
          payload.recruited_at ?? null,
          payload.status ?? 'invited',
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      auditEntity = 'NETWORK_PARTNER';
      auditEntityId = partnerId;
      createdRecordType = 'network_partner';
      createdRecordId = partnerId;
      auditAfter = npRes.rows[0] ?? { partner_id: partnerId };
      break;
    }

    case 'record_referral': {
      const partnerId = String(payload.partner_id);
      const npRes = await client.query<{ owner_member_id: string | null; record_class: string }>(
        `SELECT owner_member_id, record_class FROM public.network_partner WHERE partner_id = $1 AND NOT is_deleted LIMIT 1`,
        [partnerId]
      );
      if (!npRes.rows[0]) {
        throw new AppApiError(404, 'NETWORK_PARTNER_NOT_FOUND', `Network partner ${partnerId} not found.`);
      }
      if (scope === 'own') {
        const ownsSponsor = await isSponsorOwner(client, String(payload.sponsor_id), actorMemberId, npRes.rows[0].record_class);
        if (npRes.rows[0].owner_member_id !== actorMemberId && !ownsSponsor) {
          throw new AppApiError(403, 'FORBIDDEN', 'You can only record referrals for your own network partners or sponsors.');
        }
      }
      let nextVersion = 1;
      let supersededId: string | null = null;
      const prevRes = await client.query<{ referral_id: string; version_no: number }>(
        `UPDATE public.referral SET valid_to = now()
          WHERE partner_id = $1 AND sponsor_id = $2 AND record_class = $3
            AND valid_to IS NULL AND NOT is_deleted
          RETURNING referral_id, version_no`,
        [partnerId, payload.sponsor_id, edition.recordClass]
      );
      if (prevRes.rows[0]) {
        supersededId = prevRes.rows[0].referral_id;
        nextVersion = Number(prevRes.rows[0].version_no ?? 1) + 1;
      }
      const referralId = generatePrefixedId('RF-');
      const rfRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.referral (
           referral_id, partner_id, sponsor_id, contact_id, campaign_id,
           commitment_status, committed_at, ask_sent_at, version_no,
           record_class, import_batch_id, source_ref, evidence_class,
           created_by, ai_action_id
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7::timestamptz, $8::timestamptz, $9,
           $10, $11, $12, 'T',
           $13, $14
         ) RETURNING *`,
        [
          referralId,
          partnerId,
          payload.sponsor_id,
          payload.contact_id ?? null,
          payload.campaign_id ?? null,
          payload.commitment_status,
          payload.committed_at ??
            (payload.commitment_status === 'committed' ? new Date().toISOString() : null),
          payload.ask_sent_at ?? null,
          nextVersion,
          edition.recordClass,
          batchId,
          sourceRef,
          actorMemberId,
          aiActionId,
        ]
      );
      if (supersededId) {
        await client.query(
          `UPDATE public.referral SET superseded_by = $1 WHERE referral_id = $2`,
          [referralId, supersededId]
        );
      }
      auditEntity = 'REFERRAL';
      auditEntityId = referralId;
      createdRecordType = 'sponsor';
      createdRecordId = String(payload.sponsor_id);
      auditAfter = rfRes.rows[0] ?? { referral_id: referralId };
      break;
    }
  }

  const nowIso = new Date().toISOString();
  const updActionRes = await client.query<Record<string, unknown>>(
    `UPDATE public.ai_action
        SET status = 'executed',
            confirmed_by = $1,
            confirmed_at = $2::timestamptz,
            executed_at = $2::timestamptz
      WHERE ai_action_id = $3
        AND status = 'proposed'
      RETURNING *`,
    [actorMemberId, nowIso, aiActionId]
  );
  if (!updActionRes.rows[0]) {
    throw new AppApiError(
      409,
      'ACTION_ALREADY_RESOLVED',
      `Action ${aiActionId} was already confirmed or cancelled.`
    );
  }

  const dataVersion = await fetchAppDataVersion(client);
  const auditEventId = await insertAuditEvent(client, {
    actorId: actorMemberId,
    channel: 'ai_action',
    aiActionId,
    entity: auditEntity,
    entityId: auditEntityId,
    operation: auditOp,
    after: auditAfter,
    dataVersion,
    recordClass: edition.recordClass,
    importBatchId: batchId,
    sourceRef,
  });

  return {
    action: {
      ...(updActionRes.rows[0] ?? {}),
      payload_hash: actionRow.payload_sha256,
      created_record_type: createdRecordType,
      created_record_id: createdRecordId,
      audit_event_id: auditEventId,
    },
    auditEventId,
    dataVersion,
    createdRecordType,
    createdRecordId,
  };
}

const ConfirmSingleBodySchema = z
  .object({
    payload_hash: z.string().trim().min(1).optional(),
    payloadHash: z.string().trim().min(1).optional(),
  })
  .optional();

export function createAiActionsRouter(
  config: ServerConfig,
  dbState: DatabasePoolState,
  authDeps: AuthDependencies
): Router {
  const router = Router();
  const authMiddleware = requireAuth(authDeps);
  const roleMiddleware = requireWriteRoles(authDeps);

  router.post(
    '/actions/:id/confirm',
    authMiddleware,
    roleMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const actionId = req.params.id;
      const actor = getVerifiedActor(req);
      const roles = req.resolvedMember?.roles ?? [];
      const bodyParsed = ConfirmSingleBodySchema.parse(
        req.body && typeof req.body === 'object' ? req.body : {}
      );
      const clientHash = bodyParsed?.payload_hash ?? bodyParsed?.payloadHash;

      const result = await runWriteTransaction(actor, dbState, async (client) => {
        const resRow = await client.query<StoredAiActionRow>(
          `SELECT ai_action_id, query_id, action_type, permission_level,
                  payload, payload_sha256, status, confirmed_by, confirmed_at,
                  executed_at, created_at, record_class, import_batch_id, source_ref, data_version
             FROM public.ai_action
            WHERE ai_action_id = $1 AND NOT is_deleted
            LIMIT 1
            FOR UPDATE`,
          [actionId]
        );
        const row = resRow.rows[0];
        if (!row) {
          throw new AppApiError(404, 'ACTION_NOT_FOUND', `AI action ${actionId} not found.`);
        }
        if (clientHash && clientHash !== row.payload_sha256) {
          throw new AppApiError(
            409,
            'PAYLOAD_HASH_MISMATCH',
            'Client payload hash does not match the server-stored proposal.'
          );
        }
        return executeAiActionInTransaction(
          client,
          row,
          actor.memberId,
          roles,
          config.editionIdDefault
        );
      });

      res.status(200).json({
        action: result.action,
        data_version: result.dataVersion,
        audit_event_id: result.auditEventId,
        message: 'Action confirmed and executed.',
      });
    })
  );

  router.post(
    '/actions/:id/cancel',
    authMiddleware,
    roleMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const actionId = req.params.id;
      const actor = getVerifiedActor(req);

      const result = await runWriteTransaction(actor, dbState, async (client) => {
        const resRow = await client.query<StoredAiActionRow>(
          `SELECT ai_action_id, status, payload_sha256
             FROM public.ai_action
            WHERE ai_action_id = $1 AND NOT is_deleted
            LIMIT 1
            FOR UPDATE`,
          [actionId]
        );
        const row = resRow.rows[0];
        if (!row) {
          throw new AppApiError(404, 'ACTION_NOT_FOUND', `AI action ${actionId} not found.`);
        }
        if (row.status !== 'proposed') {
          throw new AppApiError(
            409,
            'ACTION_NOT_PROPOSED',
            `Action ${actionId} is already "${row.status}".`
          );
        }
        const updRes = await client.query<Record<string, unknown>>(
          `UPDATE public.ai_action
              SET status = 'rejected'
            WHERE ai_action_id = $1 AND status = 'proposed'
            RETURNING *`,
          [actionId]
        );
        const dataVersion = await fetchAppDataVersion(client);
        return {
          action: {
            ...(updRes.rows[0] ?? {}),
            payload_hash: row.payload_sha256,
          },
          dataVersion,
        };
      });

      res.status(200).json({
        action: result.action,
        data_version: result.dataVersion,
        message: 'Proposed action cancelled.',
      });
    })
  );

  router.post(
    '/ai/actions/batch/:id/confirm',
    authMiddleware,
    roleMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const batchId = req.params.id;
      const actor = getVerifiedActor(req);
      const roles = req.resolvedMember?.roles ?? [];
      const sourceRefKey = `ai_batch:${batchId}`;

      const result = await runWriteTransaction(actor, dbState, async (client) => {
        const resRows = await client.query<StoredAiActionRow>(
          `SELECT ai_action_id, query_id, action_type, permission_level,
                  payload, payload_sha256, status, confirmed_by, confirmed_at,
                  executed_at, created_at, record_class, import_batch_id, source_ref, data_version
             FROM public.ai_action
            WHERE source_ref = $1 AND NOT is_deleted
            ORDER BY ai_action_id ASC
            FOR UPDATE`,
          [sourceRefKey]
        );
        if (resRows.rows.length === 0) {
          throw new AppApiError(
            404,
            'BATCH_NOT_FOUND',
            `Action batch ${batchId} not found.`
          );
        }
        const proposedRows = resRows.rows.filter((r) => r.status === 'proposed');
        if (proposedRows.length === 0) {
          throw new AppApiError(
            409,
            'BATCH_ALREADY_RESOLVED',
            `All actions in batch ${batchId} have already been resolved.`
          );
        }

        const batchActionIds = new Set(proposedRows.map((r) => r.ai_action_id));
        const appliedActions: Array<Record<string, unknown>> = [];
        const auditIds: string[] = [];
        let latestVersion = 0;

        for (const row of proposedRows) {
          const exec = await executeAiActionInTransaction(
            client,
            row,
            actor.memberId,
            roles,
            config.editionIdDefault,
            batchActionIds
          );
          appliedActions.push(exec.action);
          auditIds.push(exec.auditEventId);
          latestVersion = exec.dataVersion;
        }

        return {
          batchId,
          appliedCount: appliedActions.length,
          dataVersion: latestVersion,
          auditIds,
          actions: appliedActions,
        };
      });

      res.status(200).json({
        batch_id: result.batchId,
        applied_count: result.appliedCount,
        data_version: result.dataVersion,
        audit_ids: result.auditIds,
        actions: result.actions,
        message: `Applied ${result.appliedCount} confirmed actions atomically.`,
      });
    })
  );

  router.post(
    '/ai/actions/batch/:id/cancel',
    authMiddleware,
    roleMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const batchId = req.params.id;
      const actor = getVerifiedActor(req);
      const sourceRefKey = `ai_batch:${batchId}`;

      const result = await runWriteTransaction(actor, dbState, async (client) => {
        const resRows = await client.query<StoredAiActionRow>(
          `SELECT ai_action_id, status
             FROM public.ai_action
            WHERE source_ref = $1 AND NOT is_deleted
            ORDER BY ai_action_id ASC
            FOR UPDATE`,
          [sourceRefKey]
        );
        if (resRows.rows.length === 0) {
          throw new AppApiError(404, 'BATCH_NOT_FOUND', `Action batch ${batchId} not found.`);
        }
        const updRes = await client.query<Record<string, unknown>>(
          `UPDATE public.ai_action
              SET status = 'rejected'
            WHERE source_ref = $1 AND status = 'proposed' AND NOT is_deleted
            RETURNING *`,
          [sourceRefKey]
        );
        return updRes.rows;
      });

      res.status(200).json({
        batch_id: batchId,
        actions: result,
        message: `Cancelled ${result.length} proposed action(s) in batch.`,
      });
    })
  );

  return router;
}

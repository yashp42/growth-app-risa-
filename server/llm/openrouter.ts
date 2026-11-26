import {
  assertValidFreeOpenRouterModel,
  DEFAULT_GROQ_MODEL_FALLBACK,
  DEFAULT_GROQ_MODEL_PRIMARY,
  DEFAULT_OPENROUTER_MODEL_FALLBACK,
  DEFAULT_OPENROUTER_MODEL_PRIMARY,
  isVerifiedFreeOpenRouterModel,
  type ServerConfig,
} from '../config.ts';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_CHAT_TIMEOUT_MS = 60_000;
export const OPENROUTER_REVERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const OPENROUTER_QUOTA_RESET_NOTE = '05:30 IST';
export const QUOTA_EXHAUSTED_MESSAGE =
  "Today's free AI quota is used up; it resets at 05:30 IST.";

export interface OpenRouterToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenRouterModelCheck {
  model: string;
  exists: boolean;
  freePricing: boolean;
  toolsSupported: boolean;
  reasoningSupported: boolean;
  error?: string | null;
}

export interface ProviderHealthEntry {
  provider: 'groq' | 'openrouter';
  model: string;
  verified: boolean;
  tools: boolean;
  remaining_requests: number | null;
  remaining_tokens: number | null;
  error?: string | null;
}

export interface OpenRouterQuotaSnapshot {
  limit: number | null;
  remaining: number | null;
  used: number | null;
  exhausted: boolean;
  checked_at: string | null;
  reset_note: string;
  source: 'openrouter_key_api' | 'provider_chain' | 'unconfigured' | 'error';
  error?: string | null;
  remaining_tokens?: number | null;
}

export interface OpenRouterHealthSnapshot {
  provider: 'groq' | 'openrouter';
  orchestration_implemented: true;
  api_key_configured: boolean;
  groq_key_configured: boolean;
  model_configured: boolean;
  primary_model: string | null;
  fallback_model: string | null;
  free_tier_verified: boolean;
  tools_supported: boolean;
  fallback_verified: boolean;
  paid_fallback_allowed: false;
  auto_routing_allowed: false;
  last_verified_at: string | null;
  verification_error: string | null;
  primary_check: OpenRouterModelCheck | null;
  fallback_check: OpenRouterModelCheck | null;
  providers: ProviderHealthEntry[];
  quota: OpenRouterQuotaSnapshot;
}

export interface OpenRouterCompletionResult {
  provider: 'groq' | 'openrouter';
  model: string;
  usedFallback: boolean;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
  finishReason: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenRouterError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    status = 502,
    code = 'OPENROUTER_ERROR',
    retryable = false
  ) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export interface OpenRouterClientOptions {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  referer?: string;
  title?: string;
  startBackgroundRefresh?: boolean;
}

export interface OpenRouterClient {
  readonly primaryModel: string | null;
  readonly fallbackModel: string | null;
  readonly configValid: boolean;
  readonly validationError: string | null;
  verifyModels(): Promise<{
    free_tier_verified: boolean;
    tools_supported: boolean;
    fallback_verified: boolean;
    primary_check: OpenRouterModelCheck | null;
    fallback_check: OpenRouterModelCheck | null;
    providers: ProviderHealthEntry[];
    error: string | null;
  }>;
  fetchQuota(forceRefresh?: boolean): Promise<OpenRouterQuotaSnapshot>;
  decrementLocalQuotaEstimate(): void;
  getHealthSnapshot(refreshQuota?: boolean): Promise<OpenRouterHealthSnapshot>;
  createChatCompletion(params: {
    messages: OpenRouterChatMessage[];
    tools?: OpenRouterToolDefinition[];
    temperature?: number;
  }): Promise<OpenRouterCompletionResult>;
  stop(): void;
}

function toFiniteOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function parseRetryAfterMs(headerVal: string | null): number {
  if (!headerVal) return 0;
  const trimmed = headerVal.trim();
  const sec = Number(trimmed);
  if (Number.isFinite(sec) && sec > 0) {
    return Math.min(Math.round(sec * 1000), 5000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? Math.min(delta, 5000) : 0;
  }
  return 0;
}

function checkModelFromCatalog(
  modelId: string,
  catalog: ReadonlyArray<Record<string, unknown>>
): OpenRouterModelCheck {
  if (!isVerifiedFreeOpenRouterModel(modelId)) {
    return {
      model: modelId,
      exists: false,
      freePricing: false,
      toolsSupported: false,
      reasoningSupported: false,
      error: `Model "${modelId}" does not end with :free or is openrouter/auto.`,
    };
  }

  const entry = catalog.find((item) => String(item.id ?? '') === modelId);
  if (!entry) {
    return {
      model: modelId,
      exists: false,
      freePricing: false,
      toolsSupported: false,
      reasoningSupported: false,
      error: `Model "${modelId}" was not found in OpenRouter /models catalog.`,
    };
  }

  const pricing =
    entry.pricing && typeof entry.pricing === 'object'
      ? (entry.pricing as Record<string, unknown>)
      : {};
  const promptZero = String(pricing.prompt ?? '') === '0';
  const completionZero = String(pricing.completion ?? '') === '0';
  const freePricing = promptZero && completionZero;

  const supportedParams = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters.map((p) => String(p))
    : [];
  const toolsSupported = supportedParams.includes('tools');
  const reasoningSupported = supportedParams.includes('reasoning');

  return {
    model: modelId,
    exists: true,
    freePricing,
    toolsSupported,
    reasoningSupported,
    error: !freePricing
      ? `Model "${modelId}" has non-zero pricing.`
      : !toolsSupported
        ? `Model "${modelId}" does not support tools.`
        : null,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ChainEntry {
  provider: 'groq' | 'openrouter';
  model: string;
  baseUrl: string;
  apiKey: string | null;
}

export function createOpenRouterClient(
  config: ServerConfig,
  options: OpenRouterClientOptions = {}
): OpenRouterClient {
  const fetchFn = options.fetchFn ?? fetch;
  const sleepFn = options.sleepFn ?? defaultSleep;
  const referer =
    options.referer ?? process.env.APP_URL?.trim() ?? 'http://localhost:3000';
  const title = options.title ?? 'Sponsorship Growth Platform';

  const groqKey = config.groqApiKey ?? null;
  const groqPrimary = config.groqModel ?? DEFAULT_GROQ_MODEL_PRIMARY;
  const groqFallback = config.groqModelFallback ?? DEFAULT_GROQ_MODEL_FALLBACK;

  const rawPrimary =
    config.openrouterModel ??
    (config.readiness.openrouterFreeTierValid
      ? DEFAULT_OPENROUTER_MODEL_PRIMARY
      : null);
  const rawFallback =
    config.openrouterModelFallback ??
    (config.readiness.openrouterFallbackValid !== false
      ? DEFAULT_OPENROUTER_MODEL_FALLBACK
      : null);

  let openrouterPrimaryModel: string | null = null;
  let openrouterFallbackModel: string | null = null;
  let configValid = true;
  let validationError: string | null = null;

  try {
    if (!config.readiness.openrouterFreeTierValid || !rawPrimary) {
      throw new Error(
        config.validationErrors.find((e) => e.includes('OPENROUTER_MODEL')) ??
          'Primary OPENROUTER_MODEL is missing or violates the :free policy.'
      );
    }
    openrouterPrimaryModel = assertValidFreeOpenRouterModel(
      rawPrimary,
      'OPENROUTER_MODEL'
    );

    if (config.readiness.openrouterFallbackValid === false || !rawFallback) {
      throw new Error(
        config.validationErrors.find((e) =>
          e.includes('OPENROUTER_MODEL_FALLBACK')
        ) ??
          'Fallback OPENROUTER_MODEL_FALLBACK violates the :free policy.'
      );
    }
    openrouterFallbackModel = assertValidFreeOpenRouterModel(
      rawFallback,
      'OPENROUTER_MODEL_FALLBACK'
    );
  } catch (err) {
    configValid = false;
    validationError = err instanceof Error ? err.message : 'Invalid model config.';
  }

  const buildChain = (): ChainEntry[] => {
    const entries: ChainEntry[] = [];
    if (groqKey) {
      entries.push({
        provider: 'groq',
        model: groqPrimary,
        baseUrl: GROQ_BASE_URL,
        apiKey: groqKey,
      });
      if (groqFallback && groqFallback !== groqPrimary) {
        entries.push({
          provider: 'groq',
          model: groqFallback,
          baseUrl: GROQ_BASE_URL,
          apiKey: groqKey,
        });
      }
      if (config.openrouterApiKey && openrouterPrimaryModel) {
        entries.push({
          provider: 'openrouter',
          model: openrouterPrimaryModel,
          baseUrl: OPENROUTER_BASE_URL,
          apiKey: config.openrouterApiKey,
        });
      }
    } else {
      if (openrouterPrimaryModel) {
        entries.push({
          provider: 'openrouter',
          model: openrouterPrimaryModel,
          baseUrl: OPENROUTER_BASE_URL,
          apiKey: config.openrouterApiKey,
        });
      }
      if (
        openrouterFallbackModel &&
        openrouterFallbackModel !== openrouterPrimaryModel
      ) {
        entries.push({
          provider: 'openrouter',
          model: openrouterFallbackModel,
          baseUrl: OPENROUTER_BASE_URL,
          apiKey: config.openrouterApiKey,
        });
      }
    }
    return entries;
  };

  const primaryModel = groqKey ? groqPrimary : openrouterPrimaryModel;
  const fallbackModel = groqKey ? groqFallback : openrouterFallbackModel;

  let primaryCheck: OpenRouterModelCheck | null = null;
  let fallbackCheck: OpenRouterModelCheck | null = null;
  let freeTierVerified = false;
  let toolsSupported = false;
  let fallbackVerified = false;
  let lastVerifiedAt: string | null = null;
  let verificationError: string | null = validationError;
  let verifyInFlight: Promise<void> | null = null;

  const groqVerifiedMap = new Map<
    string,
    { verified: boolean; tools: boolean; error: string | null }
  >();
  const groqRateState = new Map<
    string,
    { remainingRequests: number | null; remainingTokens: number | null }
  >();
  if (groqKey) {
    groqRateState.set(groqPrimary, {
      remainingRequests: 1000,
      remainingTokens: null,
    });
    if (groqFallback && groqFallback !== groqPrimary) {
      groqRateState.set(groqFallback, {
        remainingRequests: 1000,
        remainingTokens: null,
      });
    }
  }

  let openrouterQuota: OpenRouterQuotaSnapshot = {
    limit: null,
    remaining: null,
    used: null,
    exhausted: false,
    checked_at: null,
    reset_note: OPENROUTER_QUOTA_RESET_NOTE,
    source: config.openrouterApiKey ? 'error' : 'unconfigured',
  };
  let quotaLastFetchedMs = 0;

  function buildProvidersHealth(): ProviderHealthEntry[] {
    const chain = buildChain();
    return chain.map((entry) => {
      if (entry.provider === 'groq') {
        const v = groqVerifiedMap.get(entry.model);
        const r = groqRateState.get(entry.model);
        return {
          provider: 'groq',
          model: entry.model,
          verified: v ? v.verified : false,
          tools: v ? v.tools : true,
          remaining_requests: r?.remainingRequests ?? null,
          remaining_tokens: r?.remainingTokens ?? null,
          ...(v?.error ? { error: v.error } : {}),
        };
      }
      const isOrPrimary = entry.model === openrouterPrimaryModel;
      const check = isOrPrimary ? primaryCheck : fallbackCheck;
      return {
        provider: 'openrouter',
        model: entry.model,
        verified: check
          ? check.exists && check.freePricing
          : isVerifiedFreeOpenRouterModel(entry.model),
        tools: check ? check.toolsSupported : true,
        remaining_requests: openrouterQuota.remaining,
        remaining_tokens: null,
        ...(check?.error ? { error: check.error } : {}),
      };
    });
  }

  async function verifyGroqModels(): Promise<void> {
    if (!groqKey) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetchFn(`${GROQ_BASE_URL}/models`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        throw new Error(`Groq /models returned HTTP ${res.status}`);
      }
      const payload = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
      };
      const catalog = Array.isArray(payload.data) ? payload.data : [];
      const ids = new Set(catalog.map((item) => String(item.id ?? '')));

      for (const modelId of [groqPrimary, groqFallback]) {
        if (!modelId) continue;
        const exists = ids.has(modelId);
        groqVerifiedMap.set(modelId, {
          verified: exists,
          tools: exists,
          error: exists
            ? null
            : `Model "${modelId}" was not found in Groq /models catalog.`,
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to verify Groq models.';
      for (const modelId of [groqPrimary, groqFallback]) {
        if (!modelId) continue;
        groqVerifiedMap.set(modelId, {
          verified: false,
          tools: false,
          error: msg,
        });
      }
    }
  }

  async function verifyModels(): Promise<{
    free_tier_verified: boolean;
    tools_supported: boolean;
    fallback_verified: boolean;
    primary_check: OpenRouterModelCheck | null;
    fallback_check: OpenRouterModelCheck | null;
    providers: ProviderHealthEntry[];
    error: string | null;
  }> {
    await verifyGroqModels();

    if (!configValid || !openrouterPrimaryModel || !openrouterFallbackModel) {
      freeTierVerified = false;
      toolsSupported = false;
      fallbackVerified = false;
      verificationError =
        validationError ?? 'Invalid or missing :free OpenRouter model ID.';
      return {
        free_tier_verified: false,
        tools_supported: false,
        fallback_verified: false,
        primary_check: primaryCheck,
        fallback_check: fallbackCheck,
        providers: buildProvidersHealth(),
        error: verificationError,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetchFn(`${OPENROUTER_BASE_URL}/models`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(config.openrouterApiKey
            ? { Authorization: `Bearer ${config.openrouterApiKey}` }
            : {}),
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        throw new Error(`OpenRouter /models returned HTTP ${res.status}`);
      }

      const payload = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
      };
      const catalog = Array.isArray(payload.data) ? payload.data : [];

      primaryCheck = checkModelFromCatalog(openrouterPrimaryModel, catalog);
      fallbackCheck = checkModelFromCatalog(openrouterFallbackModel, catalog);

      freeTierVerified =
        primaryCheck.exists &&
        primaryCheck.freePricing &&
        fallbackCheck.exists &&
        fallbackCheck.freePricing;
      toolsSupported =
        primaryCheck.toolsSupported && fallbackCheck.toolsSupported;
      fallbackVerified =
        fallbackCheck.exists &&
        fallbackCheck.freePricing &&
        fallbackCheck.toolsSupported;
      lastVerifiedAt = new Date().toISOString();

      const groqErrors = groqKey
        ? Array.from(groqVerifiedMap.values())
            .map((v) => v.error)
            .filter(Boolean)
        : [];
      verificationError =
        [...groqErrors, primaryCheck.error, fallbackCheck.error]
          .filter(Boolean)
          .join('; ') || null;
    } catch (err) {
      freeTierVerified = false;
      toolsSupported = false;
      fallbackVerified = false;
      verificationError =
        err instanceof Error ? err.message : 'Unable to verify OpenRouter models.';
    }

    return {
      free_tier_verified: freeTierVerified,
      tools_supported: toolsSupported,
      fallback_verified: fallbackVerified,
      primary_check: primaryCheck,
      fallback_check: fallbackCheck,
      providers: buildProvidersHealth(),
      error: verificationError,
    };
  }

  function combineChainQuota(): OpenRouterQuotaSnapshot {
    if (!groqKey) {
      return openrouterQuota;
    }
    let totalRemaining = 0;
    let totalTokens: number | null = null;
    for (const modelId of [groqPrimary, groqFallback]) {
      if (!modelId) continue;
      const state = groqRateState.get(modelId);
      if (state?.remainingRequests !== null && state?.remainingRequests !== undefined) {
        totalRemaining += Math.max(0, state.remainingRequests);
      }
      if (state?.remainingTokens !== null && state?.remainingTokens !== undefined) {
        totalTokens = (totalTokens ?? 0) + Math.max(0, state.remainingTokens);
      }
    }
    if (
      config.openrouterApiKey &&
      openrouterQuota.remaining !== null &&
      openrouterQuota.remaining > 0
    ) {
      totalRemaining += openrouterQuota.remaining;
    }
    const groqModelCount =
      groqFallback && groqFallback !== groqPrimary ? 2 : 1;
    const totalLimit =
      groqModelCount * 1000 + (openrouterQuota.limit ?? 0);
    return {
      limit: totalLimit,
      remaining: totalRemaining,
      used: Math.max(0, totalLimit - totalRemaining),
      exhausted: totalRemaining <= 0,
      checked_at: new Date().toISOString(),
      reset_note: OPENROUTER_QUOTA_RESET_NOTE,
      source: 'provider_chain',
      error: openrouterQuota.error ?? null,
      remaining_tokens: totalTokens,
    };
  }

  async function fetchQuota(
    forceRefresh = false
  ): Promise<OpenRouterQuotaSnapshot> {
    if (!config.openrouterApiKey) {
      openrouterQuota = {
        limit: null,
        remaining: null,
        used: null,
        exhausted: false,
        checked_at: null,
        reset_note: OPENROUTER_QUOTA_RESET_NOTE,
        source: 'unconfigured',
      };
      return combineChainQuota();
    }

    const now = Date.now();
    if (!forceRefresh && quotaLastFetchedMs > 0 && now - quotaLastFetchedMs < 20_000) {
      return combineChainQuota();
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetchFn(`${OPENROUTER_BASE_URL}/key`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.openrouterApiKey}`,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        throw new Error(`OpenRouter /key returned HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        data?: Record<string, unknown>;
      } & Record<string, unknown>;
      const data =
        body.data && typeof body.data === 'object' ? body.data : body;

      const limit =
        toFiniteOrNull(data.limit) ??
        toFiniteOrNull(data.free_limit) ??
        (data.is_free_tier === true ? 50 : null);
      const remainingRaw =
        toFiniteOrNull(data.limit_remaining) ??
        toFiniteOrNull(data.remaining);
      const usedRaw =
        toFiniteOrNull(data.usage_daily) ??
        toFiniteOrNull(data.usage) ??
        toFiniteOrNull(data.used);

      const used =
        usedRaw ??
        (limit !== null && remainingRaw !== null
          ? Math.max(0, limit - remainingRaw)
          : null);
      const remaining =
        remainingRaw ??
        (limit !== null && used !== null ? Math.max(0, limit - used) : null);

      openrouterQuota = {
        limit,
        remaining,
        used,
        exhausted: remaining !== null && remaining <= 0,
        checked_at: new Date().toISOString(),
        reset_note: OPENROUTER_QUOTA_RESET_NOTE,
        source: 'openrouter_key_api',
        error: null,
      };
      quotaLastFetchedMs = now;
    } catch (err) {
      openrouterQuota = {
        ...openrouterQuota,
        checked_at: new Date().toISOString(),
        source: 'error',
        error:
          err instanceof Error
            ? err.message
            : 'Failed to retrieve OpenRouter key quota.',
      };
    }

    return combineChainQuota();
  }

  function decrementLocalQuotaEstimate(provider: 'groq' | 'openrouter' = groqKey ? 'groq' : 'openrouter', model?: string): void {
    if (provider === 'groq' && model) {
      const cur = groqRateState.get(model);
      if (cur && cur.remainingRequests !== null && cur.remainingRequests > 0) {
        groqRateState.set(model, {
          ...cur,
          remainingRequests: Math.max(0, cur.remainingRequests - 1),
        });
      }
      return;
    }
    if (openrouterQuota.remaining !== null && openrouterQuota.remaining > 0) {
      const nextRemaining = Math.max(0, openrouterQuota.remaining - 1);
      openrouterQuota = {
        ...openrouterQuota,
        remaining: nextRemaining,
        used:
          openrouterQuota.used !== null
            ? openrouterQuota.used + 1
            : openrouterQuota.limit !== null
              ? Math.max(0, openrouterQuota.limit - nextRemaining)
              : null,
        exhausted: nextRemaining <= 0,
      };
    }
  }

  async function callSingleEntry(
    entry: ChainEntry,
    messages: OpenRouterChatMessage[],
    tools: OpenRouterToolDefinition[] | undefined,
    temperature: number,
    reasoningSupported: boolean
  ): Promise<OpenRouterCompletionResult> {
    if (!entry.apiKey) {
      throw new OpenRouterError(
        `${entry.provider.toUpperCase()} API key is not configured on the server.`,
        503,
        entry.provider === 'groq' ? 'GROQ_UNCONFIGURED' : 'OPENROUTER_UNCONFIGURED',
        false
      );
    }

    if (entry.provider === 'openrouter') {
      // Strict cost guard: never auto-route, never use non-:free slugs
      assertValidFreeOpenRouterModel(entry.model, 'model');
    }

    const payload: Record<string, unknown> = {
      model: entry.model,
      messages,
      temperature,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
      payload.parallel_tool_calls = true;
    }

    if (entry.provider === 'openrouter' && reasoningSupported) {
      payload.reasoning = { effort: 'low' };
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      OPENROUTER_CHAT_TIMEOUT_MS
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${entry.apiKey}`,
    };
    if (entry.provider === 'openrouter') {
      headers['HTTP-Referer'] = referer;
      headers['X-Title'] = title;
    }

    let res: Response;
    try {
      res = await fetchFn(`${entry.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new OpenRouterError(
        isAbort
          ? 'Growth Analyst timed out waiting for the model response (60s).'
          : err instanceof Error
            ? err.message
            : `Network error calling ${entry.provider}.`,
        504,
        isAbort ? 'OPENROUTER_TIMEOUT' : 'OPENROUTER_NETWORK_ERROR',
        !isAbort
      );
    } finally {
      clearTimeout(timer);
    }

    if (entry.provider === 'groq') {
      const remReq = toFiniteOrNull(
        res.headers.get('x-ratelimit-remaining-requests')
      );
      const remTok = toFiniteOrNull(
        res.headers.get('x-ratelimit-remaining-tokens')
      );
      const prev = groqRateState.get(entry.model) ?? {
        remainingRequests: 1000,
        remainingTokens: null,
      };
      groqRateState.set(entry.model, {
        remainingRequests:
          res.status === 429 && remReq === null
            ? 0
            : (remReq ?? prev.remainingRequests),
        remainingTokens: remTok ?? prev.remainingTokens,
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const retryable = res.status === 429 || res.status >= 500;
      const retryAfterMs = retryable
        ? parseRetryAfterMs(res.headers.get('retry-after'))
        : 0;
      if (retryAfterMs > 0) {
        await sleepFn(retryAfterMs);
      }
      throw new OpenRouterError(
        `${entry.provider} returned HTTP ${res.status}${errText ? `: ${errText.slice(0, 220)}` : ''}`,
        res.status,
        res.status === 429 ? 'OPENROUTER_RATE_LIMIT' : 'OPENROUTER_UPSTREAM_ERROR',
        retryable
      );
    }

    const json = (await res.json()) as {
      model?: string;
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: OpenRouterToolCall[];
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = json.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      throw new OpenRouterError(
        `${entry.provider} returned an empty response with no message.`,
        502,
        'OPENROUTER_EMPTY_RESPONSE',
        true
      );
    }

    if (entry.provider === 'openrouter') {
      decrementLocalQuotaEstimate('openrouter');
    } else if (
      res.headers.get('x-ratelimit-remaining-requests') === null
    ) {
      decrementLocalQuotaEstimate('groq', entry.model);
    }

    return {
      provider: entry.provider,
      model: json.model ?? entry.model,
      usedFallback: false,
      message: {
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : null,
        tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls : undefined,
      },
      finishReason: choice?.finish_reason ?? null,
      usage: json.usage,
    };
  }

  async function createChatCompletion(params: {
    messages: OpenRouterChatMessage[];
    tools?: OpenRouterToolDefinition[];
    temperature?: number;
  }): Promise<OpenRouterCompletionResult> {
    if (!configValid || !openrouterPrimaryModel || !openrouterFallbackModel) {
      throw new OpenRouterError(
        validationError ?? 'OpenRouter model policy validation failed.',
        503,
        'INVALID_MODEL_POLICY',
        false
      );
    }

    if (verifyInFlight) {
      await verifyInFlight.catch(() => undefined);
    }

    const quota = await fetchQuota(false);
    if (quota.exhausted) {
      throw new OpenRouterError(
        QUOTA_EXHAUSTED_MESSAGE,
        429,
        'AI_QUOTA_EXHAUSTED',
        false
      );
    }

    const chain = buildChain();
    const temperature = params.temperature ?? 0;

    let lastErr: unknown = null;
    for (let i = 0; i < chain.length; i += 1) {
      const entry = chain[i];
      const reasoningSupported =
        entry.provider === 'openrouter'
          ? entry.model === openrouterPrimaryModel
            ? (primaryCheck?.reasoningSupported ?? true)
            : (fallbackCheck?.reasoningSupported ?? true)
          : false;
      try {
        const result = await callSingleEntry(
          entry,
          params.messages,
          params.tools,
          temperature,
          reasoningSupported
        );
        return {
          ...result,
          usedFallback: i > 0,
        };
      } catch (err) {
        lastErr = err;
        const canContinue =
          err instanceof OpenRouterError &&
          (err.status === 429 || err.status >= 500) &&
          err.status !== 504 &&
          i + 1 < chain.length;
        if (!canContinue) {
          throw err;
        }
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new OpenRouterError('All AI providers in chain failed.', 502);
  }

  async function getHealthSnapshot(
    refreshQuota = false
  ): Promise<OpenRouterHealthSnapshot> {
    const quota = await fetchQuota(refreshQuota);
    const providers = buildProvidersHealth();
    const groqVerifiedAll =
      !groqKey ||
      providers
        .filter((p) => p.provider === 'groq')
        .every((p) => (lastVerifiedAt !== null ? p.verified : true));
    return {
      provider: groqKey ? 'groq' : 'openrouter',
      orchestration_implemented: true,
      api_key_configured: Boolean(groqKey || config.openrouterApiKey),
      groq_key_configured: Boolean(groqKey),
      model_configured: Boolean(primaryModel),
      primary_model: primaryModel,
      fallback_model: fallbackModel,
      free_tier_verified:
        configValid &&
        config.readiness.openrouterFreeTierValid &&
        groqVerifiedAll &&
        (lastVerifiedAt !== null ? freeTierVerified : true),
      tools_supported: lastVerifiedAt !== null ? toolsSupported : true,
      fallback_verified:
        configValid &&
        config.readiness.openrouterFallbackValid !== false &&
        (lastVerifiedAt !== null ? fallbackVerified : true),
      paid_fallback_allowed: false,
      auto_routing_allowed: false,
      last_verified_at: lastVerifiedAt,
      verification_error: verificationError,
      primary_check: primaryCheck,
      fallback_check: fallbackCheck,
      providers,
      quota,
    };
  }

  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  if (options.startBackgroundRefresh !== false) {
    verifyInFlight = verifyModels().then(() => undefined);
    void fetchQuota(true);
    intervalHandle = setInterval(() => {
      void verifyModels();
    }, OPENROUTER_REVERIFY_INTERVAL_MS);
    if (typeof intervalHandle.unref === 'function') {
      intervalHandle.unref();
    }
  }

  return {
    primaryModel,
    fallbackModel,
    configValid,
    validationError,
    verifyModels,
    fetchQuota,
    decrementLocalQuotaEstimate: () => decrementLocalQuotaEstimate(),
    getHealthSnapshot,
    createChatCompletion,
    stop() {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },
  };
}

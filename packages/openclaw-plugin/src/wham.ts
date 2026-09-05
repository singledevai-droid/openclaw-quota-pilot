import type {
  CredentialRecord,
  PilotConfig,
  QuotaProfile,
  QuotaWindow,
} from "./types.js";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

type RawWindow = {
  used_percent?: unknown;
  limit_window_seconds?: unknown;
  reset_after_seconds?: unknown;
  reset_at?: unknown;
};

type WhamResponse = {
  plan_type?: unknown;
  rate_limit?: {
    limit_reached?: unknown;
    primary_window?: RawWindow;
    secondary_window?: RawWindow;
  };
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function parseQuotaWindow(raw: RawWindow | undefined, now: number): QuotaWindow | null {
  if (!raw) return null;
  const used = finiteNumber(raw.used_percent);
  const resetAfter = finiteNumber(raw.reset_after_seconds);
  const resetAtSeconds = finiteNumber(raw.reset_at);
  const resetAt =
    resetAtSeconds !== null && resetAtSeconds > 0
      ? Math.round(resetAtSeconds * 1000)
      : resetAfter !== null && resetAfter >= 0
        ? now + Math.round(resetAfter * 1000)
        : null;
  return {
    usedPercent: used === null ? null : clampPercent(used),
    remainingPercent: used === null ? null : clampPercent(100 - used),
    resetAt,
    resetAfterSeconds: resetAfter === null ? null : Math.max(0, Math.round(resetAfter)),
    windowSeconds: finiteNumber(raw.limit_window_seconds),
  };
}

function errorCode(status: number): string {
  if (status === 401) return "oauth-token-expired";
  if (status === 403) return "account-forbidden";
  if (status === 429) return "usage-endpoint-rate-limited";
  return `usage-http-${status}`;
}

function profileLabel(credential: CredentialRecord, config: PilotConfig): string {
  return (
    config.profileAliases[credential.profileId] ??
    (credential.email ? config.profileAliases[credential.email] : undefined) ??
    credential.email ??
    credential.profileId.replace(/^openai:/, "")
  );
}

export async function fetchQuotaProfile(
  credential: CredentialRecord,
  config: PilotConfig,
  now = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<QuotaProfile> {
  const expired = credential.expiresAt !== null && credential.expiresAt <= now;
  const base = {
    profileId: credential.profileId,
    label: profileLabel(credential, config),
    email: credential.email,
    provider: "openai" as const,
    tokenExpiresAt: credential.expiresAt,
    checkedAt: now,
  };

  if (expired) {
    return {
      ...base,
      authStatus: "expired",
      plan: credential.planHint,
      fiveHour: null,
      weekly: null,
      limitReached: false,
      usable: false,
      score: null,
      error: "oauth-token-expired",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credential.accessToken}`,
      Accept: "application/json",
      originator: "openclaw",
      "User-Agent": "openclaw-quota-pilot/0.2.1",
    };
    if (credential.accountId) headers["ChatGPT-Account-Id"] = credential.accountId;

    const response = await fetchFn(USAGE_URL, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ...base,
        authStatus: response.status === 401 ? "expired" : "ok",
        plan: credential.planHint,
        fiveHour: null,
        weekly: null,
        limitReached: response.status === 429,
        usable: false,
        score: null,
        error: errorCode(response.status),
      };
    }

    const payload = (await response.json()) as WhamResponse;
    const fiveHour = parseQuotaWindow(payload.rate_limit?.primary_window, now);
    const weekly = parseQuotaWindow(payload.rate_limit?.secondary_window, now);
    const missingWindows = fiveHour === null || weekly === null;
    const exhausted =
      payload.rate_limit?.limit_reached === true ||
      fiveHour?.remainingPercent === 0 ||
      weekly?.remainingPercent === 0;

    return {
      ...base,
      authStatus: "ok",
      plan:
        typeof payload.plan_type === "string" ? payload.plan_type : credential.planHint,
      fiveHour,
      weekly,
      limitReached: exhausted,
      usable: !missingWindows && !exhausted,
      score: null,
      error: missingWindows ? "usage-windows-missing" : null,
    };
  } catch (error) {
    return {
      ...base,
      authStatus: "ok",
      plan: credential.planHint,
      fiveHour: null,
      weekly: null,
      limitReached: false,
      usable: false,
      score: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "usage-request-timeout"
          : "usage-request-failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAllQuotaProfiles(
  credentials: CredentialRecord[],
  config: PilotConfig,
  fetchFn: typeof fetch = fetch,
): Promise<QuotaProfile[]> {
  const checkedAt = Date.now();
  return Promise.all(
    credentials.map((credential) =>
      fetchQuotaProfile(credential, config, checkedAt, fetchFn),
    ),
  );
}

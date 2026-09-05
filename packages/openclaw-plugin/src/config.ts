import type { PilotConfig, RouteTarget } from "./types.js";

const DEFAULTS: PilotConfig = {
  agentId: "main",
  credentialOwnerAgentId: "main",
  sessionKey: "agent:main:main",
  pollIntervalSeconds: 30,
  reservePercent: 15,
  switchHysteresisPercent: 5,
  requestTimeoutMs: 4000,
  autoEnabledByDefault: false,
  openclawExecutable: "openclaw",
  profileAliases: {},
};

function numberInRange(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function profileAliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].trim().length > 0 &&
          typeof entry[1] === "string" &&
          entry[1].trim().length > 0,
      )
      .map(([key, label]) => [key.trim(), label.trim().slice(0, 80)]),
  );
}

export function parsePilotConfig(raw?: Record<string, unknown>): PilotConfig {
  const agentId = nonEmptyString(raw?.agentId, DEFAULTS.agentId);
  return {
    agentId,
    credentialOwnerAgentId: nonEmptyString(raw?.credentialOwnerAgentId, agentId),
    sessionKey: nonEmptyString(raw?.sessionKey, `agent:${agentId}:main`),
    pollIntervalSeconds: Math.round(
      numberInRange(raw?.pollIntervalSeconds, DEFAULTS.pollIntervalSeconds, 30, 3600),
    ),
    reservePercent: numberInRange(
      raw?.reservePercent,
      DEFAULTS.reservePercent,
      0,
      100,
    ),
    switchHysteresisPercent: numberInRange(
      raw?.switchHysteresisPercent,
      DEFAULTS.switchHysteresisPercent,
      0,
      50,
    ),
    requestTimeoutMs: Math.round(
      numberInRange(raw?.requestTimeoutMs, DEFAULTS.requestTimeoutMs, 1000, 15000),
    ),
    autoEnabledByDefault:
      typeof raw?.autoEnabledByDefault === "boolean"
        ? raw.autoEnabledByDefault
        : DEFAULTS.autoEnabledByDefault,
    openclawExecutable: nonEmptyString(
      raw?.openclawExecutable,
      DEFAULTS.openclawExecutable,
    ),
    profileAliases: profileAliases(raw?.profileAliases),
  };
}

export function normalizeRouteTarget(
  params: Record<string, unknown> | undefined,
  config: PilotConfig,
): RouteTarget {
  const agentId = nonEmptyString(params?.agentId, config.agentId);
  return {
    agentId,
    sessionKey: nonEmptyString(params?.sessionKey, `agent:${agentId}:main`),
  };
}

export function routeKey(target: RouteTarget): string {
  return `${target.agentId}::${target.sessionKey}`;
}

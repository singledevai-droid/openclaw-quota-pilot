import type { PilotStatus, RouteTarget } from "./types.js";

export const STATUS_CACHE_SCHEMA_VERSION = 4;

export function restoreStatusCache(
  saved: Record<string, PilotStatus>,
  savedVersion: number | undefined,
): Map<string, PilotStatus> {
  if (savedVersion !== STATUS_CACHE_SCHEMA_VERSION) return new Map();
  return new Map(Object.entries(saved));
}

export function targetCacheKey(target: RouteTarget): string {
  return `${target.agentId}::${target.sessionKey}`;
}

export function statusCacheKey(status: PilotStatus): string {
  return `${status.agentId}::${status.sessionKey}`;
}

export function cachedStatusForTarget(
  cache: ReadonlyMap<string, PilotStatus>,
  target: RouteTarget,
): PilotStatus | null {
  return cache.get(targetCacheKey(target)) ?? null;
}

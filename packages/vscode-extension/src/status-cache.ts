import type { PilotStatus, RouteTarget } from "./types.js";

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

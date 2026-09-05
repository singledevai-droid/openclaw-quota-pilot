import type { RouteTarget } from "./types.js";

export function routeTargetFromSessionKey(sessionKey: string): RouteTarget | null {
  const match = /^agent:([^:]+):/.exec(sessionKey.trim());
  if (!match) return null;
  return { agentId: match[1]!, sessionKey: sessionKey.trim() };
}

export function applyManagedSessionProfile(
  entry: Record<string, unknown>,
  profileId: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...entry,
    authProfileOverride: profileId,
    // OpenClaw is allowed to rotate or discard an `auto` override while it
    // resolves a run. Quota Pilot has already made that routing decision, so
    // persist it as a hard runtime selection and keep AUTO ownership in the
    // plugin's separate route state.
    authProfileOverrideSource: "user",
  };
  delete next.authProfileOverrideCompactionCount;
  return next;
}

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

/** A saved override is selection, not proof of which account ran a request. */
export function runtimeAuthEvidence(entry: Record<string, unknown> | undefined, selected: string | null) {
  const bindings = entry?.cliSessionBindings as Record<string, { sessionId?: string; authProfileId?: string }> | undefined;
  const ids = [...new Set(Object.entries(bindings ?? {})
    .filter(([backend, binding]) => ["codex", "codex-cli", "openai"].includes(backend) && binding.sessionId && binding.authProfileId?.startsWith("openai:"))
    .map(([, binding]) => binding.authProfileId!))];
  const effectiveProfileId = ids.length === 1 ? ids[0]! : null;
  return {
    effectiveProfileId,
    runtimeAuthStatus: effectiveProfileId === null ? "unverified" as const
      : effectiveProfileId === selected ? "recorded" as const : "pending" as const,
  };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildOAuthLoginCommand(
  executable: string,
  agentId: string,
  profileId?: string,
): string {
  return [
    executable,
    "models",
    "auth",
    "--agent",
    agentId,
    "login",
    "--provider",
    "openai",
    "--method",
    "oauth",
    ...(profileId ? ["--profile-id", profileId] : []),
  ]
    .map(shellQuote)
    .join(" ");
}

export function needsOAuthLogin(profile: { authStatus: string; error: string | null }): boolean {
  return profile.authStatus === "expired" ||
    profile.error === "oauth-token-expired" ||
    profile.error === "profile-identity-mismatch";
}

export function resolveOAuthAgentId(
  credentialOwnerAgentId: string | undefined,
  fallbackAgentId: string,
): string {
  return credentialOwnerAgentId?.trim() || fallbackAgentId;
}

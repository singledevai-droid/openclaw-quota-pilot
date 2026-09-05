export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildOAuthLoginCommand(
  executable: string,
  agentId: string,
  profileId: string,
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
    "--profile-id",
    profileId,
  ]
    .map(shellQuote)
    .join(" ");
}

export function resolveOAuthAgentId(
  credentialOwnerAgentId: string | undefined,
  fallbackAgentId: string,
): string {
  return credentialOwnerAgentId?.trim() || fallbackAgentId;
}

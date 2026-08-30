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
